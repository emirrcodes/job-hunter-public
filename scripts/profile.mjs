import {existsSync,readFileSync} from 'node:fs';
import {loadEnv,query,sqlLiteral,root} from './lib.mjs';
import {publishableProfile,collectionPlan,collectionSlot,jobMatchesProfile,sourceIds} from '../supabase/functions/_shared/search-profile.mjs';
const command=process.argv[2]||'check';
const localProfile=new URL('local/profile.json',root);
const hasLocalProfile=existsSync(localProfile);
const profile=await publishableProfile(JSON.parse(readFileSync(hasLocalProfile ? localProfile : new URL('config/profile.example.json',root),'utf8')));
if(command==='push'&&(!hasLocalProfile||profile.version.startsWith('example-'))) {
 console.error('Customize local/profile.json and replace its example version before publishing a profile.');
 process.exit(1);
}
if(command==='check') {console.log({valid:true,revision:profile.revision,evaluation_version:profile.evaluation_version});process.exit(0);}
if(command==='plan') {
 const slotFlag=process.argv.indexOf('--slot');const slot=slotFlag===-1?collectionSlot():Number(process.argv[slotFlag+1]);
 console.log(JSON.stringify({mode:'PLAN ONLY; no external requests',revision:profile.revision,plans:sourceIds.map(id=>collectionPlan(profile,slot,id))},null,2));process.exit(0);
}
loadEnv();
if(command==='status') {
 const [row]=await query('select public.radar_get_profile() profile');
 console.log({local_revision:profile.revision,live_revision:row.profile?.revision,in_sync:row.profile?.revision===profile.revision});process.exit(0);
}
if(command!=='push') throw new Error('Use profile.mjs check|plan|push|status');
const jobs=[];let after='00000000-0000-0000-0000-000000000000';
for(;;) {
 const rows=await query(`select id,title,company,location,work_type,published_at,country_restrictions,source_claims,discovery_state from public.radar_jobs where id>${sqlLiteral(after)}::uuid order by id limit 500`);
 jobs.push(...rows);if(rows.length<500)break;after=rows.at(-1).id;
}
const now=Date.now();const decisions=jobs.filter(j=>j.discovery_state!=='quarantined').map(job=>{
 const match=jobMatchesProfile(job,profile,now);return {job_id:job.id,state:match.accepted?'candidate':'excluded',reason:match.reason};
});
const statements=['begin;',`select public.radar_publish_profile(${sqlLiteral(JSON.stringify(profile))}::jsonb);`];
for(let i=0;i<decisions.length;i+=500) statements.push(`select public.radar_reclassify_jobs(${sqlLiteral(profile.revision)},${sqlLiteral(JSON.stringify(decisions.slice(i,i+500)))}::jsonb);`);
statements.push(`update public.radar_sources set enabled=coalesce(
  public.radar_get_profile()->'search'->'enabled'='true'::jsonb and
  public.radar_get_profile()->'search'->'sources'->id->'enabled'='true'::jsonb,false
) where id in ('himalayas','remotive','wwr','apify_bebity') and stage<>'broken'
  and exists(select 1 from public.radar_settings where key='collection_enabled' and value='true');`, 'commit;');
await query(statements.join('\n'));
console.log({published:profile.revision,classified:decisions.length,candidate:decisions.filter(x=>x.state==='candidate').length,excluded:decisions.filter(x=>x.state==='excluded').length,quarantined_preserved:jobs.length-decisions.length});
