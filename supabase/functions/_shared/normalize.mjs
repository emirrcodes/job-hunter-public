// Shared pure helpers for future Edge Function adapters. No network or secrets.
export function safeUrl(value) {
  try {
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) return null;
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|trk$|trackingId$|refId$|_l$)/i.test(key)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    return u.toString();
  } catch { return null; }
}

export function linkedinId(value) {
  const url = safeUrl(value);
  if (!url) return null;
  const u = new URL(url);
  if (!/(^|\.)linkedin\.com$/i.test(u.hostname)) return null;
  const pathId = u.pathname.match(/\/jobs\/view\/(?:[^/]*-)?(\d+)\/?$/)?.[1];
  return pathId || (/^\d+$/.test(u.searchParams.get('currentJobId') || '') ? u.searchParams.get('currentJobId') : null);
}

export function identityKey({ source, sourceId, url, applyUrl }) {
  const li = linkedinId(url) || linkedinId(applyUrl);
  if (li) return `linkedin:${li}`;
  const apply = safeUrl(applyUrl);
  // Only a job-specific ATS URL is a cross-source key. Generic company careers
  // home pages must not collapse different vacancies into one.
  if (apply) {
    const u = new URL(apply);
    if ((['jobs.lever.co', 'jobs.eu.lever.co', 'jobs.ashbyhq.com'].includes(u.hostname) && u.pathname.split('/').filter(Boolean).length >= 2)
      || (/(^|\.)greenhouse\.io$/.test(u.hostname) && (/\/jobs\/\d+/.test(u.pathname) || /^\d+$/.test(u.searchParams.get('gh_jid') || '')))) return `ats:${apply}`;
  }
  const canonical = safeUrl(url);
  if (canonical) return `url:${canonical}`;
  if (source && sourceId) return `source:${source}:${sourceId}`;
  throw new Error('A trustworthy job URL or source id is required');
}

function nonempty(...values) { return values.find(v => typeof v === 'string' && v.trim())?.trim() || ''; }
function dateOrNull(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(+date) ? null : date.toISOString();
}

export function normalizeLinkedin(provider, raw) {
  if (!['apify_bebity', 'brightdata'].includes(provider)) throw new Error('Unsupported LinkedIn provider');
  const title = nonempty(raw.title, raw.job_title);
  const company = nonempty(raw.companyName, raw.company_name);
  const url = safeUrl(nonempty(raw.jobUrl, raw.url));
  if (!title || !company || !url) throw new Error('Missing title, company or valid URL');
  const applyUrl = safeUrl(nonempty(raw.applyUrl, raw.apply_link, raw.application_url));
  const description = nonempty(raw.description, raw.job_description_formatted, raw.job_summary);
  return {
    identity_key: identityKey({ source: provider, sourceId: raw.id || raw.job_posting_id, url, applyUrl }),
    title, company, source_url: url, apply_url: applyUrl,
    location: nonempty(raw.location, raw.job_location),
    work_type: nonempty(raw.workType, raw.work_type) || 'unknown',
    description,
    // Provider label is not proof of hiring eligibility. Codex evaluates it.
    country_restrictions: null,
    published_at: dateOrNull(raw.publishedAt || raw.job_posted_date),
    is_closed: raw.jobState === 'CLOSED',
    description_quality: description.length >= 300 ? 'present' : 'short_or_missing',
    source: provider,
  };
}
