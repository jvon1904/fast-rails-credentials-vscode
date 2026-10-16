// A Rails encrypted file, as ActiveSupport::EncryptedFile writes it (Rails 5.2 and later).
//
// The key file holds 32 hex characters: a 128-bit AES key.
// The encrypted file holds base64(ciphertext)--base64(iv)--base64(auth_tag): AES-128-GCM
// with a 12-byte IV and a 16-byte tag, over the plaintext dumped as a Ruby Marshal String.

import { createCipheriv, createDecipheriv, randomBytes, type DecipherGCM } from 'node:crypto';
import { dumpString, loadString } from './marshal.ts';

const CIPHER = 'aes-128-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const SEPARATOR = '--';

/** The contents are not a Rails encrypted file. */
export class InvalidMessageError extends Error {}

/** The key is not 32 hex characters, or does not decrypt the file. */
export class InvalidKeyError extends Error {}

/** Decrypts the contents of an encrypted file with a hex key. */
export function decrypt(message: string, key: string): Buffer {
  const parts = message.trim().split(SEPARATOR).map((part) => Buffer.from(part, 'base64'));
  if (parts.length !== 3) throw new InvalidMessageError('not a Rails encrypted file');
  const [data, iv, authTag] = parts;
  if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
    throw new InvalidMessageError('not a Rails encrypted file');
  }
  const decipher = createDecipheriv(CIPHER, keyBytes(key), iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTag);
  try {
    return loadString(authenticate(decipher, data));
  } catch (error) {
    if (error instanceof InvalidKeyError) throw error;
    throw new InvalidMessageError(`not a Rails encrypted file: ${(error as Error).message}`);
  }
}

/** Encrypts `plaintext` with a hex key into the contents of an encrypted file. */
export function encrypt(plaintext: Buffer, key: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(CIPHER, keyBytes(key), iv, { authTagLength: AUTH_TAG_LENGTH });
  const data = Buffer.concat([cipher.update(dumpString(plaintext)), cipher.final()]);
  return [data, iv, cipher.getAuthTag()].map((part) => part.toString('base64')).join(SEPARATOR);
}

/** Decrypts `data`, failing unless the auth tag proves the key is the one it was encrypted with. */
function authenticate(decipher: DecipherGCM, data: Buffer): Buffer {
  try {
    return Buffer.concat([decipher.update(data), decipher.final()]);
  } catch {
    throw new InvalidKeyError('the key does not decrypt this file');
  }
}

/** Returns the 16 bytes a hex key stands for. */
function keyBytes(key: string): Buffer {
  if (!/^[0-9a-f]{32}$/i.test(key)) throw new InvalidKeyError('the key is not 32 hex characters');
  return Buffer.from(key, 'hex');
}
