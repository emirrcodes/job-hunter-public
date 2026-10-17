import assert from 'node:assert/strict';
import {loadEnv} from './lib.mjs';
loadEnv();
for(const [scope,action,status] of [['NONE','status',401],['READER','claim',403],['READER','save_evaluation',403],['EVALUATOR','collect',403],['COLLECTOR','shortlist',403],['READER','status',200],['EVALUATOR','profile',200]]) {
  const res=await fetch(`${process.env.SUPABASE_URL}/functions/v1/job-radar`,{method:'POST',
    headers:{Authorization:`Bearer ${process.env[`RADAR_${scope}_TOKEN`]||'invalid'}`,'Content-Type':'application/json'},body:JSON.stringify({action}),signal:AbortSignal.timeout(30000)});
  const body=await res.json();
  assert.equal(res.status,status,`${scope} ${action}: ${JSON.stringify(body)}`);
  console.log(`${scope} ${action}: ${status} PASS`);
}
