import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadEnv} from './lib.mjs';
import {publishableProfile,collectionPlan} from '../supabase/functions/_shared/search-profile.mjs';
loadEnv();
const local=await publishableProfile(JSON.parse(readFileSync(new URL('../config/profile.json',import.meta.url))));
async function call(action,params={}) {
 const r=await fetch(`${process.env.SUPABASE_URL}/functions/v1/job-radar`,{method:'POST',headers:{Authorization:`Bearer ${process.env.RADAR_READER_TOKEN}`,'Content-Type':'application/json'},body:JSON.stringify({action,params}),signal:AbortSignal.timeout(30000)});
 assert.equal(r.status,200,action);return r.json();
}
const live=await call('profile');assert.equal(live.revision,local.revision);
assert.deepEqual(live.preferences.employment_priority,{primary:['full_time'],high:['internship'],secondary:['part_time','contract']});
const preview=await call('search_plan',{slot:0});
assert.equal(preview.profile_revision,local.revision);
for(const plan of preview.plans) assert.deepEqual(plan,collectionPlan(local,0,plan.source));
console.log('Live profile, priorities and all four provider plans match the single local profile: PASS');
const before=await call('status');await call('search_plan',{slot:1});const after=await call('status');
assert.equal(before.jobs,after.jobs);assert.deepEqual(before.queue,after.queue);
console.log('Plan preview starts no collection and claims no jobs: PASS');
