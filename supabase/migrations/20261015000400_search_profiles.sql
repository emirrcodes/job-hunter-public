begin;
create table public.radar_profile_versions (
  revision text primary key check (revision ~ '^[a-f0-9]{64}$'),
  document jsonb not null check (jsonb_typeof(document)='object'),
  created_at timestamptz not null default now()
);
alter table public.radar_profile_versions enable row level security;
revoke all on public.radar_profile_versions from public,anon,authenticated;
grant select,insert on public.radar_profile_versions to service_role;
alter table public.radar_jobs add column discovery_state text not null default 'candidate'
  check (discovery_state in ('candidate','excluded','quarantined'));
alter table public.radar_jobs add column discovery_reason text;
alter table public.radar_evaluation_queue drop constraint radar_evaluation_queue_state_check;
alter table public.radar_evaluation_queue add constraint radar_evaluation_queue_state_check
  check (state in ('pending','leased','completed','failed','skipped'));

create function public.radar_get_profile(p_revision text default null) returns jsonb
language sql stable security definer set search_path='' as $$
  select case when p_revision is null then
    (select value from public.radar_settings where key='search_profile')
  else (select document from public.radar_profile_versions where revision=p_revision) end;
$$;
create function public.radar_publish_profile(p_profile jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare v_revision text:=p_profile->>'revision'; v_evaluation text:=p_profile->>'evaluation_version'; v_count integer;
begin
  perform pg_advisory_xact_lock(hashtext('radar-publish-profile'));
  if v_revision is null or v_revision !~ '^[a-f0-9]{64}$' or nullif(v_evaluation,'') is null
    or jsonb_typeof(p_profile->'search') is distinct from 'object' then raise exception 'invalid profile document'; end if;
  if exists(select 1 from public.radar_profile_versions where revision=v_revision and document<>p_profile) then raise exception 'profile revision is immutable'; end if;
  insert into public.radar_profile_versions(revision,document) values(v_revision,p_profile) on conflict do nothing;
  insert into public.radar_settings(key,value) values('search_profile',p_profile)
    on conflict(key) do update set value=excluded.value,updated_at=now();
  update public.radar_evaluation_queue q set profile_version=v_evaluation,expected_content_hash=j.content_hash,
    state='pending',lease_token=null,lease_until=null,attempts=0,last_error=null,updated_at=now()
    from public.radar_jobs j where j.id=q.job_id and j.discovery_state='candidate' and q.profile_version<>v_evaluation;
  get diagnostics v_count=row_count;
  return jsonb_build_object('revision',v_revision,'requeued',v_count);
end; $$;
create or replace function public.radar_enqueue_changed_job() returns trigger
language plpgsql set search_path='' as $$
declare v_profile text;
begin
  select value->>'evaluation_version' into v_profile from public.radar_settings where key='search_profile';
  if tg_op='INSERT' or new.content_hash is distinct from old.content_hash
    or new.discovery_state is distinct from old.discovery_state then
    insert into public.radar_evaluation_queue(job_id,expected_content_hash,profile_version,state,last_error)
      values(new.id,new.content_hash,coalesce(v_profile,'cv-oct-2026-v1'),
        case when new.discovery_state='candidate' then 'pending' else 'skipped' end,
        case when new.discovery_state='candidate' then null else new.discovery_reason end)
    on conflict(job_id) do update set expected_content_hash=excluded.expected_content_hash,
      profile_version=excluded.profile_version,state=excluded.state,last_error=excluded.last_error,
      lease_token=null,lease_until=null,attempts=0,updated_at=now();
  end if;
  return new;
end; $$;
create function public.radar_reclassify_jobs(p_revision text,p_decisions jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare x jsonb; v_count integer:=0;
begin
  if (select value->>'revision' from public.radar_settings where key='search_profile') is distinct from p_revision
    then raise exception 'profile changed'; end if;
  if jsonb_typeof(p_decisions) is distinct from 'array' or jsonb_array_length(p_decisions)>500 then raise exception 'bounded classifications required'; end if;
  for x in select value from jsonb_array_elements(p_decisions) loop
    if coalesce(x->>'state','') not in ('candidate','excluded') or nullif(x->>'reason','') is null then raise exception 'invalid classification'; end if;
    update public.radar_jobs set discovery_state=x->>'state',discovery_reason=x->>'reason',
      source_claims=source_claims||jsonb_build_object('radar_profile',jsonb_build_object('revision',p_revision,'match',x->>'reason'))
      where id=(x->>'job_id')::uuid and discovery_state<>'quarantined';
    if found then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end; $$;
create function public.radar_quarantine_run(p_run_id uuid,p_reason text) returns integer
language plpgsql security definer set search_path='' as $$
declare v_count integer;
begin
  if nullif(trim(p_reason),'') is null then raise exception 'reason required'; end if;
  update public.radar_collection_runs set metrics=metrics||jsonb_build_object('quality','quarantined','quality_reason',p_reason) where id=p_run_id;
  if not found then raise exception 'run not found'; end if;
  update public.radar_jobs j set discovery_state='quarantined',discovery_reason=p_reason
    where exists(select 1 from public.radar_job_observations o where o.job_id=j.id and o.run_id=p_run_id)
    and not exists(select 1 from public.radar_job_observations o join public.radar_collection_runs r on r.id=o.run_id
      where o.job_id=j.id and o.run_id<>p_run_id and (r.metrics->>'location_validated'='true' or r.metrics->>'location_checked'='true'));
  get diagnostics v_count=row_count;
  return v_count;
end; $$;

revoke all on function public.radar_get_profile(text),public.radar_publish_profile(jsonb),
  public.radar_reclassify_jobs(text,jsonb),public.radar_quarantine_run(uuid,text) from public,anon,authenticated;
grant execute on function public.radar_get_profile(text),public.radar_publish_profile(jsonb),
  public.radar_reclassify_jobs(text,jsonb),public.radar_quarantine_run(uuid,text) to service_role;

-- Existing read/claim/ingest RPCs are replaced below, preserving their signatures.
create or replace function public.radar_claim_jobs(p_limit integer default 20)
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
      and q.attempts < 5 and j.discovery_state='candidate' and not j.is_closed
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

create or replace function public.radar_get_shortlist(p_limit integer default 20)
returns setof jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('job', to_jsonb(j), 'evaluation', to_jsonb(e),
    'user_decision', to_jsonb(d))
  from public.radar_jobs j
  join public.radar_evaluation_queue q on q.job_id = j.id
  join public.radar_evaluations e on e.job_id = j.id and e.content_hash = j.content_hash
    and e.profile_version = q.profile_version and e.evaluator_version = q.evaluator_version
  left join public.radar_user_decisions d on d.job_id = j.id
  where j.discovery_state='candidate' and not j.is_closed and (j.expires_at is null or j.expires_at > now())
    and (d.status is null or d.status <> 'dismissed')
  order by e.score desc, e.evaluated_at desc
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

create or replace function public.radar_briefing_window() returns jsonb language sql stable security definer set search_path='' as $$
  with w as (select coalesce(max(through_evaluated_at),'1970-01-01'::timestamptz) a,now() b from public.radar_briefings where state='delivered')
  select jsonb_build_object('from',w.a,'through',w.b,'evaluations',coalesce((select jsonb_agg(jsonb_build_object('job',to_jsonb(j),'evaluation',to_jsonb(e),'user_decision',to_jsonb(d)) order by e.score desc)
    from public.radar_evaluations e join public.radar_jobs j on j.id=e.job_id and j.content_hash=e.content_hash
    join public.radar_evaluation_queue q on q.job_id=j.id and q.profile_version=e.profile_version and q.evaluator_version=e.evaluator_version
    left join public.radar_user_decisions d on d.job_id=j.id
    where e.evaluated_at>w.a and e.evaluated_at<=w.b and j.discovery_state='candidate' and not j.is_closed
      and (j.expires_at is null or j.expires_at>now()) and coalesce(d.status,'')<>'dismissed'),'[]')) from w;
$$;

create or replace function public.radar_ingest_run(p_run_id uuid,p_items jsonb,p_returned integer,
  p_state text default 'succeeded',p_cost numeric default null,p_metrics jsonb default '{}')
returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.radar_collection_runs%rowtype; x jsonb; j jsonb; v_id uuid; v_count integer;
begin
  select * into r from public.radar_collection_runs where id=p_run_id for update;
  if not found then raise exception 'run not found'; end if;
  if r.state in ('succeeded','partial') then return jsonb_build_object('id',r.id,'accepted',r.accepted_count,'replayed',true); end if;
  if r.state not in ('starting','running','ingesting') then raise exception 'run cannot ingest in current state'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>400 or p_returned<jsonb_array_length(p_items)
    or p_state not in ('succeeded','partial') or jsonb_typeof(p_metrics)<>'object' then raise exception 'invalid batch'; end if;
  for x in select value from jsonb_array_elements(p_items) loop
    j := x->'job';
    if jsonb_typeof(x->'raw')<>'object' or length(j->>'description')>150000
      or length(j->>'identity_key')>2000 then raise exception 'invalid item'; end if;
    insert into public.radar_jobs(identity_key,title,company,location,work_type,source_url,apply_url,
      description,country_restrictions,source_claims,preferred_source_id,published_at,expires_at,is_closed,closure_evidence)
    values(j->>'identity_key',j->>'title',j->>'company',coalesce(j->>'location',''),coalesce(j->>'work_type','unknown'),
      j->>'source_url',j->>'apply_url',coalesce(j->>'description',''),nullif(j->'country_restrictions','null'),
      coalesce(j->'source_claims','{}'),r.source_id,(j->>'published_at')::timestamptz,(j->>'expires_at')::timestamptz,
      coalesce((j->>'is_closed')::boolean,false),j->>'closure_evidence')
    on conflict(identity_key) do update set
      last_seen_at=now(),discovery_state='candidate',discovery_reason=null,
      title=case when radar_jobs.preferred_source_id=excluded.preferred_source_id then excluded.title else radar_jobs.title end,
      company=case when radar_jobs.preferred_source_id=excluded.preferred_source_id then excluded.company else radar_jobs.company end,
      location=case when radar_jobs.preferred_source_id=excluded.preferred_source_id then excluded.location else radar_jobs.location end,
      work_type=case when radar_jobs.preferred_source_id=excluded.preferred_source_id then excluded.work_type else radar_jobs.work_type end,
      description=case when radar_jobs.preferred_source_id=excluded.preferred_source_id or length(radar_jobs.description)<300
        then case when excluded.description<>'' then excluded.description else radar_jobs.description end else radar_jobs.description end,
      country_restrictions=case when radar_jobs.preferred_source_id=excluded.preferred_source_id then excluded.country_restrictions else radar_jobs.country_restrictions end,
      published_at=case when radar_jobs.preferred_source_id=excluded.preferred_source_id then excluded.published_at else radar_jobs.published_at end,
      expires_at=case when radar_jobs.preferred_source_id=excluded.preferred_source_id then excluded.expires_at else radar_jobs.expires_at end,
      source_claims=radar_jobs.source_claims||excluded.source_claims,
      is_closed=case when radar_jobs.preferred_source_id=excluded.preferred_source_id then excluded.is_closed else radar_jobs.is_closed end,
      closure_evidence=case when radar_jobs.preferred_source_id=excluded.preferred_source_id then excluded.closure_evidence else radar_jobs.closure_evidence end
    returning id into v_id;
    insert into public.radar_job_observations(job_id,run_id,provider_job_id,raw)
      values(v_id,r.id,x->>'provider_job_id',x->'raw') on conflict(run_id,job_id) do nothing;
  end loop;
  select count(*) into v_count from public.radar_job_observations where run_id=r.id;
  update public.radar_collection_runs set state=p_state,returned_count=p_returned,accepted_count=v_count,
    actual_cost_usd=p_cost,metrics=p_metrics,completed_at=now() where id=r.id;
  return jsonb_build_object('id',r.id,'accepted',v_count,'returned',p_returned);
end; $$;

create or replace function public.radar_get_status() returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('jobs',(select count(*) from public.radar_jobs),
    'candidate_jobs',(select count(*) from public.radar_jobs where discovery_state='candidate'),
    'quarantined_jobs',(select count(*) from public.radar_jobs where discovery_state='quarantined'),
    'excluded_jobs',(select count(*) from public.radar_jobs where discovery_state='excluded'),
    'profile',(select jsonb_build_object('revision',value->>'revision','evaluation_version',value->>'evaluation_version') from public.radar_settings where key='search_profile'),
    'queue',(select coalesce(jsonb_object_agg(state,n),'{}') from (select state,count(*) n from public.radar_evaluation_queue group by state) q),
    'sources',(select jsonb_agg(jsonb_build_object('id',s.id,'stage',s.stage,'enabled',s.enabled,
      'last_run',(select to_jsonb(r)-'idempotency_key' from public.radar_collection_runs r where r.source_id=s.id order by created_at desc limit 1)))
      from public.radar_sources s),
    'last_delivered_briefing',(select to_jsonb(b) from public.radar_briefings b where state='delivered' order by through_evaluated_at desc limit 1));
$$;
commit;
