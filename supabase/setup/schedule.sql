-- Applied only by scripts/schedule.mjs after the pilot. Uses existing Vault entries.
begin;
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $$ begin
  if (select count(*) from public.radar_sources s where id in ('himalayas','remotive','wwr','apify_bebity')
    and exists(select 1 from public.radar_collection_runs r where r.source_id=s.id and r.state in ('succeeded','partial') and r.accepted_count>0))<>4 then
    raise exception 'All four sources must complete a nonempty pilot first';
  end if;
end; $$;
create or replace function public.radar_invoke_collection(p_action text)
returns bigint language plpgsql security definer set search_path='' as $$
declare v_request bigint;
begin
  if p_action not in ('collect','poll') then raise exception 'invalid scheduler action'; end if;
  if not exists(select 1 from public.radar_settings where key='collection_enabled' and value='true') then return null; end if;
  -- Polling only retrieves an existing run; it never starts a new scrape.
  if p_action='poll' and not exists(select 1 from public.radar_collection_runs
    where source_id='apify_bebity' and state in ('running','ingesting')) then return null; end if;
  select net.http_post(
    url:=(select decrypted_secret from vault.decrypted_secrets where name='radar_project_url')||'/functions/v1/job-radar',
    headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||
      (select decrypted_secret from vault.decrypted_secrets where name='radar_collector_token')),
    body:=jsonb_build_object('action',p_action),timeout_milliseconds:=100000) into v_request;
  return v_request;
end; $$;
revoke all on function public.radar_invoke_collection(text) from public,anon,authenticated,service_role;
select cron.schedule('radar-collect-twice-daily','0 4,16 * * *',$q$select public.radar_invoke_collection('collect');$q$);
select cron.schedule('radar-poll-existing-runs','*/5 * * * *',$q$select public.radar_invoke_collection('poll');$q$);
update public.radar_sources set stage='active' where id in ('himalayas','remotive','wwr','apify_bebity');
commit;
