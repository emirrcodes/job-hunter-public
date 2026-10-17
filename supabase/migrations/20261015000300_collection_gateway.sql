begin;
alter table public.radar_collection_runs add column metrics jsonb not null default '{}';
create table public.radar_settings (
  key text primary key, value jsonb not null, updated_at timestamptz not null default now()
);
alter table public.radar_settings enable row level security;
revoke all on public.radar_settings from public, anon, authenticated;
grant select,insert,update,delete on public.radar_settings to service_role;
insert into public.radar_settings(key,value) values ('collection_enabled','false');

-- Caller supplies no job URL or actor input. All four collectors are fixed in code.
create function public.radar_reserve_collection(p_source text, p_reserve numeric default 0)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_run public.radar_collection_runs%rowtype; v_slot bigint; v_key text;
begin
  perform pg_advisory_xact_lock(hashtext('radar-collection-budget'));
  if not exists(select 1 from public.radar_settings where key='collection_enabled' and value='true') then
    return jsonb_build_object('skip','collection_disabled');
  end if;
  if p_source not in ('himalayas','remotive','wwr','apify_bebity')
    or not exists(select 1 from public.radar_sources where id=p_source and enabled) then
    return jsonb_build_object('skip','source_disabled');
  end if;
  if p_reserve < 0 or p_reserve > 0.05 or (p_source <> 'apify_bebity' and p_reserve <> 0)
    or (p_source='apify_bebity' and p_reserve <> 0.05) then
    raise exception 'invalid free-trial reservation';
  end if;
  v_slot := floor((extract(epoch from now())-14400)/43200)::bigint;
  v_key := p_source||':'||v_slot;
  if exists(select 1 from public.radar_collection_runs where idempotency_key=v_key) then
    return jsonb_build_object('skip','slot_already_reserved');
  end if;
  if exists(select 1 from public.radar_collection_runs where source_id=p_source and created_at > now()-interval '10 hours') then
    return jsonb_build_object('skip','source_cooldown');
  end if;
  if p_source='apify_bebity' then
    if exists(select 1 from public.radar_collection_runs where source_id=p_source and state in ('starting','running','ingesting','unknown')) then
      return jsonb_build_object('skip','unresolved_provider_run');
    end if;
    if (select coalesce(sum(greatest(reserved_cost_usd,coalesce(actual_cost_usd,0))),0)
      from public.radar_collection_runs where source_id=p_source and created_at > now()-interval '31 days') + p_reserve > 3.50 then
      return jsonb_build_object('skip','rolling_trial_budget');
    end if;
  end if;
  insert into public.radar_collection_runs(source_id,idempotency_key,scheduled_for,state,reserved_cost_usd,started_at)
    values(p_source,v_key,to_timestamp(v_slot*43200+14400),'starting',p_reserve,now()) returning * into v_run;
  return jsonb_build_object('run',to_jsonb(v_run),'slot',v_slot);
end; $$;

-- Entire bounded batch is atomic; retries of completed runs return the receipt.
create function public.radar_ingest_run(p_run_id uuid,p_items jsonb,p_returned integer,
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
      last_seen_at=now(),
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

create function public.radar_get_status() returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('jobs',(select count(*) from public.radar_jobs),
    'queue',(select coalesce(jsonb_object_agg(state,n),'{}') from (select state,count(*) n from public.radar_evaluation_queue group by state) q),
    'sources',(select jsonb_agg(jsonb_build_object('id',s.id,'stage',s.stage,'enabled',s.enabled,
      'last_run',(select to_jsonb(r)-'idempotency_key' from public.radar_collection_runs r where r.source_id=s.id order by created_at desc limit 1)))
      from public.radar_sources s),
    'last_delivered_briefing',(select to_jsonb(b) from public.radar_briefings b where state='delivered' order by through_evaluated_at desc limit 1));
$$;

create function public.radar_briefing_window() returns jsonb language sql stable security definer set search_path='' as $$
  with w as (select coalesce(max(through_evaluated_at),'1970-01-01'::timestamptz) a,now() b from public.radar_briefings where state='delivered')
  select jsonb_build_object('from',w.a,'through',w.b,'evaluations',coalesce((select jsonb_agg(jsonb_build_object('job',to_jsonb(j),'evaluation',to_jsonb(e),'user_decision',to_jsonb(d)) order by e.score desc)
    from public.radar_evaluations e join public.radar_jobs j on j.id=e.job_id and j.content_hash=e.content_hash
    join public.radar_evaluation_queue q on q.job_id=j.id and q.profile_version=e.profile_version and q.evaluator_version=e.evaluator_version
    left join public.radar_user_decisions d on d.job_id=j.id
    where e.evaluated_at>w.a and e.evaluated_at<=w.b and not j.is_closed
      and (j.expires_at is null or j.expires_at>now()) and coalesce(d.status,'')<>'dismissed'),'[]')) from w;
$$;
create function public.radar_save_briefing(p_through timestamptz,p_body jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_from timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('radar-briefing'));
  select coalesce(max(through_evaluated_at),'1970-01-01') into v_from from public.radar_briefings where state='delivered';
  if p_through<v_from or p_through>now() or jsonb_typeof(p_body)<>'object' then raise exception 'invalid briefing window'; end if;
  insert into public.radar_briefings(briefing_day,from_evaluated_at,through_evaluated_at,body,state)
    values((now() at time zone 'Europe/Istanbul')::date,v_from,p_through,p_body,'ready')
  on conflict(briefing_day,timezone) do update set from_evaluated_at=excluded.from_evaluated_at,
    through_evaluated_at=excluded.through_evaluated_at,body=excluded.body,state='ready',delivered_at=null
    where radar_briefings.state<>'delivered' returning id into v_id;
  if v_id is null then raise exception 'today briefing already delivered'; end if;
  return v_id;
end; $$;
create function public.radar_deliver_briefing(p_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  update public.radar_briefings set state='delivered',delivered_at=now() where id=p_id and state='ready';
  return found;
end; $$;

revoke all on function public.radar_reserve_collection(text,numeric),public.radar_ingest_run(uuid,jsonb,integer,text,numeric,jsonb),
  public.radar_get_status(),public.radar_briefing_window(),public.radar_save_briefing(timestamptz,jsonb),public.radar_deliver_briefing(uuid) from public,anon,authenticated;
grant execute on function public.radar_reserve_collection(text,numeric),public.radar_ingest_run(uuid,jsonb,integer,text,numeric,jsonb),
  public.radar_get_status(),public.radar_briefing_window(),public.radar_save_briefing(timestamptz,jsonb),public.radar_deliver_briefing(uuid) to service_role;
commit;
