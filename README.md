# Fast Rails Credentials for VS Code

Edit Rails encrypted credentials in VS Code as plain YAML. Open `config/credentials.yml.enc` or
`config/credentials/<env>.yml.enc` and you get the decrypted text; save and it's encrypted again, the way
`bin/rails credentials:edit` would write it.

**Decrypted in VS Code's own Node.js runtime, not Ruby.** The extension does the decryption and encryption itself,
with Node's built-in crypto. It never runs Ruby, Bundler or `bin/rails`, so a file opens without waiting for Rails to
boot, and it works on a machine where Ruby or the app's gems aren't installed.

## What it does

- **Opens credentials decrypted.** Clicking a credentials file opens its decrypted view in place of the encrypted
  text. The view is a normal YAML editor, named like the file without `.enc`.
- **Encrypts on save** with the same key that decrypted the file, so each file keeps its own key.
- **Refuses a save Rails couldn't load.** A syntax error, a top level that isn't a set of keys, or a key YAML reads
  as something other than a string (`yes:`, `123:`, `2024-01-01:`) stops the save, and VS Code shows why. The
  encrypted file is left as it was.
- **Leaves an unchanged file alone.** Saving without a change doesn't rewrite the file, so it doesn't show up in
  `git diff`.
- **Follows changes on disk.** When the encrypted file changes, for example after a `git pull`, a decrypted view
  with no unsaved edits shows the new contents.

Files are written in the format Rails 5.2 and later use: AES-128-GCM, with the YAML as a Ruby Marshal string.

## Keys

For each file, the extension uses the first key that decrypts it, trying them in the order Rails does:

| File | Keys tried |
| --- | --- |
| `config/credentials.yml.enc` | `RAILS_MASTER_KEY`, then `config/master.key` |
| `config/credentials/<env>.yml.enc` | `RAILS_MASTER_KEY`, then `config/credentials/<env>.key`, then `config/master.key` |

`RAILS_MASTER_KEY` comes from the environment VS Code's extension host runs with. When no key decrypts a file, the
file stays open encrypted and VS Code says which keys it looked for.

The extension only opens credentials files that already exist. Create a new one, or change its key, with
`bin/rails credentials:edit`.

## Settings

| Setting | Default | |
| --- | --- | --- |
| `fastRailsCredentials.openDecryptedOnClick` | `true` | Open credentials files decrypted. When off, they open encrypted, and **Fast Rails Credentials: Open Decrypted** (in the editor title bar, the Explorer's context menu, and the Command Palette) opens the decrypted view. |

## Install

Install [Fast Rails Credentials](https://marketplace.visualstudio.com/items?itemName=jvon1904.fast-rails-credentials) from the
Extensions view, or from a terminal:

```sh
code --install-extension jvon1904.fast-rails-credentials
```

It runs where the workspace is, so in a remote window (SSH, a dev container, WSL) it reads the keys on that
machine.

## Development

You need Node.js 22.18 or later, which runs the TypeScript sources directly.

| Command | |
| --- | --- |
| `npm test` | Unit tests. With Ruby and ActiveSupport installed, they also check that Rails decrypts what the extension writes and agrees on which YAML it can load. |
| `npm run test:vscode` | Integration tests in VS Code, against a copy of `test/fixtures/app`. The first run downloads VS Code into `.vscode-test/`. |
| `npm run typecheck` | Type-checks `src` and `test`. |
| `npm run build` | Bundles the extension into `dist/extension.cjs`. |
| `npm run package` | Builds a minified `.vsix`. Install it with `code --install-extension fast-rails-credentials-<version>.vsix`. |

The encrypted fixtures and their keys under `test/fixtures/app/config` exist only for the tests.
`ruby test/fixtures/generate.rb` rewrites the fixtures with ActiveSupport; delete a key first to replace it.

## License

[MIT](LICENSE)
