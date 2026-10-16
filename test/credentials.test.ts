import assert from 'node:assert/strict';
import { cp, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import {
  CredentialsError,
  isCredentialsPath,
  keySources,
  readCredentials,
  writeCredentials,
} from '../src/credentials.ts';

const fixtures = new URL('fixtures/app', import.meta.url);
const noKey = {};
let app: string;
let path: (name: string) => string;

beforeEach(async () => {
  app = await mkdtemp(join(tmpdir(), 'rails-credentials-'));
  await cp(fixtures, app, { recursive: true });
  path = (name) => join(app, 'config', name);
});

afterEach(() => rm(app, { recursive: true }));

const text = async (name: string, env = noKey) => (await readCredentials(path(name), env)).plaintext.toString();

describe('isCredentialsPath', () => {
  it('matches the top-level file and each environment file', () => {
    assert.ok(isCredentialsPath('/app/config/credentials.yml.enc'));
    assert.ok(isCredentialsPath('/app/config/credentials/dev.yml.enc'));
  });

  it('does not match other encrypted files or deeper paths', () => {
    assert.ok(!isCredentialsPath('/app/config/secrets.yml.enc'));
    assert.ok(!isCredentialsPath('/app/config/credentials/old/dev.yml.enc'));
    assert.ok(!isCredentialsPath('/app/config/credentials/dev.yml'));
  });
});

describe('keySources', () => {
  it('tries RAILS_MASTER_KEY, the environment key, then master.key for an environment file', () => {
    const labels = keySources('/app/config/credentials/dev.yml.enc', noKey).map((source) => source.label);
    assert.deepEqual(labels, ['RAILS_MASTER_KEY', 'config/credentials/dev.key', 'config/master.key']);
  });

  it('tries RAILS_MASTER_KEY, then master.key for the top-level file', () => {
    const labels = keySources('/app/config/credentials.yml.enc', noKey).map((source) => source.label);
    assert.deepEqual(labels, ['RAILS_MASTER_KEY', 'config/master.key']);
  });
});

describe('readCredentials', () => {
  it('decrypts the top-level file with master.key', async () => {
    assert.match(await text('credentials.yml.enc'), /top-level-secret/);
  });

  it('decrypts an environment file with its own key', async () => {
    assert.match(await text('credentials/dev.yml.enc'), /dev-secret/);
  });

  it('decrypts an environment file with master.key when it has no key of its own', async () => {
    assert.match(await text('credentials/stage.yml.enc'), /stage-token/);
  });

  it('decrypts a file Rails wrote as a UTF-8 string', async () => {
    assert.match(await text('credentials/qa.yml.enc'), /greeting: über/);
  });

  it('uses RAILS_MASTER_KEY when it fits', async () => {
    const key = (await readFile(path('credentials/dev.key'), 'utf8')).trim();
    await rm(path('credentials/dev.key'));
    assert.match(await text('credentials/dev.yml.enc', { RAILS_MASTER_KEY: key }), /dev-secret/);
  });

  it('moves past RAILS_MASTER_KEY when it does not fit', async () => {
    assert.match(await text('credentials/dev.yml.enc', { RAILS_MASTER_KEY: 'f'.repeat(32) }), /dev-secret/);
  });

  it('names the keys it looked for when there are none', async () => {
    await rm(path('credentials/dev.key'));
    await rm(path('master.key'));
    await assert.rejects(
      text('credentials/dev.yml.enc'),
      new CredentialsError(
        'No key for config/credentials/dev.yml.enc. Set RAILS_MASTER_KEY, or add config/credentials/dev.key or config/master.key.',
      ),
    );
  });

  it('names the keys it tried when none of them fit', async () => {
    await rm(path('credentials/dev.key'));
    await assert.rejects(
      text('credentials/dev.yml.enc', { RAILS_MASTER_KEY: 'f'.repeat(32) }),
      new CredentialsError(
        "Couldn't decrypt config/credentials/dev.yml.enc with RAILS_MASTER_KEY or config/master.key. Perhaps the key is wrong?",
      ),
    );
  });
});

describe('writeCredentials', () => {
  it('encrypts the new contents with the key that decrypted the file', async () => {
    assert.equal(await writeCredentials(path('credentials/stage.yml.enc'), Buffer.from('api_token: rotated\n'), noKey), true);
    assert.equal(await text('credentials/stage.yml.enc'), 'api_token: rotated\n');
    await rm(path('master.key'));
    await assert.rejects(text('credentials/stage.yml.enc'), CredentialsError);
  });

  it('leaves no temporary file behind', async () => {
    await writeCredentials(path('credentials/dev.yml.enc'), Buffer.from('a: 1\n'), noKey);
    assert.deepEqual((await readdir(path('credentials'))).filter((name) => name.endsWith('.tmp')), []);
  });

  it('leaves the file alone when the contents have not changed', async () => {
    const before = await readFile(path('credentials/dev.yml.enc'), 'utf8');
    const unchanged = Buffer.from(await text('credentials/dev.yml.enc'));
    assert.equal(await writeCredentials(path('credentials/dev.yml.enc'), unchanged, noKey), false);
    assert.equal(await readFile(path('credentials/dev.yml.enc'), 'utf8'), before);
  });

  it('refuses contents Rails could not load, and leaves the file alone', async () => {
    const before = await readFile(path('credentials/dev.yml.enc'), 'utf8');
    await assert.rejects(
      writeCredentials(path('credentials/dev.yml.enc'), Buffer.from('aws:\n  yes: 1\n'), noKey),
      new CredentialsError(
        "Not saved, because Rails couldn't load it: line 2: Rails can't use yes as a key. Quote it to make it a string.",
      ),
    );
    assert.equal(await readFile(path('credentials/dev.yml.enc'), 'utf8'), before);
  });
});
