# Changelog

## 0.1.0

The first release.

- Opens `config/credentials.yml.enc` and `config/credentials/<env>.yml.enc` decrypted, and encrypts them again on save
  with the key that opened them.
- Finds keys the way Rails does: `RAILS_MASTER_KEY`, then `config/credentials/<env>.key`, then `config/master.key`.
- Refuses to save YAML that Rails couldn't load, and says why.
- Leaves the encrypted file alone when a save changes nothing.
- Shows the new contents when the encrypted file changes on disk.
- `fastRailsCredentials.openDecryptedOnClick` turns off opening files decrypted on click;
  **Fast Rails Credentials: Open Decrypted** still opens them.
