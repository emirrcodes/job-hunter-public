import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {collectionPlan,validateProfile,publishableProfile,jobMatchesProfile} from '../supabase/functions/_shared/search-profile.mjs';
import {verifyLinkedinResults,linkedinSearchUrl} from '../supabase/functions/_shared/linkedin.mjs';
import {batch} from '../src/adapters.mjs';
const profile=JSON.parse(readFileSync(new URL('./fixtures/profile.json',import.meta.url)));
const now=Date.parse('2026-10-15T14:00:00Z');
test('every rotation includes full-time and high-priority internships inside the trial cap',()=>{
  for(let slot=0;slot<32;slot++) {
    const plan=collectionPlan(profile,slot,'apify_bebity');
    assert.equal(plan.max_results,18);
    const urls=plan.input.startUrls.map(x=>new URL(x.url));
    assert.equal(urls.filter(u=>u.searchParams.get('f_JT')==='F').length,2);
    assert.equal(urls.filter(u=>u.searchParams.get('f_JT')==='I').length,1);
    assert.ok(urls.every(u=>u.searchParams.get('geoId')===plan.geography.geo_id));
    assert.equal(plan.input.companyProfile,false);assert.equal(plan.input.enrichCompany,false);
  }
});
test('Türkiye uses the verified country id; no free-text geography fallback',()=>{
  const plan=collectionPlan(profile,0,'apify_bebity');
  assert.equal(new URL(plan.input.startUrls[0].url).searchParams.get('geoId'),'102105699');
  assert.equal(new URL(plan.input.startUrls[0].url).searchParams.get('location'),'Türkiye');
  assert.throws(()=>linkedinSearchUrl({keyword:'engineer',geography:{label:'Turkey'}}));
});
test('profile changes affect every provider plan without a code or deploy change',()=>{
  const changed=structuredClone(profile);changed.search_tracks.backend=['custom backend keyword'];
  changed.search.sources.apify_bebity.results_per_query=4;changed.search.sources.remotive.result_limit=30;
  assert.match(collectionPlan(changed,0,'apify_bebity').input.startUrls[0].url,/custom\+backend\+keyword/);
  assert.match(collectionPlan(changed,0,'himalayas').urls[0],/custom\+backend\+keyword/);
  assert.equal(collectionPlan(changed,0,'apify_bebity').max_results,12);
  assert.equal(new URL(collectionPlan(changed,0,'remotive').urls[0]).searchParams.get('limit'),'30');
  changed.search.sources.wwr.item_limit=200;assert.equal(collectionPlan(changed,0,'wwr').max_results,200);
});
test('bad profiles cannot remove internship discovery or raise the free trial cap',()=>{
  const p=structuredClone(profile);p.search.sources.apify_bebity.results_per_query=10;
  assert.throws(()=>validateProfile(p),/trial cap/);
  const q=structuredClone(profile);q.search.sources.apify_bebity.internship_queries=0;
  assert.throws(()=>validateProfile(q));
  const r=structuredClone(profile);r.search.geographies.turkey_remote.geo_id='Turkey';assert.throws(()=>validateProfile(r));
});
test('revision is stable across JSON key order and changes when preferences change',async()=>{
  const a=await publishableProfile(profile);
  const b=await publishableProfile(Object.fromEntries(Object.entries(profile).reverse()));
  assert.equal(a.revision,b.revision);
  const p=structuredClone(profile);p.search.freshness_days=14;
  assert.notEqual(a.evaluation_version,(await publishableProfile(p)).evaluation_version);
});
test('quality gate rejects the old Turkey/USA failure and foreign query provenance',()=>{
  const plan=collectionPlan(profile,0,'apify_bebity');const url=plan.input.startUrls[0].url;
  assert.throws(()=>verifyLinkedinResults([{location:'United States',scrapingInfo:{inputUrl:url}}],plan.input,plan.geography),/location_mismatch/);
  assert.throws(()=>verifyLinkedinResults([{location:'Türkiye',scrapingInfo:{location:'Turkey'}}],plan.input,plan.geography),/provenance_mismatch/);
  assert.equal(verifyLinkedinResults([{location:'Istanbul, Türkiye',scrapingInfo:{inputUrl:url}},{location:'EMEA',scrapingInfo:{inputUrl:url}}],plan.input,plan.geography).location_checked,true);
});
test('profile filter rejects actual pilot noise while preserving unknowns and internships',()=>{
  const job={title:'Junior Software Engineer',published_at:'2026-10-14T00:00:00Z',location:'EMEA'};
  assert.equal(jobMatchesProfile(job,profile,now).accepted,true);
  assert.equal(jobMatchesProfile({...job,title:'Sales Development Representative'},profile,now).reason,'excluded_role');
  assert.equal(jobMatchesProfile({...job,title:'Senior Software Engineer'},profile,now).accepted,true);
  assert.equal(jobMatchesProfile({...job,country_restrictions:['United States']},profile,now).reason,'explicit_country_restriction');
  assert.equal(jobMatchesProfile({...job,published_at:null},profile,now).accepted,true);
  assert.equal(jobMatchesProfile({...job,title:'Software Engineering Intern',published_at:'2026-09-25T00:00:00Z'},profile,now).reason,'high_priority_internship');
});
test('seniority labels reach model review while archived profiles retain their original gate',()=>{
 const job={title:'Senior Backend Engineer',published_at:'2026-10-14T00:00:00Z',location:'EMEA'};
 assert.equal(jobMatchesProfile(job,profile,now).accepted,true);
 const legacy=structuredClone(profile);delete legacy.search.filters.seniority_handling;
 assert.equal(jobMatchesProfile(job,legacy,now).reason,'senior_role');
 legacy.search.filters.seniority_handling='prefilter';
 assert.equal(jobMatchesProfile(job,legacy,now).reason,'senior_role');
 legacy.search.filters.seniority_handling='typo';assert.throws(()=>validateProfile(legacy),/seniority_handling/);
});
test('requested role families rotate without mobile discovery, including AI and forward deployed internships',()=>{
 const tracks=new Set(),keywords=new Set();
 for(let slot=0;slot<140;slot++) {
   const plan=collectionPlan(profile,slot,'apify_bebity');tracks.add(plan.track);
   for(const {url} of plan.input.startUrls) keywords.add(new URL(url).searchParams.get('keywords'));
 }
 assert.deepEqual([...tracks].sort(),['ai','backend','forward_deployed','fullstack','software']);
 for(const keyword of ['forward deployed engineer','forward deployed software engineer','AI engineer','full stack developer','software developer','software engineer','backend developer','backend engineer','AI engineer intern','forward deployed engineer intern']) assert.ok(keywords.has(keyword),keyword);
 for(const keyword of keywords) assert.doesNotMatch(keyword,/mobile|android|ios|react native|flutter/i);
 for(const title of ['Forward Deployed Engineer','Forward Deployed Software Engineer','AI Engineer Intern','Backend Engineer Intern']) assert.equal(jobMatchesProfile({title,location:'EMEA'},profile,now).accepted,true,title);
});
test('WWR company names do not accidentally match a role; per-reason counts remain visible',()=>{
 const records=[{title:'Developer Inc: Sales Development Representative',link:'https://example.com/1'},
   {title:'Example: Junior Software Engineer',link:'https://example.com/2'}];
 const data=batch('wwr',records,{profile,now});
 assert.equal(data.items.length,1);assert.equal(data.metrics.filtered_by_reason.excluded_role,1);
});
test('CV skills cannot change discovery queries or reject an unfamiliar technology',()=>{
 const withoutSkills=structuredClone(profile);withoutSkills.skills=[];
 const differentSkills=structuredClone(profile);differentSkills.skills=['COBOL','Erlang','Unlisted framework'];
 for(const source of ['apify_bebity','himalayas','remotive','wwr']) {
   assert.deepEqual(collectionPlan(withoutSkills,3,source),collectionPlan(differentSkills,3,source));
 }
 for(const title of ['Junior Rust Engineer','Elixir Engineer','Flutter Developer','Graduate Kotlin Engineer','Research Scientist']) {
   const job={title,published_at:'2026-10-14T00:00:00Z',location:'EMEA'};
   assert.equal(jobMatchesProfile(job,withoutSkills,now).accepted,true,title);
   assert.deepEqual(jobMatchesProfile(job,withoutSkills,now),jobMatchesProfile(job,differentSkills,now));
 }
});
test('role-family discovery contains no language or framework requirements',()=>{
 for(let slot=0;slot<64;slot++) {
   for(const source of ['apify_bebity','himalayas']) {
     const plan=collectionPlan(profile,slot,source);
     const urls=source==='apify_bebity'?plan.input.startUrls.map(x=>x.url):plan.urls;
     for(const value of urls) {
       const url=new URL(value);const keyword=url.searchParams.get(source==='apify_bebity'?'keywords':'q');
       assert.doesNotMatch(keyword,/react native|typescript|node\.?js|nestjs|spring|flutter|kotlin|swift|python|java\b|\.net/i);
     }
   }
 }
});
