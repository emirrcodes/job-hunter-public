import { linkedinSearchUrl, linkedinUrlInput } from './linkedin.mjs';
import * as legacy from './search-profile-v1.mjs';

export const sourceIds = ['apify_bebity', 'himalayas', 'remotive', 'wwr'];
const workIds = { on_site: '1', remote: '2', hybrid: '3' };
const experienceIds = { internship: '1', entry_level: '2', associate: '3', mid_senior: '4', director: '5', executive: '6' };
const employmentTypes = {
  full_time: { linkedin: 'F', himalayas: 'Full Time' },
  part_time: { linkedin: 'P', himalayas: 'Part Time' },
  contract: { linkedin: 'C', himalayas: 'Contractor' },
  temporary: { linkedin: 'T', himalayas: 'Temporary' },
  internship: { linkedin: 'I', himalayas: 'Intern' },
  volunteer: { linkedin: 'V', himalayas: 'Volunteer' },
  other: { linkedin: 'O', himalayas: 'Other' },
};
const fold = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const has = (value, terms) => terms.some(term => fold(value).includes(fold(term)));
const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
const strings = value => Array.isArray(value) && value.every(item => typeof item === 'string' && item.trim());
const choices = (values, map) => strings(values) && values.every(value => Object.hasOwn(map, value));
export const collectionSlot = (now = Date.now()) => Math.floor((now / 1000 - 14400) / 43200);

export function validateProfile(profile) {
  const s = profile?.search;
  if (s?.schema_version === 1) return legacy.validateProfile(profile);
  if (typeof profile?.version !== 'string' || !profile.version.trim() || !profile.search_tracks || s?.schema_version !== 2) {
    throw new Error('Profile/search schema missing');
  }
  const errors = [];
  if (typeof s.enabled !== 'boolean' || !integer(s.freshness_days, 1, 90)) errors.push('freshness/enabled');
  if (!choices(s.experience_levels, experienceIds)) errors.push('experience_levels');
  if (!choices(s.employment_types, employmentTypes)) errors.push('employment_types');
  if (!strings(profile.preferences?.work_country_aliases) || !profile.preferences.work_country_aliases.length) {
    errors.push('preferences.work_country_aliases');
  }
  if (!Array.isArray(s.rotation) || !s.rotation.length || s.rotation.length > 100) errors.push('rotation');
  else for (const entry of s.rotation) {
    const track = profile.search_tracks[entry?.track];
    if (!strings(track) || !track.length || !Object.hasOwn(s.geographies ?? {}, entry?.lane)) errors.push('rotation track or geography');
  }
  for (const [name, geography] of Object.entries(s.geographies ?? {})) {
    if (!geography || typeof geography.label !== 'string' || !geography.label.trim() || !choices(geography.work_types, workIds)
      || !geography.work_types.length || !/^[A-Z]{2}$/.test(geography.country ?? '')) errors.push(`geography ${name}`);
    if (s.sources?.apify_bebity?.enabled && (!/^\d+$/.test(geography?.geo_id ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(geography?.verified_at ?? '')
      || !strings(geography?.quality_markers))) errors.push(`verified LinkedIn geography ${name}`);
  }
  for (const id of sourceIds) if (typeof s.sources?.[id]?.enabled !== 'boolean') errors.push(`source ${id}`);
  const linkedin = s.sources?.apify_bebity;
  if (!integer(linkedin?.queries, 1, 4) || !integer(linkedin?.results_per_query, 1, 10)
    || linkedin.queries * linkedin.results_per_query > 20) errors.push('LinkedIn trial cap (max 20)');
  const himalayas = s.sources?.himalayas;
  if (!integer(himalayas?.pages_per_query, 1, 3) || !['recent', 'relevant'].includes(himalayas.sort)) errors.push('Himalayas bounds');
  const remotive = s.sources?.remotive;
  if (!integer(remotive?.result_limit, 1, 400) || typeof remotive.category !== 'string') errors.push('Remotive bounds');
  if (!integer(s.sources?.wwr?.item_limit, 1, 400)) errors.push('WWR bounds');
  for (const field of ['title_terms', 'excluded_title_terms', 'excluded_seniority_terms']) {
    if (!strings(s.filters?.[field])) errors.push(`filters.${field}`);
  }
  if (errors.length) throw new Error(`Invalid search profile: ${errors.join(', ')}`);
  return profile;
}

export async function publishableProfile(profile) {
  const copy = structuredClone(validateProfile(profile));
  delete copy.revision;
  delete copy.evaluation_version;
  function ordered(value) {
    if (Array.isArray(value)) return value.map(ordered);
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, ordered(child)]).sort(([a], [b]) => (a > b) - (a < b)));
    }
    return value;
  }
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(ordered(copy))));
  copy.revision = Array.from(new Uint8Array(hash), value => value.toString(16).padStart(2, '0')).join('');
  copy.evaluation_version = `${copy.version}+${copy.revision.slice(0, 12)}`;
  return copy;
}

export function collectionPlan(profile, slot, source) {
  if (profile?.search?.schema_version === 1) return legacy.collectionPlan(profile, slot, source);
  validateProfile(profile);
  if (!Number.isSafeInteger(slot) || slot < 0) throw new Error('Invalid collection slot');
  if (!sourceIds.includes(source)) throw new Error('Unsupported source');
  const s = profile.search;
  const config = s.sources[source];
  if (!s.enabled || !config.enabled) return { source, enabled: /** @type {const} */ (false) };
  const rotation = s.rotation[slot % s.rotation.length];
  const geography = s.geographies[rotation.lane];
  if (source !== 'apify_bebity' && !geography.work_types.includes('remote')) {
    return { source, enabled: /** @type {const} */ (false), reason: 'remote_source_outside_lane' };
  }
  const keywords = [...new Set(profile.search_tracks[rotation.track])];
  const cycle = Math.floor(slot / s.rotation.length);
  const result = { source, enabled: /** @type {const} */ (true), profile_revision: profile.revision, lane: rotation.lane, track: rotation.track, geography };
  if (source === 'apify_bebity') {
    const urls = Array.from({ length: Math.min(config.queries, keywords.length) }, (_, index) => linkedinSearchUrl({
      keyword: keywords[(cycle + index) % keywords.length],
      geography: { geoId: geography.geo_id, label: geography.label },
      workTypes: geography.work_types.map(value => workIds[value]),
      experienceLevels: s.experience_levels.map(value => experienceIds[value]),
      contractTypes: s.employment_types.map(value => employmentTypes[value].linkedin),
      ageSeconds: s.freshness_days * 86400,
    }));
    return { ...result, input: linkedinUrlInput(urls, config.results_per_query), max_results: urls.length * config.results_per_query };
  }
  if (source === 'himalayas') {
    const urls = Array.from({ length: config.pages_per_query }, (_, index) => {
      const url = new URL('https://himalayas.app/jobs/api/search');
      url.search = new URLSearchParams({ q: keywords[cycle % keywords.length], country: geography.country, sort: config.sort, page: String(index + 1) });
      if (s.employment_types.length) url.searchParams.set('employment_type', s.employment_types.map(value => employmentTypes[value].himalayas).join(','));
      return url.toString();
    });
    return { ...result, urls, max_results: urls.length * 20 };
  }
  if (source === 'remotive') {
    const url = new URL('https://remotive.com/api/remote-jobs');
    if (config.category) url.searchParams.set('category', config.category);
    url.searchParams.set('limit', String(config.result_limit));
    return { ...result, urls: [url.toString()], max_results: config.result_limit };
  }
  return { ...result, urls: ['https://weworkremotely.com/remote-jobs.rss'], max_results: config.item_limit };
}

export function jobMatchesProfile(job, profile, now = Date.now()) {
  const s = profile.search;
  if (s.schema_version === 1) return legacy.jobMatchesProfile(job, profile, now);
  const filter = s.filters;
  if (has(job.title, filter.excluded_title_terms)) return { accepted: false, reason: 'excluded_role' };
  if (filter.title_terms.length && !has(job.title, filter.title_terms)) return { accepted: false, reason: 'unrelated_role' };
  if (has(job.title, filter.excluded_seniority_terms)) return { accepted: false, reason: 'excluded_seniority' };
  const published = Date.parse(job.published_at ?? '');
  if (Number.isFinite(published) && published < now - s.freshness_days * 86400000) return { accepted: false, reason: 'older_than_window' };
  const aliases = new Set(profile.preferences.work_country_aliases.map(fold));
  if (Array.isArray(job.country_restrictions) && job.country_restrictions.length && !job.country_restrictions.some(country => aliases.has(fold(country)))) {
    return { accepted: false, reason: 'explicit_country_restriction' };
  }
  const remoteOrHybrid = fold(job.work_type).replace(/[^a-z]/g, '');
  const workType = remoteOrHybrid === 'onsite' ? 'on_site' : remoteOrHybrid;
  if (Object.hasOwn(workIds, workType) && !s.rotation.some(entry => s.geographies[entry.lane].work_types.includes(workType))) {
    return { accepted: false, reason: 'excluded_work_type' };
  }
  const rawType = job.source_claims?.apify_bebity?.contractType ?? job.source_claims?.himalayas?.employmentType
    ?? job.source_claims?.remotive?.job_type ?? job.source_claims?.wwr?.type;
  const normalizeEmployment = value => fold(value).replace(/[^a-z]/g, '').replace(/^(contractor|freelance)$/, 'contract').replace(/^intern$/, 'internship');
  const employmentType = normalizeEmployment(rawType);
  const explicitType = Object.keys(employmentTypes).find(value => normalizeEmployment(value) === employmentType);
  if (explicitType && s.employment_types.length && !s.employment_types.includes(explicitType)) {
    return { accepted: false, reason: 'excluded_employment_type' };
  }
  return { accepted: true, reason: 'matches_profile' };
}
