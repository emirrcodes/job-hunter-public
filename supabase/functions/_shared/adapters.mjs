import {identityKey,safeUrl,normalizeLinkedin} from './normalize.mjs';
import {jobMatchesProfile} from './search-profile.mjs';
export function text(value) {
  return String(value ?? '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]*>/g,' ')
    .replace(/&#(x[0-9a-f]+|\d+);/gi,(_,n)=>{const c=n[0].toLowerCase()==='x'?parseInt(n.slice(1),16):+n;return c>0&&c<=0x10ffff?String.fromCodePoint(c):' ';})
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,s)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[s]))
    .replace(/\s+/g,' ').trim().slice(0,140000);
}
export function iso(value) {
  if (!value) return null;
  const date = new Date(typeof value==='number' && value<1e12?value*1000:value);
  return Number.isNaN(+date)?null:date.toISOString();
}
// Broad relevance gate, not a seniority or country gate. Rejected counts are recorded.
export function relevant(raw) {
  const title = String(raw.title || '');
  return /software|develop|engineer|backend|back.end|full.stack|frontend|front.end|react|typescript|python|java\b|\.net|node\b|programmer|automation|machine.learning|yazılım/i.test(title)
    && !/sales engineer|civil engineer|mechanical engineer|electrical engineer|chemical engineer|manufacturing engineer/i.test(title);
}
export function normalize(source,raw) {
  let job;
  if (source==='apify_bebity') job=normalizeLinkedin(source,raw);
  else if(source==='himalayas') job={
    title:raw.title,company:raw.companyName,source_url:raw.guid,apply_url:raw.applicationLink,
    location:(raw.locationRestrictions||[]).join(', ') || 'Worldwide (source label)',work_type:'remote',
    description:raw.description,country_restrictions:raw.locationRestrictions?.length?raw.locationRestrictions:null,
    published_at:iso(raw.pubDate),expires_at:iso(raw.expiryDate),
    source_claims:{himalayas:{locationRestrictions:raw.locationRestrictions,timezoneRestrictions:raw.timezoneRestrictions,
      seniority:raw.seniority,employmentType:raw.employmentType,salary:{min:raw.minSalary,max:raw.maxSalary,currency:raw.currency,period:raw.salaryPeriod},
      attribution:'Himalayas',attribution_url:'https://himalayas.app'}}};
  else if(source==='remotive') job={
    title:raw.title,company:raw.company_name,source_url:raw.url,apply_url:null,
    location:raw.candidate_required_location||'',work_type:'remote',description:raw.description,
    country_restrictions:null,published_at:iso(raw.publication_date),
    source_claims:{remotive:{location:raw.candidate_required_location,salary:raw.salary,tags:raw.tags,job_type:raw.job_type,
      attribution:'Remotive',attribution_url:'https://remotive.com',public_api_delay_hours:24}}};
  else if(source==='wwr') {
    const split=String(raw.title||'').indexOf(':');
    if(split<1) throw new Error('WWR company separator missing');
    job={title:raw.title.slice(split+1).trim(),company:raw.title.slice(0,split).trim(),
      source_url:raw.link||raw.guid,apply_url:null,location:raw.region||raw.country||'',
      work_type:'remote',description:raw.description,country_restrictions:null,
      published_at:iso(raw.pubDate),expires_at:iso(raw.expires_at),
      source_claims:{wwr:{region:raw.region,country:raw.country,category:raw.category,type:raw.type,
        attribution:'We Work Remotely',attribution_url:'https://weworkremotely.com'}}};
  } else throw new Error('Unknown source');
  job.title=text(job.title); job.company=text(job.company);
  job.source_url=safeUrl(job.source_url); job.apply_url=safeUrl(job.apply_url);
  if(!job.title||!job.company||!job.source_url) throw new Error('Required job field missing');
  job.description=text(job.description);
  job.identity_key=identityKey({source,sourceId:raw.id,url:job.source_url,applyUrl:job.apply_url});
  job.is_closed=job.is_closed===true;
  if(job.is_closed) job.closure_evidence='Provider jobState=CLOSED';
  if(source==='apify_bebity') job.source_claims={apify_bebity:{experienceLevel:raw.experienceLevel,workType:raw.workType,
    salary:raw.salary,contractType:raw.contractType,scrapingInfo:raw.scrapingInfo,attribution:'LinkedIn via Apify/Bebity'}};
  return {job,provider_job_id:String(raw.id||raw.guid||raw.jobUrl||raw.url||raw.link||''),raw};
}
export function batch(source,records,{profile,now=Date.now()}={}) {
  if(!Array.isArray(records)) throw new Error('Invalid provider records');
  const items=[]; let invalid=0,irrelevant=0; const filtered_by_reason={};
  for(const raw of records) {
    if(!profile&&!relevant(raw)){irrelevant++;continue;}
    try {
      const item=normalize(source,raw);
      if(profile) {
        const match=jobMatchesProfile(item.job,profile,now);
        if(!match.accepted){irrelevant++;filtered_by_reason[match.reason]=(filtered_by_reason[match.reason]||0)+1;continue;}
      }
      items.push(item);
    } catch { invalid++; }
  }
  return {items,metrics:{invalid,irrelevant,filtered_by_reason,short_descriptions:items.filter(x=>x.job.description.length<300).length}};
}
export function wwrItems(xml,Parser) {
  if(/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('DTD is not supported');
  const parsed=new Parser({ignoreAttributes:true,processEntities:true,trimValues:true}).parse(xml);
  if(!parsed?.rss?.channel) throw new Error('RSS channel missing');
  const items=parsed.rss.channel.item??[];
  return Array.isArray(items)?items:[items];
}
