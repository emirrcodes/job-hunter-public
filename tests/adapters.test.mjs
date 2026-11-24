import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {XMLParser} from 'fast-xml-parser';
import {normalize,batch,wwrItems} from '../src/adapters.mjs';
test('Himalayas epoch seconds and explicit restrictions survive normalization',()=>{
  const {job}=normalize('himalayas',{title:'Software Engineer',companyName:'Example',guid:'https://himalayas.app/jobs/1',pubDate:1789962228,expiryDate:1792249223,locationRestrictions:['Turkey'],description:'<p>Java &amp; SQL</p>'});
  assert.equal(job.published_at,'2026-09-21T03:43:48.000Z');
  assert.deepEqual(job.country_restrictions,['Turkey']); assert.equal(job.description,'Java & SQL');
});
test('WWR region is provenance, not proof that conflicting description allows Turkey',()=>{
  const raw=wwrItems('<rss><channel><item><title>Example: Software Engineer</title><link>https://example.com/job/1</link><region>Anywhere in the World</region><description>Must reside in Canada</description></item></channel></rss>',XMLParser);
  const {job}=normalize('wwr',raw[0]);
  assert.equal(job.title,'Software Engineer'); assert.equal(job.company,'Example');
  assert.equal(job.country_restrictions,null); assert.match(job.description,/Canada/);
  assert.throws(()=>wwrItems('<!DOCTYPE rss><rss/>',XMLParser));
});
test('public feed filtering uses the candidate profile and records malformed results',()=>{
  const profile=JSON.parse(readFileSync(new URL('../config/profile.example.json',import.meta.url)));
  const data=batch('remotive',[
    {title:'Senior Customer Support Specialist',company_name:'Example',url:'https://example.com/1'},
    {title:'Customer Support Specialist'},
    {title:'Fictional Payroll Coordinator',company_name:'Example',url:'https://example.com/2'},
  ], {profile});
  assert.equal(data.items.length,1); assert.equal(data.metrics.invalid,1); assert.equal(data.metrics.irrelevant,1);
  assert.equal(data.metrics.filtered_by_reason.unrelated_role,1);
});
