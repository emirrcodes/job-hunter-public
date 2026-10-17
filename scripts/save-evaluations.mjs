import {readFileSync} from 'node:fs';
import {loadEnv} from './lib.mjs';
loadEnv();
const args=process.argv.slice(2);
if(args.length!==2) throw new Error('Usage: save-evaluations.mjs claims.json evaluations.json');
const claims=JSON.parse(readFileSync(args[0],'utf8'));
const evaluations=JSON.parse(readFileSync(args[1],'utf8'));
for(const evaluation of evaluations) {
  const claim=claims.find(c=>c.job.id===evaluation.job_id);
  if(!claim) throw new Error('Evaluation has no matching claim');
  const params={...evaluation,lease_token:claim.lease_token,content_hash:claim.job.content_hash};
  const res=await fetch(`${process.env.SUPABASE_URL}/functions/v1/job-radar`,{method:'POST',
    headers:{Authorization:`Bearer ${process.env.RADAR_EVALUATOR_TOKEN}`,'Content-Type':'application/json'},
    body:JSON.stringify({action:'save_evaluation',params}),signal:AbortSignal.timeout(30000)});
  if(!res.ok) throw new Error(`Evaluation save failed (${res.status})`);
  console.log(`${evaluation.job_id}: saved`);
}
