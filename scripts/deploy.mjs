import {spawnSync} from 'node:child_process';
import {loadEnv,management} from './lib.mjs';
loadEnv();
const tokens=['RADAR_COLLECTOR_TOKEN','RADAR_EVALUATOR_TOKEN','RADAR_READER_TOKEN'].map(name=>process.env[name]);
if(tokens.some(token=>!/^[a-f0-9]{64}$/.test(token ?? '')) || new Set(tokens).size!==3) {
  throw new Error('Generate three distinct gateway tokens with npm run setup:init');
}
const names=['RADAR_COLLECTOR_TOKEN','RADAR_EVALUATOR_TOKEN','RADAR_READER_TOKEN'];
if(process.env.APIFY_TOKEN) names.push('APIFY_TOKEN');
await management('/secrets',names.map(name=>({name,value:process.env[name]})));
console.log('Runtime secrets stored in your project; values hidden');
const r=spawnSync('supabase',['functions','deploy','job-radar','--project-ref',process.env.SUPABASE_PROJECT_REF,'--use-api','--no-verify-jwt'],{
  env:process.env,encoding:'utf8',maxBuffer:1024*1024,
});
for(const [kind,value] of [['stdout',r.stdout],['stderr',r.stderr]]) {
  let cleaned=value||'';
  for(const name of [...names,'SUPABASE_ACCESS_TOKEN']) cleaned=cleaned.split(process.env[name]).join('[REDACTED]');
  process[kind].write(cleaned);
}
process.exit(r.status??1);
