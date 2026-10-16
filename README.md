# Fast Rails Credentials for VS Code

Are your fingers tired of typing lengthy commands like this?

```bash
VISUAL="code --wait" bin/rails credentials:edit -e mycoolenvironment
```

Well, those days are over!

_Fast Rails Credentials_ lets you simply open your encrypted files like any other file, blazing fast! 🔥

The cryptography runs in Node.js, not Ruby!

- **Quickly decrypt** credentials by simply opening the file in plain YAML!  No more Rails commands!
- **Encrypt on save**.
- **YAML Syntax errors** will prevent a save.
- **Opening without change** leaves no trace.

## How it works

Other extensions make Javascript calls into the Rails commands.  They provide convenience but not speed.

_Fast Rails Credentials_ performs the same steps as `ActiveSupport::EncryptedFile`, with the
same algorithm and the same file format, but it implements them with Node's built-in `crypto` module, in the Node.js
runtime VS Code already runs extensions in. Nothing starts Ruby.

### Same algorithm, implemented in Node

| Step | Rails (`ActiveSupport::EncryptedFile`) | Fast Rails Credentials |
| --- | --- | --- |
| Key | `[key].pack("H*")` | `Buffer.from(key, 'hex')` |
| aes-128-gcm Cipher | `OpenSSL::Cipher` with `aes-128-gcm`, through `MessageEncryptor` | `crypto.createCipheriv('aes-128-gcm', …)` |
| 12 byte IV | `cipher.random_iv`: 12 bytes | `crypto.randomBytes(12)` |
| Auth tag | `cipher.auth_tag(16)`, with empty auth data | `cipher.getAuthTag()`: 16 bytes, with empty auth data |
| Marshaling | `Marshal.dump(contents)` | A Ruby Marshal 4.8 string, written and read by the extension's own encoder (`src/marshal.ts`) |
| File | base64 parts joined by `--` | Same |
| Save | Write `<file>.tmp`, then move it over the file | Same |

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
