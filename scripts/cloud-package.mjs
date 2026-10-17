import {mkdirSync,copyFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {root,loadEnv,projectTarget} from './lib.mjs';
loadEnv();
const {url}=projectTarget();
mkdirSync(new URL('local/',root),{recursive:true});
const directory=new URL('file://'+mkdtempSync(new URL('local/cloud-package-',root))+'/');
const archive=new URL('local/cloud-evaluator.zip',root);
try {
 for(const path of ['scripts/','prompts/','config/']) mkdirSync(new URL(path,directory),{recursive:true});
 // Explicit allowlist; personalized profile is private data even without credentials.
 for(const path of ['AGENTS.md','scripts/lib.mjs','scripts/radar.mjs','scripts/save-evaluations.mjs','prompts/review.md','prompts/cloud-setup.md','config/profile.json'])
  copyFileSync(new URL(path,root),new URL(path,directory));
 writeFileSync(new URL('ENVIRONMENT.txt',directory),`SUPABASE_URL=${url}\nRADAR_EVALUATOR_TOKEN=<supply via secret settings>\nRuntime: Node 22+\nNetwork: HTTPS ${new URL(url).hostname}:443\nRead prompts/cloud-setup.md. This archive contains your profile but no credentials.\n`);
 rmSync(archive,{force:true});
 const result=spawnSync('zip',['-q','-r',archive.pathname,'AGENTS.md','scripts','prompts','config','ENVIRONMENT.txt'],{cwd:directory,encoding:'utf8'});
 if(result.error||result.status!==0) throw new Error('Could not create cloud package; install zip');
 console.log('local/cloud-evaluator.zip ready; contains your profile, no credentials. Keep it private.');
} finally {rmSync(directory,{recursive:true,force:true});}
