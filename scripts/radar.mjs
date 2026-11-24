import {readFileSync,writeFileSync} from 'node:fs';
import {gatewayTarget,loadEnv} from './lib.mjs';
loadEnv();
const action=process.argv[2]||'status';
const scopes={collect:'COLLECTOR',poll:'COLLECTOR',claim:'EVALUATOR',save_evaluation:'EVALUATOR',
  briefing_window:'EVALUATOR',save_briefing:'EVALUATOR',deliver_briefing:'EVALUATOR',status:'READER',shortlist:'READER',profile:'READER',search_plan:'READER'};
if(!scopes[action]) throw new Error('Unknown action');
let params={};
const fileFlag=process.argv.indexOf('--file');
if(fileFlag!==-1) params=JSON.parse(readFileSync(process.argv[fileFlag+1],'utf8'));
const limitFlag=process.argv.indexOf('--limit');
if(limitFlag!==-1) params.limit=+process.argv[limitFlag+1];
const slotFlag=process.argv.indexOf('--slot');
if(slotFlag!==-1) params.slot=+process.argv[slotFlag+1];
const response=await fetch(`${gatewayTarget()}/functions/v1/job-radar`,{
    method:'POST',headers:{Authorization:`Bearer ${process.env[`RADAR_${scopes[action]}_TOKEN`]||(scopes[action]==='READER'?process.env.RADAR_EVALUATOR_TOKEN:'')}`,'Content-Type':'application/json'},
  body:JSON.stringify({action,params}),signal:AbortSignal.timeout(100000),
});
const result=await response.json().catch(()=>({error:'invalid_response'}));
if(!response.ok){console.error(JSON.stringify({status:response.status,...result}));process.exit(1);}
const output=JSON.stringify(result,null,2);
const outFlag=process.argv.indexOf('--out');
if(outFlag!==-1) {writeFileSync(process.argv[outFlag+1],output,{mode:0o600});console.log(`${action}: result saved`);}
else console.log(output);
