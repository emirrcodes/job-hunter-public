import { mkdirSync, copyFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { root, loadEnv, projectTarget } from './lib.mjs';

loadEnv();
const { url } = projectTarget();
mkdirSync(new URL('local/', root), { recursive: true, mode: 0o700 });
const directory = pathToFileURL(`${mkdtempSync(new URL('local/cloud-package-', root))}/`);
const archive = fileURLToPath(new URL('local/cloud-evaluator.zip', root));
try {
  for (const folder of ['docs/', 'scripts/', 'prompts/', 'local/']) mkdirSync(new URL(folder, directory));
  // The evaluator reads its live profile from the selected gateway.
  for (const path of ['docs/CLOUD.md', 'scripts/lib.mjs', 'scripts/radar.mjs', 'scripts/save-evaluations.mjs', 'prompts/review.md', 'prompts/cloud-setup.md']) {
    copyFileSync(new URL(path, root), new URL(path, directory));
  }
  writeFileSync(new URL('ENVIRONMENT.txt', directory), `SUPABASE_URL=${url}\nRADAR_EVALUATOR_TOKEN=<supply via secret settings>\nRuntime: Node 22+\nNetwork: HTTPS ${new URL(url).hostname}:443\nRead prompts/cloud-setup.md. The evaluator reads the live profile from the gateway.\n`);
  rmSync(archive, { force: true });
  const result = spawnSync('zip', ['-q', '-r', archive, 'docs', 'scripts', 'prompts', 'local', 'ENVIRONMENT.txt'], { cwd: directory, encoding: 'utf8' });
  if (result.error || result.status !== 0) throw new Error('Could not create cloud package. Check that zip is installed.');
  console.log('local/cloud-evaluator.zip is ready. Give it to the evaluator for this project.');
} finally {
  rmSync(directory, { recursive: true, force: true });
}
