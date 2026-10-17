import {linkedinSearchUrl,linkedinUrlInput} from './linkedin.mjs';
const sourceIds=['apify_bebity','himalayas','remotive','wwr'];
const workIds={on_site:'1',remote:'2',hybrid:'3'};
const experienceIds={internship:'1',entry_level:'2',associate:'3',mid_senior:'4',director:'5'};
const fold=value=>String(value??'').normalize('NFKD').replace(/\p{M}/gu,'').replaceAll('ı','i').toLowerCase();
const has=(value,terms)=>terms.some(term=>fold(value).includes(fold(term)));
const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
function list(value){return Array.isArray(value)&&value.length>0&&value.every(s=>typeof s==='string'&&s.trim());}
export function validateProfile(profile) {
  const s=profile?.search; const errors=[];
  if(!profile?.version||!profile?.search_tracks||s?.schema_version!==1) throw new Error('Profile/search schema missing');
  if(typeof s.enabled!=='boolean'||!integer(s.freshness_days,1,90)||!integer(s.internship_freshness_days,1,90)) errors.push('freshness/enabled');
  if(!list(s.experience_levels)||s.experience_levels.some(x=>!experienceIds[x])) errors.push('experience_levels');
  if(!list(profile.preferences?.employment_priority?.primary)||!list(profile.preferences?.employment_priority?.high)
    ||!profile.preferences.employment_priority.primary.includes('full_time')||!profile.preferences.employment_priority.high.includes('internship')) errors.push('full-time and internship priorities');
  if(!Array.isArray(s.rotation)||!s.rotation.length||s.rotation.length>100) errors.push('rotation');
  else for(const entry of s.rotation) {
    if(!list(profile.search_tracks[entry.track])||!s.geographies?.[entry.lane]) errors.push(`rotation ${entry.track}/${entry.lane}`);
  }
  if(!list(profile.search_tracks.internship)) errors.push('internship keywords');
  for(const [name,g] of Object.entries(s.geographies||{})) {
    if(!/^\d+$/.test(g.geo_id||'')||!g.label||!g.verified_at||!list(g.work_types)||g.work_types.some(x=>!workIds[x])
      ||!/^[A-Z]{2}$/.test(g.country||'')||!list(g.country_aliases)||!Array.isArray(g.quality_markers)) errors.push(`geography ${name}`);
  }
  for(const id of sourceIds) if(typeof s.sources?.[id]?.enabled!=='boolean') errors.push(`source ${id}`);
  const li=s.sources?.apify_bebity;
  if(!integer(li?.primary_queries,1,2)||li?.internship_queries!==1||!integer(li?.results_per_query,1,10)
    ||(li.primary_queries+li.internship_queries)*li.results_per_query>20) errors.push('LinkedIn trial cap (max 20)');
  const h=s.sources?.himalayas;
  if(h?.primary_queries!==1||h?.internship_queries!==1||!integer(h.pages_per_query,1,3)||h.results_per_page!==20||!['recent','relevant'].includes(h.sort)) errors.push('Himalayas bounds');
  if(!integer(s.sources?.remotive?.result_limit,1,400)||!s.sources?.remotive?.category) errors.push('Remotive bounds');
  if(!integer(s.sources?.wwr?.item_limit,1,400)) errors.push('WWR bounds');
  for(const field of ['title_terms','excluded_title_terms','excluded_seniority_terms','early_career_terms'])
    if(!list(s.filters?.[field])) errors.push(`filters.${field}`);
  if(s.filters?.seniority_handling!==undefined&&!['prefilter','model_review'].includes(s.filters.seniority_handling)) errors.push('filters.seniority_handling');
  if(s.filters?.keep_unknown_fields!==true) errors.push('unknown fields must be retained');
  if(errors.length) throw new Error(`Invalid search profile: ${errors.join(', ')}`);
  return profile;
}
export async function publishableProfile(profile) {
  const copy=structuredClone(validateProfile(profile));delete copy.revision;delete copy.evaluation_version;
  function ordered(v){if(Array.isArray(v))return v.map(ordered);if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,ordered(v[k])]));return v;}
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(ordered(copy))));
  copy.revision=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');
  copy.evaluation_version=`${copy.version}+${copy.revision.slice(0,12)}`;
  return copy;
}
export function collectionPlan(profile,slot,source) {
  validateProfile(profile);
  if(!Number.isSafeInteger(slot)||slot<0) throw new Error('Invalid collection slot');
  const s=profile.search,config=s.sources[source];
  if(!s.enabled||!config?.enabled) return {source,enabled:false};
  const rotation=s.rotation[slot%s.rotation.length];
  const geography=s.geographies[rotation.lane];
  const keywords=profile.search_tracks[rotation.track];
  const cycle=Math.floor(slot/s.rotation.length);
  const primary=Array.from({length:config.primary_queries||1},(_,i)=>keywords[(cycle+i)%keywords.length]);
  const internship=profile.search_tracks.internship[(slot+cycle)%profile.search_tracks.internship.length];
  const result={source,enabled:true,profile_revision:profile.revision,lane:rotation.lane,track:rotation.track,geography};
  if(source==='apify_bebity') {
    const common={geography:{geoId:geography.geo_id,label:geography.label},workTypes:geography.work_types.map(x=>workIds[x])};
    const urls=primary.map(keyword=>linkedinSearchUrl({...common,keyword,experienceLevels:s.experience_levels.map(x=>experienceIds[x]),contractTypes:['F'],ageSeconds:s.freshness_days*86400}));
    urls.push(linkedinSearchUrl({...common,keyword:internship,experienceLevels:[experienceIds.internship],contractTypes:['I'],ageSeconds:s.internship_freshness_days*86400}));
    return {...result,input:linkedinUrlInput(urls,config.results_per_query),max_results:urls.length*config.results_per_query};
  }
  if(source==='himalayas') {
    const urls=[];
    for(const [keyword,employmentType] of [[primary[0],'Full Time'],[internship,'Intern']]) {
      for(let page=1;page<=config.pages_per_query;page++) {
        const url=new URL('https://himalayas.app/jobs/api/search');
        url.search=new URLSearchParams({q:keyword,country:geography.country,employment_type:employmentType,sort:config.sort,page:String(page)});
        urls.push(url.toString());
      }
    }
    return {...result,urls,max_results:urls.length*config.results_per_page};
  }
  if(source==='remotive') {
    const url=new URL('https://remotive.com/api/remote-jobs');
    url.search=new URLSearchParams({category:config.category,limit:String(config.result_limit)});
    return {...result,urls:[url.toString()],max_results:config.result_limit};
  }
  if(source==='wwr') return {...result,urls:['https://weworkremotely.com/remote-jobs.rss'],max_results:config.item_limit};
  throw new Error('Unsupported source');
}
export function jobMatchesProfile(job,profile,now=Date.now()) {
  const s=profile.search,filter=s.filters;
  if(has(job.title,filter.excluded_title_terms)) return {accepted:false,reason:'excluded_role'};
  if(!has(job.title,filter.title_terms)) return {accepted:false,reason:'unrelated_role'};
  const early=has(job.title,filter.early_career_terms);
  // Archived profiles retain their original gate; current profiles can defer title labels to the evaluator.
  if(filter.seniority_handling!=='model_review'&&!early&&has(job.title,filter.excluded_seniority_terms)) return {accepted:false,reason:'senior_role'};
  const type=String(job.source_claims?.apify_bebity?.contractType||job.source_claims?.himalayas?.employmentType||job.source_claims?.remotive?.job_type||job.source_claims?.wwr?.type||'');
  const internship=has(type,['intern','staj'])||has(job.title,['intern','staj']);
  const maxAge=(internship?s.internship_freshness_days:s.freshness_days)*86400000;
  const published=Date.parse(job.published_at||'');
  if(Number.isFinite(published)&&published<now-maxAge) return {accepted:false,reason:'older_than_window'};
  const aliases=Object.values(s.geographies).flatMap(g=>g.country_aliases);
  if(Array.isArray(job.country_restrictions)&&job.country_restrictions.length&&!job.country_restrictions.some(c=>aliases.some(a=>fold(c)===fold(a))))
    return {accepted:false,reason:'explicit_country_restriction'};
  if(/\b(USA|US|United States|Canada|North America|Americas|UK|United Kingdom|Australia)\s+Only\b/i.test(job.location||''))
    return {accepted:false,reason:'explicit_country_restriction'};
  return {accepted:true,reason:internship?'high_priority_internship':'primary_or_adjacent'};
}
