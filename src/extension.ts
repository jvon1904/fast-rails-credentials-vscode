import * as vscode from 'vscode';
import { CredentialsError, isCredentialsPath, readCredentials } from './credentials.ts';
import { CredentialsFileSystem, decryptedUri, SCHEME } from './credentialsFileSystem.ts';

/** Serves decrypted credentials, and opens them in place of the encrypted files. */
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider(SCHEME, new CredentialsFileSystem()),
    vscode.commands.registerCommand('fastRailsCredentials.openDecrypted', openDecrypted),
    vscode.window.tabGroups.onDidChangeTabs(({ opened }) => opened.forEach(replaceWithDecrypted)),
  );
  vscode.window.tabGroups.all.flatMap((group) => group.tabs).forEach(replaceWithDecrypted);
}

/** Opens the decrypted view of a credentials file: the one given, or the active editor's. */
async function openDecrypted(uri = vscode.window.activeTextEditor?.document.uri): Promise<void> {
  if (!uri || !isEncryptedCredentials(uri)) {
    void vscode.window.showWarningMessage('Open config/credentials.yml.enc or config/credentials/<env>.yml.enc first.');
    return;
  }
  if (await decrypts(uri)) await vscode.window.showTextDocument(decryptedUri(uri));
}

/** Replaces a tab showing an encrypted credentials file with its decrypted view, while that setting is on. */
async function replaceWithDecrypted(tab: vscode.Tab): Promise<void> {
  const uri = tab.input instanceof vscode.TabInputText ? tab.input.uri : undefined;
  if (!uri || !isEncryptedCredentials(uri) || !openOnClick() || !(await decrypts(uri))) return;

  const { viewColumn } = tab.group;
  await vscode.window.showTextDocument(decryptedUri(uri), {
    viewColumn,
    preview: tab.isPreview,
    preserveFocus: !tab.isActive,
  });
  const encrypted = vscode.window.tabGroups.all
    .find((group) => group.viewColumn === viewColumn)
    ?.tabs.find((open) => open.input instanceof vscode.TabInputText && open.input.uri.toString() === uri.toString());
  if (encrypted) await vscode.window.tabGroups.close(encrypted);
}

/** Whether a credentials file decrypts, saying why not when it doesn't. */
async function decrypts(uri: vscode.Uri): Promise<boolean> {
  try {
    await readCredentials(uri.fsPath);
    return true;
  } catch (error) {
    const reason = error instanceof CredentialsError ? error.message : `Couldn't open ${uri.fsPath}: ${error}`;
    void vscode.window.showErrorMessage(reason);
    return false;
  }
}

/** Whether `uri` is an encrypted Rails credentials file on disk. */
function isEncryptedCredentials(uri: vscode.Uri): boolean {
  return uri.scheme === 'file' && isCredentialsPath(uri.path);
}

/** Whether credentials files open decrypted, in place of their encrypted contents. */
function openOnClick(): boolean {
  return vscode.workspace.getConfiguration('fastRailsCredentials').get('openDecryptedOnClick', true);
}
