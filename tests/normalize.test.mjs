import test from 'node:test';
import assert from 'node:assert/strict';
import { safeUrl, identityKey, linkedinId, normalizeLinkedin } from '../src/normalize.mjs';

test('LinkedIn providers and slug URLs resolve to the same posting identity', () => {
  assert.equal(linkedinId('https://www.linkedin.com/jobs/view/backend-at-company-123456/?trk=foo'), '123456');
  assert.equal(identityKey({url:'https://linkedin.com/jobs/view/123456'}), identityKey({url:'https://www.linkedin.com/jobs/view/backend-at-company-123456/?trk=foo'}));
});
test('tracking parameters are stripped but application identifiers are retained', () => {
  assert.equal(safeUrl('https://example.com/apply?job=42&utm_source=x#top'), 'https://example.com/apply?job=42');
});
test('generic company apply URL cannot merge different vacancies', () => {
  const a = identityKey({url:'https://board.example/jobs/one',applyUrl:'https://company.example/careers'});
  const b = identityKey({url:'https://board.example/jobs/two',applyUrl:'https://company.example/careers'});
  assert.notEqual(a,b);
});
test('job-specific ATS apply links allow cross-board deduplication', () => {
  const a = identityKey({url:'https://board1.example/one',applyUrl:'https://jobs.lever.co/acme/job-id?utm_source=one'});
  const b = identityKey({url:'https://board2.example/two',applyUrl:'https://jobs.lever.co/acme/job-id?utm_source=two'});
  assert.equal(a,b);
});
test('URL safety rejects scripts, credentials and lookalike LinkedIn domains', () => {
  assert.equal(safeUrl('javascript:alert(1)'),null);
  assert.equal(safeUrl('https://secret@example.com/'),null);
  assert.equal(linkedinId('https://linkedin.com.evil.example/jobs/view/123'),null);
});
test('Bright Data and Apify records normalize without inventing eligibility', () => {
  const a = normalizeLinkedin('apify_bebity',{title:'Backend Engineer',companyName:'Acme',jobUrl:'https://linkedin.com/jobs/view/123',location:'EMEA',description:'Short'});
  const b = normalizeLinkedin('brightdata',{job_title:'Backend Engineer',company_name:'Acme',url:'https://linkedin.com/jobs/view/123',job_location:'EMEA',job_summary:'Short'});
  assert.equal(a.identity_key,b.identity_key);
  assert.equal(a.country_restrictions,null);
  assert.equal(a.description_quality,'short_or_missing');
  assert.equal(a.published_at,null);
});
test('malformed job results fail validation rather than appearing as empty jobs', () => {
  assert.throws(()=>normalizeLinkedin('brightdata',{error:'blocked'}),/Missing/);
});
