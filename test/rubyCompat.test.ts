import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { describe, it } from 'node:test';
import { problemWith } from '../src/credentialsYaml.ts';
import { encrypt } from '../src/encryptedFile.ts';
import { loadable, unloadable } from './yamlCases.ts';

const RUBY = ['-ractive_support', '-ractive_support/encrypted_configuration', '-rjson', '-rtmpdir'];
const hasRails = spawnSync('ruby', [...RUBY, '-e', ''], { stdio: 'ignore' }).status === 0;

/** Runs a Ruby script with ActiveSupport loaded, giving it `input` as JSON on stdin and parsing its JSON output. */
function ruby(script: string, input: unknown): unknown {
  const output = execFileSync('ruby', [...RUBY, '-e', script], { input: JSON.stringify(input) });
  return JSON.parse(output.toString());
}

const READ_WITH_ENCRYPTED_FILE = `
  input = JSON.parse($stdin.read)
  Dir.mktmpdir do |dir|
    key_path = File.join(dir, "test.key")
    content_path = File.join(dir, "test.yml.enc")
    File.write(key_path, input["key"])
    plaintexts = input["messages"].map do |message|
      File.write(content_path, message)
      ActiveSupport::EncryptedFile.new(
        content_path:, key_path:, env_key: "RAILS_CREDENTIALS_UNSET_KEY", raise_if_missing_key: true
      ).read.force_encoding("UTF-8")
    end
    puts plaintexts.to_json
  end
`;

const LOAD_WITH_ENCRYPTED_CONFIGURATION = `
  texts = JSON.parse($stdin.read)
  Dir.mktmpdir do |dir|
    key_path = File.join(dir, "test.key")
    File.write(key_path, ActiveSupport::EncryptedFile.generate_key)
    credentials = -> {
      ActiveSupport::EncryptedConfiguration.new(
        config_path: File.join(dir, "test.yml.enc"), key_path:,
        env_key: "RAILS_CREDENTIALS_UNSET_KEY", raise_if_missing_key: true
      )
    }
    loads = texts.map do |text|
      credentials.().write(text)
      credentials.().config
      true
    rescue StandardError
      false
    end
    puts loads.to_json
  end
`;

describe('compatibility with Rails', { skip: hasRails ? false : 'needs Ruby with ActiveSupport' }, () => {
  it('Rails decrypts what encrypt writes', () => {
    const key = randomBytes(16).toString('hex');
    const plaintexts = ['', 'greeting: café\n', `long: ${'x'.repeat(70_000)}\n`];
    const messages = plaintexts.map((plaintext) => encrypt(Buffer.from(plaintext), key));
    assert.deepEqual(ruby(READ_WITH_ENCRYPTED_FILE, { key, messages }), plaintexts);
  });

  it('agrees with Rails on which YAML it can load', () => {
    const texts = [...loadable, ...unloadable];
    const rails = ruby(LOAD_WITH_ENCRYPTED_CONFIGURATION, texts) as boolean[];
    const disagreements = texts
      .map((text, index) => ({ text, rails: rails[index], ours: problemWith(text) === undefined }))
      .filter(({ rails, ours }) => rails !== ours);
    assert.deepEqual(disagreements, []);
  });
});
