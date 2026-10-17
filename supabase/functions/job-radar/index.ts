import {XMLParser} from 'npm:fast-xml-parser@5.11.2';
import {batch,wwrItems} from '../_shared/adapters.mjs';
import {collectionPlan,validateProfile} from '../_shared/search-profile.mjs';
import {verifyLinkedinResults} from '../_shared/linkedin.mjs';

const base=Deno.env.get('SUPABASE_URL')!;
const key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const apifyToken=Deno.env.get('APIFY_TOKEN')!;
const actions:Record<string,string[]>={
  collector:['collect','poll'],
  evaluator:['status','profile','search_plan','claim','save_evaluation','shortlist','briefing_window','save_briefing','deliver_briefing'],
  reader:['status','shortlist','profile','search_plan'],
};
async function constantMatch(a:string,b:string) {
  if(!b) return false;
  const hash=async(s:string)=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)));
  const [x,y]=await Promise.all([hash(a),hash(b)]); let diff=0;
  for(let i=0;i<x.length;i++) diff|=x[i]^y[i]; return diff===0;
}
async function request(url:string,init:RequestInit={},timeout=25000) {
  const res=await fetch(url,{...init,signal:AbortSignal.timeout(timeout)});
  if(!res.ok) throw new Error(`upstream_http_${res.status}`);
  const body=await res.text(); if(body.length>15_000_000) throw new Error('response_too_large');
  return body;
}
async function db(path:string,body?:unknown,method?:string) {
  const result=await request(`${base}/rest/v1/${path}`,{method:method||(body===undefined?'GET':'POST'),
    headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=representation'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  return result?JSON.parse(result):null;
}
const rpc=(name:string,body:unknown={})=>db(`rpc/${name}`,body);
async function apify(path:string,body?:unknown) {
  return JSON.parse(await request(`https://api.apify.com/v2/${path}`,{
    method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${apifyToken}`,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})}));
}
async function fail(id:string,code:string,state='failed') {
  await db(`radar_collection_runs?id=eq.${id}`,{state,error_code:code,completed_at:state==='failed'?new Date().toISOString():null},'PATCH');
  return {id,state,error:code};
}
async function publicCollect(source:string,profile:any) {
  if(!profile.search.enabled||!profile.search.sources[source]?.enabled) return {source,skip:'profile_source_disabled'};
  const reserved=await rpc('radar_reserve_collection',{p_source:source,p_reserve:0});
  if(!reserved.run) return {source,...reserved};
  const id=reserved.run.id;
  try {
    const plan=collectionPlan(profile,reserved.slot,source);
    await db(`radar_collection_runs?id=eq.${id}`,{metrics:{profile_revision:profile.revision,search_plan:plan}},'PATCH');
    let records:any[]=[]; const totals=[];
    const responses=await Promise.allSettled(plan.urls.map((url:string)=>request(url)));
    for(const response of responses) {
      if(response.status==='rejected') throw new Error('provider_request_failed');
      if(source==='wwr') records.push(...wwrItems(response.value,XMLParser));
      else {
        const data=JSON.parse(response.value);
        if(!Array.isArray(data.jobs)) throw new Error('provider_records_missing');
        records.push(...data.jobs); totals.push(data.totalCount??data['job-count']??null);
      }
    }
    if(records.length>plan.max_results) throw new Error('feed_limit_exceeded');
    const {items,metrics}=batch(source,records,{profile});
    const coverage={...plan,total_reported:totals,bounded_sample:true};
    const receipt=await rpc('radar_ingest_run',{p_run_id:id,p_items:items,p_returned:records.length,
      p_state:metrics.invalid?'partial':'succeeded',p_metrics:{...metrics,coverage,profile_revision:profile.revision,search_plan:plan}});
    return {source,...receipt,...metrics};
  } catch(e) { return {source,...await fail(id,e instanceof Error?e.message:'collection_error')}; }
}
async function startLinkedin(profile:any) {
  if(!profile.search.enabled||!profile.search.sources.apify_bebity.enabled) return {source:'apify_bebity',skip:'profile_source_disabled'};
  const [account,limits]=await Promise.all([apify('users/me'),apify('users/me/limits')]);
  const plan=account.data?.plan, l=limits.data;
  if(plan?.id!=='FREE'||plan?.monthlyBasePriceUsd!==0||plan?.monthlyUsageCreditsUsd!==5
    ||!Number.isFinite(l?.limits?.maxMonthlyUsageUsd)||l.limits.maxMonthlyUsageUsd>5||!Number.isFinite(l?.current?.monthlyUsageUsd)
    ||l.current.monthlyUsageUsd>4.40) return {source:'apify_bebity',skip:'free_budget_not_verified'};
  const reserved=await rpc('radar_reserve_collection',{p_source:'apify_bebity',p_reserve:0.05});
  if(!reserved.run) return {source:'apify_bebity',...reserved};
  const id=reserved.run.id; const selected=collectionPlan(profile,reserved.slot,'apify_bebity');
  await db(`radar_collection_runs?id=eq.${id}`,{metrics:{lane:selected.lane,input:selected.input,profile_revision:profile.revision,search_plan:selected,build:'0.0.226',max_charge_usd:0.05}},'PATCH');
  // Never retry this POST blindly: a network failure may mean it already started.
  try {
    const response=await apify('acts/bebity~linkedin-jobs-scraper/runs?build=0.0.226&timeout=300&memory=2048&maxTotalChargeUsd=0.05',selected.input);
    if(!response.data?.id) throw new Error('missing_external_id');
    await db(`radar_collection_runs?id=eq.${id}`,{external_run_id:response.data.id,state:'running'},'PATCH');
    return {source:'apify_bebity',id,state:'running',lane:selected.lane,max_charge_usd:0.05};
  } catch { return {source:'apify_bebity',...await fail(id,'start_outcome_requires_reconciliation','unknown')}; }
}
async function poll() {
  const runs=await db('radar_collection_runs?source_id=eq.apify_bebity&state=in.(running,ingesting)&select=id,external_run_id,metrics&limit=3');
  const results=[];
  for(const run of runs) {
    try {
      const data=(await apify(`actor-runs/${encodeURIComponent(run.external_run_id)}`)).data;
      if(!['SUCCEEDED','FAILED','TIMED-OUT','ABORTED'].includes(data.status)) {results.push({id:run.id,state:data.status});continue;}
      if(!data.defaultDatasetId) {results.push(await fail(run.id,'missing_dataset'));continue;}
      const records=await apify(`datasets/${encodeURIComponent(data.defaultDatasetId)}/items?clean=true&limit=101`);
      if(!Array.isArray(records)||records.length>100) {results.push(await fail(run.id,'unexpected_dataset_size'));continue;}
      const revision=run.metrics.profile_revision;
      const profile=validateProfile(await rpc('radar_get_profile',revision?{p_revision:revision}:{}));
      const plan=run.metrics.search_plan;
      if(!plan) throw new Error('linkedin_search_plan_missing');
      const quality=verifyLinkedinResults(records,plan.input,plan.geography);
      const {items,metrics}=batch('apify_bebity',records,{profile});
      const cost=data.usageTotalUsd ?? null;
      results.push(await rpc('radar_ingest_run',{p_run_id:run.id,p_items:items,p_returned:records.length,
        p_state:data.status==='SUCCEEDED'&&!metrics.invalid?'succeeded':'partial',p_cost:cost,
        p_metrics:{...run.metrics,...metrics,...quality,provider_status:data.status,provider_charge_usd:cost,bounded_sample:true}}));
    } catch(e) {
      const code=e instanceof Error?e.message:'poll_error';
      if(['linkedin_provenance_mismatch','linkedin_location_mismatch','linkedin_search_plan_missing'].includes(code)) {
        results.push(await fail(run.id,code));
        await db('radar_sources?id=eq.apify_bebity',{enabled:false,stage:'broken'},'PATCH');
      } else results.push({id:run.id,error:'poll_failed_will_retry'});
    }
  }
  return results;
}
Deno.serve(async req=>{
  const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  if(req.method!=='POST') return reply({error:'method_not_allowed'},405);
  const bearer=req.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
  let scope='';
  for(const s of Object.keys(actions)) if(await constantMatch(bearer,Deno.env.get(`RADAR_${s.toUpperCase()}_TOKEN`)||'')) scope=s;
  if(!scope) return reply({error:'unauthorized'},401);
  if(Number(req.headers.get('content-length')||0)>65536) return reply({error:'request_too_large'},413);
  let input; try {const raw=await req.text();if(raw.length>65536) return reply({error:'request_too_large'},413);input=JSON.parse(raw);} catch {return reply({error:'invalid_json'},400);}
  if(!input||typeof input!=='object'||Array.isArray(input)||typeof input.action!=='string') return reply({error:'invalid_request'},400);
  if(!actions[scope].includes(input.action)) return reply({error:'forbidden'},403);
  try {
    const p=input.params||{};
    switch(input.action) {
      case 'profile': return reply(await rpc('radar_get_profile'));
      case 'search_plan': {
        const profile=validateProfile(await rpc('radar_get_profile'));
        const slot=p.slot??Math.floor((Date.now()/1000-14400)/43200);
        if(!Number.isSafeInteger(slot)||slot<0) return reply({error:'invalid_slot'},400);
        return reply({profile_revision:profile.revision,plans:['apify_bebity','himalayas','remotive','wwr'].map(id=>collectionPlan(profile,slot,id))});
      }
      case 'status': return reply(await rpc('radar_get_status'));
      case 'claim': return reply(await rpc('radar_claim_jobs',{p_limit:p.limit??10}));
      case 'shortlist': return reply(await rpc('radar_get_shortlist',{p_limit:p.limit??20}));
      case 'save_evaluation': {
        const allowed=['job_id','lease_token','content_hash','score','priority','eligibility','summary','reasons','gaps','evidence'];
        if(Object.keys(p).some(k=>!allowed.includes(k))) return reply({error:'unknown_parameter'},400);
        return reply(await rpc('radar_save_evaluation',Object.fromEntries(Object.entries(p).map(([k,v])=>[`p_${k}`,v]))));
      }
      case 'briefing_window': return reply(await rpc('radar_briefing_window'));
      case 'save_briefing': return reply(await rpc('radar_save_briefing',{p_through:p.through,p_body:p.body}));
      case 'deliver_briefing': return reply(await rpc('radar_deliver_briefing',{p_id:p.id}));
      case 'poll': return reply(await poll());
      case 'collect': {
        const profile=validateProfile(await rpc('radar_get_profile'));
        const results=await Promise.allSettled([publicCollect('himalayas',profile),publicCollect('remotive',profile),publicCollect('wwr',profile),startLinkedin(profile)]);
        return reply(results.map((r,i)=>r.status==='fulfilled'?r.value:{source:['himalayas','remotive','wwr','apify_bebity'][i],error:'collector_request_failed'}));
      }
    }
  } catch {return reply({error:'request_failed',action:input.action},502);}
});
