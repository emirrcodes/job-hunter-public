begin;
alter table public.radar_searches drop constraint radar_searches_lane_check;
alter table public.radar_searches add constraint radar_searches_lane_check check (length(trim(lane))>0);
alter table public.radar_evaluation_queue alter column profile_version set default 'profile-not-configured';
alter table public.radar_briefings alter column timezone set default 'UTC';

create or replace function public.radar_enqueue_changed_job() returns trigger
language plpgsql set search_path='' as $$
declare v_profile text;
begin
  select value->>'evaluation_version' into v_profile from public.radar_settings where key='search_profile';
  if tg_op='INSERT' or new.content_hash is distinct from old.content_hash
    or new.discovery_state is distinct from old.discovery_state then
    insert into public.radar_evaluation_queue(job_id,expected_content_hash,profile_version,state,last_error)
      values(new.id,new.content_hash,coalesce(v_profile,'profile-not-configured'),
        case when new.discovery_state='candidate' then 'pending' else 'skipped' end,
        case when new.discovery_state='candidate' then null else new.discovery_reason end)
    on conflict(job_id) do update set expected_content_hash=excluded.expected_content_hash,
      profile_version=excluded.profile_version,state=excluded.state,last_error=excluded.last_error,
      lease_token=null,lease_until=null,attempts=0,updated_at=now();
  end if;
  return new;
end; $$;

create or replace function public.radar_save_briefing(p_through timestamptz,p_body jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_from timestamptz; v_timezone text;
begin
  perform pg_advisory_xact_lock(hashtext('radar-briefing'));
  select coalesce(max(through_evaluated_at),'1970-01-01') into v_from from public.radar_briefings where state='delivered';
  if p_through<v_from or p_through>now() or jsonb_typeof(p_body)<>'object' then raise exception 'invalid briefing window'; end if;
  select name into v_timezone from pg_catalog.pg_timezone_names
    where name=(select value->'preferences'->>'timezone' from public.radar_settings where key='search_profile');
  v_timezone:=coalesce(v_timezone,'UTC');
  insert into public.radar_briefings(briefing_day,timezone,from_evaluated_at,through_evaluated_at,body,state)
    values((now() at time zone v_timezone)::date,v_timezone,v_from,p_through,p_body,'ready')
  on conflict(briefing_day,timezone) do update set from_evaluated_at=excluded.from_evaluated_at,
    through_evaluated_at=excluded.through_evaluated_at,body=excluded.body,state='ready',delivered_at=null
    where radar_briefings.state<>'delivered' returning id into v_id;
  if v_id is null then raise exception 'today briefing already delivered'; end if;
  return v_id;
end; $$;
commit;
