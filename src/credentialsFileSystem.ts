import { posix } from 'node:path';
import * as vscode from 'vscode';
import { CredentialsError, readCredentials, writeCredentials } from './credentials.ts';

export const SCHEME = 'fast-rails-credentials';

/** The decrypted view of an encrypted credentials file: `…/dev.yml.enc` opens as `fast-rails-credentials:…/dev.yml`. */
export function decryptedUri(encrypted: vscode.Uri): vscode.Uri {
  return encrypted.with({ scheme: SCHEME, path: encrypted.path.replace(/\.enc$/, '') });
}

/** The encrypted file behind a decrypted view. */
export function encryptedUri(decrypted: vscode.Uri): vscode.Uri {
  return decrypted.with({ scheme: 'file', path: `${decrypted.path}.enc` });
}

/** Serves credentials files decrypted, and encrypts them again on save. */
export class CredentialsFileSystem implements vscode.FileSystemProvider {
  private readonly changes = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
  readonly onDidChangeFile = this.changes.event;

  stat(uri: vscode.Uri): Thenable<vscode.FileStat> {
    return vscode.workspace.fs.stat(encryptedUri(uri));
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    try {
      return (await readCredentials(encryptedUri(uri).fsPath)).plaintext;
    } catch (error) {
      throw fileSystemError(error, uri);
    }
  }

  async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
    try {
      if (await writeCredentials(encryptedUri(uri).fsPath, Buffer.from(content))) {
        this.changes.fire([{ type: vscode.FileChangeType.Changed, uri }]);
      }
    } catch (error) {
      throw fileSystemError(error, uri);
    }
  }

  watch(uri: vscode.Uri): vscode.Disposable {
    const encrypted = encryptedUri(uri);
    const folder = vscode.Uri.joinPath(encrypted, '..');
    const watcher = vscode.workspace.createFileSystemWatcher(
      new vscode.RelativePattern(folder, posix.basename(encrypted.path)),
    );
    const report = (type: vscode.FileChangeType) => () => this.changes.fire([{ type, uri }]);
    return vscode.Disposable.from(
      watcher,
      watcher.onDidChange(report(vscode.FileChangeType.Changed)),
      watcher.onDidCreate(report(vscode.FileChangeType.Created)),
      watcher.onDidDelete(report(vscode.FileChangeType.Deleted)),
    );
  }

  readDirectory(): never {
    throw vscode.FileSystemError.NoPermissions('Rails credentials are files, not folders');
  }

  createDirectory(): never {
    throw vscode.FileSystemError.NoPermissions('Rails credentials are files, not folders');
  }

  delete(): never {
    throw vscode.FileSystemError.NoPermissions('Delete the encrypted file instead');
  }

  rename(): never {
    throw vscode.FileSystemError.NoPermissions('Rename the encrypted file instead');
  }
}

/** Converts an error from reading or writing credentials into the one VS Code reports for the file. */
function fileSystemError(error: unknown, uri: vscode.Uri): Error {
  if ((error as NodeJS.ErrnoException).code === 'ENOENT') return vscode.FileSystemError.FileNotFound(uri);
  if (error instanceof CredentialsError) return vscode.FileSystemError.Unavailable(error.message);
  return error as Error;
}
