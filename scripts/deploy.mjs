import {spawnSync} from 'node:child_process';
import {loadEnv,management} from './lib.mjs';
loadEnv();
const names=['APIFY_TOKEN','RADAR_COLLECTOR_TOKEN','RADAR_EVALUATOR_TOKEN','RADAR_READER_TOKEN'];
if(names.some(k=>!process.env[k])) throw new Error('Missing runtime secret');
await management('/secrets',names.map(name=>({name,value:process.env[name]})));
console.log('Four runtime secrets stored in target project; values hidden');
const r=spawnSync('supabase',['functions','deploy','job-radar','--project-ref',process.env.SUPABASE_PROJECT_REF,'--use-api','--no-verify-jwt'],{
  env:process.env,encoding:'utf8',maxBuffer:1024*1024,
});
for(const [kind,value] of [['stdout',r.stdout],['stderr',r.stderr]]) {
  let cleaned=value||'';
  for(const name of [...names,'SUPABASE_ACCESS_TOKEN']) cleaned=cleaned.split(process.env[name]).join('[REDACTED]');
  process[kind].write(cleaned);
}
process.exit(r.status??1);
