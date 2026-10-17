-- Initial single-owner job radar. No schedules or paid requests are created.
begin;

create table public.radar_sources (
  id text primary key,
  label text not null,
  method text not null,
  stage text not null default 'planned'
    check (stage in ('research','planned','benchmark_pending','tested','active','paused','broken')),
  enabled boolean not null default false,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  created_at timestamptz not null default now()
);

create table public.radar_searches (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.radar_sources(id),
  name text not null,
  lane text not null check (lane in ('istanbul','turkey_remote','europe_remote','worldwide_remote','company_watchlist')),
  parameters jsonb not null default '{}'::jsonb check (jsonb_typeof(parameters) = 'object'),
  result_limit integer not null default 50 check (result_limit between 1 and 1000),
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  unique(source_id, name),
  unique(id, source_id)
);

create table public.radar_collection_runs (
  id uuid primary key default gen_random_uuid(),
  source_id text not null references public.radar_sources(id),
  search_id uuid,
  idempotency_key text not null unique,
  scheduled_for timestamptz not null,
  state text not null default 'planned'
    check (state in ('planned','starting','running','ingesting','succeeded','partial','failed','unknown')),
  external_run_id text,
  reserved_cost_usd numeric(12,6) not null default 0 check (reserved_cost_usd >= 0),
  actual_cost_usd numeric(12,6) check (actual_cost_usd >= 0),
  returned_count integer not null default 0 check (returned_count >= 0),
  accepted_count integer not null default 0 check (accepted_count >= 0),
  error_code text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key(search_id, source_id) references public.radar_searches(id, source_id),
  check (accepted_count <= returned_count)
);
create index radar_runs_pending_idx on public.radar_collection_runs(state, created_at)
  where state in ('starting','running','ingesting','unknown');

create table public.radar_jobs (
  id uuid primary key default gen_random_uuid(),
  identity_key text not null unique check (length(identity_key) > 0),
  title text not null check (length(trim(title)) > 0),
  company text not null check (length(trim(company)) > 0),
  location text not null default '',
  work_type text not null default 'unknown',
  source_url text not null check (source_url ~ '^https?://'),
  apply_url text check (apply_url is null or apply_url ~ '^https?://'),
  description text not null default '',
  country_restrictions jsonb check (country_restrictions is null or jsonb_typeof(country_restrictions) = 'array'),
  source_claims jsonb not null default '{}'::jsonb check (jsonb_typeof(source_claims) = 'object'),
  preferred_source_id text references public.radar_sources(id),
  published_at timestamptz,
  expires_at timestamptz,
  is_closed boolean not null default false,
  closure_evidence text,
  content_hash text not null,
  content_version integer not null default 1 check (content_version >= 1),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index radar_jobs_seen_idx on public.radar_jobs(last_seen_at desc);

create table public.radar_job_observations (
  id bigint generated always as identity primary key,
  job_id uuid not null references public.radar_jobs(id),
  run_id uuid not null references public.radar_collection_runs(id),
  provider_job_id text,
  raw jsonb not null check (jsonb_typeof(raw) = 'object'),
  observed_at timestamptz not null default now(),
  unique(run_id, job_id)
);
create index radar_observations_job_idx on public.radar_job_observations(job_id, observed_at desc);

create table public.radar_evaluation_queue (
  job_id uuid primary key references public.radar_jobs(id),
  expected_content_hash text not null,
  profile_version text not null default 'cv-oct-2026-v1',
  evaluator_version text not null default 'v1',
  state text not null default 'pending' check (state in ('pending','leased','completed','failed')),
  lease_token uuid,
  lease_until timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  updated_at timestamptz not null default now(),
  check ((state = 'leased' and lease_token is not null and lease_until is not null)
    or (state <> 'leased' and lease_token is null and lease_until is null))
);
create index radar_queue_pending_idx on public.radar_evaluation_queue(state, updated_at);

create table public.radar_evaluations (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.radar_jobs(id),
  content_hash text not null,
  profile_version text not null,
  evaluator_version text not null,
  lease_token uuid not null unique,
  score integer not null check (score between 0 and 100),
  priority text not null check (priority in ('high','medium','low')),
  eligibility text not null check (eligibility in ('eligible','ineligible','uncertain')),
  summary text not null check (length(trim(summary)) > 0),
  reasons jsonb not null check (jsonb_typeof(reasons) = 'array' and jsonb_array_length(reasons) > 0),
  gaps jsonb not null default '[]'::jsonb check (jsonb_typeof(gaps) = 'array'),
  evidence jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence) = 'array'),
  evaluated_at timestamptz not null default now(),
  unique(job_id, content_hash, profile_version, evaluator_version),
  check (eligibility = 'uncertain' or jsonb_array_length(evidence) > 0)
);
create index radar_evaluations_time_idx on public.radar_evaluations(evaluated_at desc);

create table public.radar_user_decisions (
  job_id uuid primary key references public.radar_jobs(id),
  status text not null check (status in ('saved','dismissed','preparing','applied','interview','offer','rejected','withdrawn')),
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create table public.radar_briefings (
  id uuid primary key default gen_random_uuid(),
  briefing_day date not null,
  timezone text not null default 'Europe/Istanbul',
  state text not null default 'draft' check (state in ('draft','ready','delivered','failed')),
  from_evaluated_at timestamptz not null,
  through_evaluated_at timestamptz not null,
  body jsonb not null default '{}'::jsonb check (jsonb_typeof(body) = 'object'),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique(briefing_day, timezone),
  check (through_evaluated_at >= from_evaluated_at),
  check (state <> 'delivered' or delivered_at is not null)
);

-- Fingerprint meaningful job content, not scrape timestamps or applicant counts.
-- MD5 is a change detector here, never a credential or security primitive.
create function public.radar_fingerprint_job() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.content_hash := md5(jsonb_build_array(new.title, new.company, new.location,
    new.work_type, new.source_url, new.apply_url, new.description,
    new.country_restrictions, new.published_at, new.expires_at, new.is_closed)::text);
  if tg_op = 'INSERT' then
    new.content_version := 1;
  elsif new.content_hash is distinct from old.content_hash then
    new.content_version := old.content_version + 1;
  else
    new.content_version := old.content_version;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger radar_jobs_fingerprint before insert or update on public.radar_jobs
for each row execute function public.radar_fingerprint_job();

create function public.radar_enqueue_changed_job() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' or new.content_hash is distinct from old.content_hash then
    insert into public.radar_evaluation_queue(job_id, expected_content_hash)
      values(new.id, new.content_hash)
    on conflict(job_id) do update set expected_content_hash = excluded.expected_content_hash,
      state = 'pending', lease_token = null, lease_until = null, attempts = 0,
      last_error = null, updated_at = now();
  end if;
  return new;
end;
$$;
create trigger radar_jobs_enqueue after insert or update on public.radar_jobs
for each row execute function public.radar_enqueue_changed_job();

-- Only a server-side gateway may call these RPCs. Gateway scopes are a next step.
create function public.radar_claim_jobs(p_limit integer default 20)
returns setof jsonb language plpgsql security definer set search_path = '' as $$
begin
  if p_limit is null or p_limit < 1 or p_limit > 50 then
    raise exception 'limit must be between 1 and 50' using errcode = '22023';
  end if;
  -- Stop poison jobs from being retried indefinitely after repeated expired leases.
  update public.radar_evaluation_queue set state = 'failed', lease_token = null,
    lease_until = null, last_error = 'evaluation attempts exhausted', updated_at = now()
    where attempts >= 5 and (state = 'pending' or (state = 'leased' and lease_until < now()));
  return query
  with candidates as (
    select q.job_id from public.radar_evaluation_queue q
    join public.radar_jobs j on j.id = q.job_id
    where (q.state = 'pending' or (q.state = 'leased' and q.lease_until < now()))
      and q.attempts < 5 and not j.is_closed
      and (j.expires_at is null or j.expires_at > now())
      and not exists(select 1 from public.radar_user_decisions d
        where d.job_id = j.id and d.status = 'dismissed')
    order by q.updated_at, q.job_id
    for update of q skip locked limit p_limit
  ), claimed as (
    update public.radar_evaluation_queue q set state = 'leased',
      lease_token = gen_random_uuid(), lease_until = now() + interval '20 minutes',
      attempts = attempts + 1, updated_at = now()
    from candidates c where q.job_id = c.job_id returning q.*
  )
  select jsonb_build_object('job', to_jsonb(j), 'lease_token', c.lease_token,
    'lease_until', c.lease_until, 'profile_version', c.profile_version,
    'evaluator_version', c.evaluator_version)
  from claimed c join public.radar_jobs j on j.id = c.job_id;
end;
$$;

create function public.radar_save_evaluation(
  p_job_id uuid, p_lease_token uuid, p_content_hash text,
  p_score integer, p_priority text, p_eligibility text, p_summary text,
  p_reasons jsonb, p_gaps jsonb default '[]'::jsonb, p_evidence jsonb default '[]'::jsonb
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_job public.radar_jobs%rowtype;
  v_queue public.radar_evaluation_queue%rowtype;
  v_id uuid;
begin
  -- Identical request retries after a lost response return the previous receipt.
  select id into v_id from public.radar_evaluations
    where job_id = p_job_id and lease_token = p_lease_token and content_hash = p_content_hash;
  if found then return v_id; end if;
  select * into v_job from public.radar_jobs where id = p_job_id for update;
  if not found then raise exception 'job not found' using errcode = 'P0002'; end if;
  select * into v_queue from public.radar_evaluation_queue where job_id = p_job_id for update;
  if not found or v_queue.state <> 'leased'
      or v_queue.lease_token is distinct from p_lease_token
      or v_queue.lease_until <= now() then
    raise exception 'missing or expired evaluation lease' using errcode = '22023';
  end if;
  if v_job.content_hash is distinct from p_content_hash
      or v_queue.expected_content_hash is distinct from p_content_hash then
    raise exception 'job content changed; evaluate the new version' using errcode = '22023';
  end if;
  insert into public.radar_evaluations(job_id, content_hash, profile_version, evaluator_version,
    lease_token, score, priority, eligibility, summary, reasons, gaps, evidence)
  values(p_job_id, p_content_hash, v_queue.profile_version, v_queue.evaluator_version,
    p_lease_token, p_score, p_priority, p_eligibility, p_summary, p_reasons, p_gaps, p_evidence)
  on conflict(job_id, content_hash, profile_version, evaluator_version) do update set
    lease_token = excluded.lease_token, score = excluded.score, priority = excluded.priority,
    eligibility = excluded.eligibility, summary = excluded.summary, reasons = excluded.reasons,
    gaps = excluded.gaps, evidence = excluded.evidence, evaluated_at = now()
  returning id into v_id;
  update public.radar_evaluation_queue set state = 'completed', lease_token = null,
    lease_until = null, last_error = null, updated_at = now() where job_id = p_job_id;
  return v_id;
end;
$$;

create function public.radar_get_shortlist(p_limit integer default 20)
returns setof jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('job', to_jsonb(j), 'evaluation', to_jsonb(e),
    'user_decision', to_jsonb(d))
  from public.radar_jobs j
  join public.radar_evaluation_queue q on q.job_id = j.id
  join public.radar_evaluations e on e.job_id = j.id and e.content_hash = j.content_hash
    and e.profile_version = q.profile_version and e.evaluator_version = q.evaluator_version
  left join public.radar_user_decisions d on d.job_id = j.id
  where not j.is_closed and (j.expires_at is null or j.expires_at > now())
    and (d.status is null or d.status <> 'dismissed')
  order by e.score desc, e.evaluated_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

-- Default-deny both tables and functions. No broad authenticated write policy.
do $$
declare t text;
begin
  foreach t in array array['radar_sources','radar_searches','radar_collection_runs',
    'radar_jobs','radar_job_observations','radar_evaluation_queue','radar_evaluations',
    'radar_user_decisions','radar_briefings'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on table public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on table public.%I to service_role', t);
  end loop;
end;
$$;
grant usage, select on sequence public.radar_job_observations_id_seq to service_role;
revoke all on function public.radar_fingerprint_job() from public, anon, authenticated;
revoke all on function public.radar_enqueue_changed_job() from public, anon, authenticated;
revoke all on function public.radar_claim_jobs(integer) from public, anon, authenticated;
revoke all on function public.radar_save_evaluation(uuid,uuid,text,integer,text,text,text,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.radar_get_shortlist(integer) from public, anon, authenticated;
grant execute on function public.radar_claim_jobs(integer) to service_role;
grant execute on function public.radar_save_evaluation(uuid,uuid,text,integer,text,text,text,jsonb,jsonb,jsonb) to service_role;
grant execute on function public.radar_get_shortlist(integer) to service_role;

comment on table public.radar_jobs is 'Canonical jobs. Missing from a search is not evidence of closure.';
comment on table public.radar_job_observations is 'Provider provenance and raw records. A duplicate webhook must reuse its run id.';
comment on table public.radar_evaluation_queue is 'Changed content automatically requeues a job; expired leases can be recovered.';
comment on table public.radar_user_decisions is 'Human decisions; collectors and evaluator must never overwrite this table.';
comment on table public.radar_briefings is 'Daily report receipt and evaluation watermark. Advance only after successful delivery.';

commit;
