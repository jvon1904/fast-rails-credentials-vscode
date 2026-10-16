// The extension's behaviour in VS Code: which tabs open, what saving writes, and what a change on disk does.
// test/integration/run.ts opens a copy of test/fixtures/app as the workspace and runs this in the extension host.

import assert from 'node:assert/strict';
import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import * as vscode from 'vscode';
import { readCredentials } from '../../src/credentials.ts';
import { decryptedUri } from '../../src/credentialsFileSystem.ts';
import { encrypt } from '../../src/encryptedFile.ts';

const EXTENSION_ID = 'jvon1904.fast-rails-credentials';
/** How long to give the extension to act, before checking that it didn't. */
const SETTLE_MS = 1000;

const tests: { name: string; body: () => Promise<void> }[] = [];

/** Adds a test to the suite. */
function test(name: string, body: () => Promise<void>): void {
  tests.push({ name, body });
}

/** Runs each test against a fresh copy of the fixture credentials, and fails when any of them does. */
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  if (!extension) throw new Error(`${EXTENSION_ID} isn't loaded`);
  await extension.activate();
  const fixtures = vscode.Uri.joinPath(extension.extensionUri, 'test/fixtures/app/config').fsPath;

  const failed: string[] = [];
  for (const { name, body } of tests) {
    await reset(fixtures);
    try {
      await body();
      console.log(`✔ ${name}`);
    } catch (error) {
      failed.push(name);
      console.log(`✖ ${name}\n`, error);
    }
  }
  await reset(fixtures);
  console.log(`\n${tests.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length > 0) throw new Error(`Failed: ${failed.join('; ')}`);
}

test('opens a credentials file decrypted, in place of its encrypted contents', async () => {
  const encrypted = file('credentials/dev.yml.enc');
  await vscode.window.showTextDocument(encrypted);
  const document = await activeDocument(decryptedUri(encrypted));
  assert.deepEqual(openTabs(), [decryptedUri(encrypted).toString()]);
  assert.match(document.getText(), /secret_access_key: dev-secret/);
  assert.equal(document.languageId, 'yaml');
});

test('leaves a credentials file encrypted when no key decrypts it', async () => {
  // prod has no key of its own, and master.key didn't encrypt qa's contents.
  const encrypted = file('credentials/prod.yml.enc');
  await vscode.workspace.fs.copy(file('credentials/qa.yml.enc'), encrypted);
  await vscode.window.showTextDocument(encrypted);
  await settle();
  assert.deepEqual(openTabs(), [encrypted.toString()]);
});

test('encrypts the file again on save, with the key that opened it', async () => {
  // stage has no key of its own, so master.key opens it.
  const encrypted = file('credentials/stage.yml.enc');
  await vscode.window.showTextDocument(encrypted);
  const document = await activeDocument(decryptedUri(encrypted));
  await replaceText(document, 'api_token: rotated\n');

  assert.equal(await document.save(), true);
  assert.equal(document.isDirty, false);
  const saved = await readCredentials(encrypted.fsPath, {});
  assert.equal(saved.plaintext.toString(), 'api_token: rotated\n');
  assert.equal(saved.key, (await readFile(file('master.key').fsPath, 'utf8')).trim());
});

test("refuses to save YAML Rails couldn't load, and leaves the file alone", async () => {
  const encrypted = file('credentials/dev.yml.enc');
  const before = await readFile(encrypted.fsPath);
  await vscode.window.showTextDocument(encrypted);
  const document = await activeDocument(decryptedUri(encrypted));
  await replaceText(document, 'aws:\n  yes: 1\n');

  assert.equal(await document.save(), false);
  assert.equal(document.isDirty, true);
  assert.deepEqual(await readFile(encrypted.fsPath), before);
});

test('shows the new contents when the encrypted file changes on disk', async () => {
  const encrypted = file('credentials/qa.yml.enc');
  await vscode.window.showTextDocument(encrypted);
  const document = await activeDocument(decryptedUri(encrypted));
  const key = (await readFile(file('credentials/qa.key').fsPath, 'utf8')).trim();

  await writeFile(encrypted.fsPath, encrypt(Buffer.from('greeting: hallo\n'), key));
  await until('the decrypted view shows the new contents', () => document.getText() === 'greeting: hallo\n');
});

test('with openDecryptedOnClick off, opens the encrypted contents until Open Decrypted is run', async () => {
  const settings = vscode.workspace.getConfiguration('fastRailsCredentials');
  await settings.update('openDecryptedOnClick', false, vscode.ConfigurationTarget.Workspace);
  try {
    const encrypted = file('credentials/dev.yml.enc');
    await vscode.window.showTextDocument(encrypted);
    await settle();
    assert.deepEqual(openTabs(), [encrypted.toString()]);

    await vscode.commands.executeCommand('fastRailsCredentials.openDecrypted');
    const document = await activeDocument(decryptedUri(encrypted));
    assert.match(document.getText(), /secret_access_key: dev-secret/);
  } finally {
    await settings.update('openDecryptedOnClick', undefined, vscode.ConfigurationTarget.Workspace);
  }
});

/** The workspace's config directory. */
function configDirectory(): vscode.Uri {
  const [app] = vscode.workspace.workspaceFolders ?? [];
  if (!app) throw new Error('No workspace is open');
  return vscode.Uri.joinPath(app.uri, 'config');
}

/** A file under the workspace's config directory. */
function file(name: string): vscode.Uri {
  return vscode.Uri.joinPath(configDirectory(), name);
}

/** Discards unsaved edits, closes every editor, and puts back the fixture credentials and keys. */
async function reset(fixtures: string): Promise<void> {
  for (const document of vscode.workspace.textDocuments.filter((open) => open.isDirty)) {
    await vscode.window.showTextDocument(document);
    await vscode.commands.executeCommand('workbench.action.files.revert');
  }
  await vscode.commands.executeCommand('workbench.action.closeAllEditors');
  const config = configDirectory().fsPath;
  await rm(config, { recursive: true, force: true });
  await cp(fixtures, config, { recursive: true });
}

/** Waits for the active editor to show `uri`, and returns its document. */
function activeDocument(uri: vscode.Uri): Promise<vscode.TextDocument> {
  return until(`${uri.toString()} is the active editor`, () => {
    const document = vscode.window.activeTextEditor?.document;
    return document?.uri.toString() === uri.toString() && document;
  });
}

/** The URIs of the text files open in tabs. */
function openTabs(): string[] {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .flatMap((tab) => (tab.input instanceof vscode.TabInputText ? [tab.input.uri.toString()] : []));
}

/** Replaces the whole of `document`'s text, leaving it unsaved. */
async function replaceText(document: vscode.TextDocument, text: string): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), text);
  assert.ok(await vscode.workspace.applyEdit(edit), `couldn't edit ${document.uri.toString()}`);
}

/** Returns `check()` once it gives something truthy, or fails after five seconds. */
async function until<T>(description: string, check: () => T | false | undefined): Promise<T> {
  const deadline = Date.now() + 5000;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`Timed out waiting until ${description}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Waits long enough for the extension to have replaced a tab, had it been going to. */
function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}
