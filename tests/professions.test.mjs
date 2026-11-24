import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectionPlan, jobMatchesProfile, publishableProfile, validateProfile } from '../supabase/functions/_shared/search-profile.mjs';

const sample = JSON.parse(readFileSync(new URL('../config/profile.example.json', import.meta.url)));

function accountingProfile() {
  const profile = structuredClone(sample);
  profile.version = 'synthetic-accounting';
  profile.experience = [];
  profile.skills = [];
  profile.preferences.work_country_aliases = ['DE', 'Germany', 'Deutschland'];
  profile.search_tracks = { accounting: ['Bilanzbuchhalter', 'Financial Accountant'] };
  profile.search.geographies = {
    de_hybrid: { label: 'Germany', country: 'DE', work_types: ['hybrid'], geo_id: '101282230', verified_at: '2026-11-24', quality_markers: ['Germany', 'Deutschland'] },
  };
  profile.search.rotation = [{ track: 'accounting', lane: 'de_hybrid' }];
  profile.search.employment_types = ['part_time'];
  profile.search.experience_levels = ['mid_senior', 'director'];
  profile.search.filters.title_terms = ['buchhalter', 'accountant'];
  profile.search.sources.apify_bebity.enabled = true;
  return profile;
}

test('hybrid German accounting can be searched without full-time jobs or internships', () => {
  const profile = accountingProfile();
  const plan = collectionPlan(profile, 0, 'apify_bebity');
  assert.equal(plan.max_results, 12);
  const urls = plan.input.startUrls.map(entry => new URL(entry.url));
  assert.deepEqual(urls.map(url => url.searchParams.get('keywords')), ['Bilanzbuchhalter', 'Financial Accountant']);
  for (const { searchParams } of urls) {
    assert.equal(searchParams.get('geoId'), '101282230');
    assert.equal(searchParams.get('f_WT'), '3');
    assert.equal(searchParams.get('f_E'), '4,5');
    assert.equal(searchParams.get('f_JT'), 'P');
  }
  assert.equal(collectionPlan(profile, 0, 'himalayas').enabled, false);
  assert.equal(collectionPlan(profile, 0, 'remotive').enabled, false);
  const job = { title: 'Senior Bilanzbuchhalter', work_type: 'Hybrid', country_restrictions: ['DE'] };
  assert.equal(jobMatchesProfile(job, profile).accepted, true);
  assert.equal(jobMatchesProfile({ ...job, work_type: 'Remote' }, profile).reason, 'excluded_work_type');
  assert.equal(jobMatchesProfile({ ...job, source_claims: { apify_bebity: { contractType: 'Full-time' } } }, profile).reason, 'excluded_employment_type');
});

test('US customer support uses public remote feeds without an Apify token or verified geo ID', () => {
  assert.equal(collectionPlan(sample, 0, 'apify_bebity').enabled, false);
  const himalayas = new URL(collectionPlan(sample, 0, 'himalayas').urls[0]);
  assert.equal(himalayas.searchParams.get('q'), 'customer support specialist');
  assert.equal(himalayas.searchParams.get('country'), 'US');
  assert.equal(himalayas.searchParams.get('employment_type'), 'Part Time,Contractor');
  const remotive = new URL(collectionPlan(sample, 0, 'remotive').urls[0]);
  assert.equal(remotive.searchParams.has('category'), false);
  const job = { title: 'Customer Support Specialist', location: 'US Only', work_type: 'remote' };
  assert.equal(jobMatchesProfile(job, sample).accepted, true);
  assert.equal(jobMatchesProfile({ ...job, country_restrictions: ['United States'] }, sample).accepted, true);
  assert.equal(jobMatchesProfile({ ...job, country_restrictions: ['Germany'] }, sample).reason, 'explicit_country_restriction');
});

test('broad employment settings and empty title filters are valid', async () => {
  const profile = structuredClone(sample);
  profile.search.employment_types = [];
  profile.search.filters.title_terms = [];
  const checked = await publishableProfile(profile);
  assert.equal(new URL(collectionPlan(checked, 0, 'himalayas').urls[0]).searchParams.has('employment_type'), false);
  assert.equal(jobMatchesProfile({ title: 'Account Manager' }, checked).accepted, true);
});

test('optional LinkedIn enforces location verification and the result cap when enabled', () => {
  const profile = structuredClone(sample);
  profile.search.sources.apify_bebity.enabled = true;
  assert.throws(() => validateProfile(profile), /verified LinkedIn geography/);
  const accounting = accountingProfile();
  accounting.search.sources.apify_bebity.queries = 4;
  assert.throws(() => validateProfile(accounting), /LinkedIn trial cap/);
});
