// Runs the integration suite in VS Code, with a copy of test/fixtures/app open as the workspace.
// `npm run test:vscode` builds the extension and the suite first; VS Code is downloaded to .vscode-test/.

import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runTests } from '@vscode/test-electron';

const root = fileURLToPath(new URL('../..', import.meta.url));
// VS Code puts a socket in its user data directory, and macOS refuses socket paths over 103 characters,
// which a macOS $TMPDIR already nearly fills. /tmp keeps the path short; Windows uses named pipes instead.
const scratch = await mkdtemp(join(process.platform === 'win32' ? tmpdir() : '/tmp', 'rails-credentials-'));
const app = join(scratch, 'app');
await cp(join(root, 'test/fixtures/app'), app, { recursive: true });

try {
  await runTests({
    extensionDevelopmentPath: root,
    extensionTestsPath: join(root, 'out/integration/suite.cjs'),
    // The suite decrypts with the fixture keys only, never a RAILS_MASTER_KEY from the shell.
    extensionTestsEnv: { RAILS_MASTER_KEY: undefined },
    launchArgs: [app, `--user-data-dir=${join(scratch, 'user-data')}`],
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await rm(scratch, { recursive: true, force: true });
}
