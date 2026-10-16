import { readFile, rename, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { problemWith } from './credentialsYaml.ts';
import { decrypt, encrypt, InvalidKeyError, InvalidMessageError } from './encryptedFile.ts';

/** A credentials file could not be read or saved; the message says why, for the person editing it. */
export class CredentialsError extends Error {}

/** A key Rails would try for a credentials file. */
export interface KeySource {
  /** `RAILS_MASTER_KEY`, or the key file's path from the app root. */
  label: string;
  /** Returns the key, or undefined when this source has none. */
  read(): Promise<string | undefined>;
}

/** A decrypted credentials file and the key that decrypted it. */
export interface Credentials {
  plaintext: Buffer;
  key: string;
}

/** Whether `path`, with forward slashes, is `config/credentials.yml.enc` or `config/credentials/<env>.yml.enc`. */
export function isCredentialsPath(path: string): boolean {
  return /\/config\/(?:credentials\/[^/]+|credentials)\.yml\.enc$/.test(path);
}

/** Decrypts the credentials file at `contentPath` with the first of its keys that fits. */
export async function readCredentials(contentPath: string, env = process.env): Promise<Credentials> {
  const message = await readFile(contentPath, 'utf8');
  const { label } = locate(contentPath);
  const sources = keySources(contentPath, env);
  const tried: string[] = [];
  for (const source of sources) {
    const key = await source.read();
    if (key === undefined) continue;
    try {
      return { plaintext: decrypt(message, key), key };
    } catch (error) {
      if (error instanceof InvalidMessageError) throw new CredentialsError(`${label} is ${error.message}.`);
      if (!(error instanceof InvalidKeyError)) throw error;
      tried.push(source.label);
    }
  }
  if (tried.length === 0) {
    const files = sources.slice(1).map((source) => source.label);
    throw new CredentialsError(`No key for ${label}. Set RAILS_MASTER_KEY, or add ${or(files)}.`);
  }
  throw new CredentialsError(`Couldn't decrypt ${label} with ${or(tried)}. Perhaps the key is wrong?`);
}

/** Encrypts `plaintext` into `contentPath` with the key that decrypts it now; returns whether the file changed. */
export async function writeCredentials(contentPath: string, plaintext: Buffer, env = process.env): Promise<boolean> {
  const problem = problemWith(plaintext.toString('utf8'));
  if (problem) throw new CredentialsError(`Not saved, because Rails couldn't load it: ${problem}.`);
  const current = await readCredentials(contentPath, env);
  if (current.plaintext.equals(plaintext)) return false;
  const temporary = `${contentPath}.tmp`;
  await writeFile(temporary, encrypt(plaintext, current.key));
  await rename(temporary, contentPath);
  return true;
}

/** The keys Rails would use for the credentials file at `contentPath`, in the order it looks for them. */
export function keySources(contentPath: string, env = process.env): KeySource[] {
  const { config, environment } = locate(contentPath);
  const files = environment ? [`credentials/${environment}.key`, 'master.key'] : ['master.key'];
  return [
    { label: 'RAILS_MASTER_KEY', read: async () => env.RAILS_MASTER_KEY || undefined },
    ...files.map((file) => ({
      label: `config/${file}`,
      read: async () => (await readIfExists(join(config, file)))?.trim(),
    })),
  ];
}

/** Splits a credentials path into its config directory, its environment, and its path from the app root. */
function locate(contentPath: string): { config: string; environment?: string; label: string } {
  const directory = dirname(contentPath);
  if (basename(directory) !== 'credentials') return { config: directory, label: 'config/credentials.yml.enc' };
  const environment = basename(contentPath, '.yml.enc');
  return { config: dirname(directory), environment, label: `config/credentials/${environment}.yml.enc` };
}

/** Reads a file, or returns undefined when there is none. */
async function readIfExists(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Joins names as prose: "a", "a or b", "a, b or c". */
function or(names: string[]): string {
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names.at(-1)}` : names[0];
}
