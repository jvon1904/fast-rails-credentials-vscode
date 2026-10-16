# frozen_string_literal: true

# Writes the encrypted fixtures under test/fixtures/app with ActiveSupport::EncryptedFile.
# Run with `ruby test/fixtures/generate.rb`; delete a key file first to rotate it.
require "active_support"
require "active_support/encrypted_file"
require "fileutils"
require "securerandom"

CONFIG = File.expand_path("app/config", __dir__)

# Encrypts contents into config/<content> with config/<key>, generating the key when it is missing.
def encrypt(content, key, contents)
  key_path = File.join(CONFIG, key)
  FileUtils.mkdir_p(File.dirname(key_path))
  File.write(key_path, ActiveSupport::EncryptedFile.generate_key) unless File.exist?(key_path)
  ActiveSupport::EncryptedFile.new(
    content_path: File.join(CONFIG, content), key_path:,
    env_key: "RAILS_CREDENTIALS_FIXTURE_KEY", raise_if_missing_key: true
  ).write(contents)
end

encrypt "credentials.yml.enc", "master.key", <<~YAML.b
  secret_key_base: top-level-secret
YAML

encrypt "credentials/dev.yml.enc", "credentials/dev.key", <<~YAML.b
  # Read as binary, the way credentials:edit reads the file you saved.
  aws:
    access_key_id: dev-access-key
    secret_access_key: dev-secret
  greeting: café
YAML

encrypt "credentials/qa.yml.enc", "credentials/qa.key", <<~YAML
  # A UTF-8 string, the way Rails.application.credentials.write gets one.
  greeting: über
YAML

encrypt "credentials/stage.yml.enc", "master.key", <<~YAML.b
  # No stage.key, so Rails falls back to master.key.
  api_token: stage-token
YAML
