import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { decrypt, encrypt, InvalidKeyError, InvalidMessageError } from '../src/encryptedFile.ts';

const config = new URL('fixtures/app/config/', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, config), 'utf8');
const devKey = read('credentials/dev.key').trim();
const otherKey = 'f'.repeat(32);

describe('decrypt', () => {
  it('decrypts a file Rails encrypted', () => {
    const plaintext = decrypt(read('credentials/dev.yml.enc'), devKey).toString();
    assert.match(plaintext, /secret_access_key: dev-secret/);
    assert.match(plaintext, /greeting: café/);
  });

  it('refuses a key the file was not encrypted with', () => {
    assert.throws(() => decrypt(read('credentials/dev.yml.enc'), otherKey), InvalidKeyError);
  });

  it('refuses a key that is not 32 hex characters', () => {
    assert.throws(() => decrypt(read('credentials/dev.yml.enc'), 'not-a-key'), /32 hex characters/);
  });

  it('refuses a file whose ciphertext was changed', () => {
    const [data, iv, tag] = read('credentials/dev.yml.enc').split('--');
    const changed = `${data[1]}${data[0]}${data.slice(2)}--${iv}--${tag}`;
    assert.throws(() => decrypt(changed, devKey), InvalidKeyError);
  });

  it('refuses contents that are not a Rails encrypted file', () => {
    assert.throws(() => decrypt('<<<<<<< HEAD\nabc\n=======\n', devKey), InvalidMessageError);
  });
});

describe('encrypt', () => {
  it('encrypts what decrypt reads back', () => {
    const plaintext = Buffer.from('greeting: café\n');
    assert.deepEqual(decrypt(encrypt(plaintext, devKey), devKey), plaintext);
  });

  it('uses a new IV each time', () => {
    const plaintext = Buffer.from('a: 1\n');
    assert.notEqual(encrypt(plaintext, devKey), encrypt(plaintext, devKey));
  });
});
