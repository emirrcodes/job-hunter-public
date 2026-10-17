import { writeFile, mkdir } from 'node:fs/promises';
import {loadEnv,projectTarget} from './lib.mjs';
loadEnv();
const {ref}=projectTarget();
async function get(url, token) {
  const r = await fetch(url,{headers:token?{Authorization:`Bearer ${token}`}:{},signal:AbortSignal.timeout(25000)});
  const body = await r.json().catch(()=>({}));
  if (!r.ok) return {http_status:r.status,error:body?.error?.type || body?.error_code || body?.code || 'request_failed'};
  return {http_status:r.status,data:body.data ?? body};
}
const specs = [
 ['supabase_project',`https://api.supabase.com/v1/projects/${ref}`,process.env.SUPABASE_ACCESS_TOKEN],
 ['apify_limits','https://api.apify.com/v2/users/me/limits',process.env.APIFY_TOKEN],
 ['apify_usage','https://api.apify.com/v2/users/me/usage/monthly',process.env.APIFY_TOKEN],
 ['apify_actor','https://api.apify.com/v2/acts/bebity~linkedin-jobs-scraper',process.env.APIFY_TOKEN],
 ['apify_build','https://api.apify.com/v2/acts/bebity~linkedin-jobs-scraper/builds/default',process.env.APIFY_TOKEN],
];
await mkdir(new URL('../local/',import.meta.url),{recursive:true});
const report = {};
for (const [key,url,token] of specs) {
  try {
    const result = await get(url,token);
    if (result.data) {
      const d = result.data;
      if (key==='supabase_project') report[key] = {http_status:result.http_status,id:d.id,name:d.name,region:d.region,status:d.status};
      else if (key==='apify_actor') report[key] = {http_status:result.http_status,id:d.id,name:d.name,pricingInfos:d.pricingInfos,currentPricingInfo:d.currentPricingInfo,defaultRunOptions:d.defaultRunOptions,taggedBuilds:d.taggedBuilds};
      else if (key==='apify_build') report[key] = {http_status:result.http_status,id:d.id,status:d.status,actorDefinition:d.actorDefinition,actorDefinitionKeys:Object.keys(d.actorDefinition||{})};
      else report[key] = {http_status:result.http_status,...d};
    } else report[key] = result;
  } catch (e) { report[key] = {error:e.name || 'network_error'}; }
}
// This allowlisted report contains no account email, credentials or request headers.
await writeFile(new URL('../local/access-report.json',import.meta.url),JSON.stringify(report,null,2),{mode:0o600});
console.log(JSON.stringify(Object.fromEntries(Object.entries(report).map(([key,r])=>[key,{
  http_status:r.http_status, error:r.error,
  ...(key==='supabase_project'?{id:r.id,region:r.region,status:r.status}:{}),
  ...(key==='apify_limits'?{limits:r.limits,current:r.current}:{}),
  ...(key==='apify_build'?{id:r.id,status:r.status}:{}),
}])) ,null,2));
