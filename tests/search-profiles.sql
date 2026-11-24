begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end; $$;
insert into public.radar_jobs(id,identity_key,title,company,source_url) values
('00000000-0000-0000-0000-000000000041','profile-test','Software Engineer','Example','https://example.com/41');
insert into public.radar_user_decisions(job_id,status) values('00000000-0000-0000-0000-000000000041','saved');
select pg_temp.assert((select profile_version='profile-not-configured' from public.radar_evaluation_queue),'new jobs wait on the installation profile default');
insert into public.radar_searches(source_id,name,lane) values('himalayas','synthetic-search','germany-hybrid');
select pg_temp.assert((select lane='germany-hybrid' from public.radar_searches),'search lane accepts a user-defined name');
select public.radar_publish_profile(jsonb_build_object('version','test','revision',repeat('a',64),'evaluation_version','profile-a','search','{}'::jsonb));
select pg_temp.assert(public.radar_get_profile()->>'evaluation_version'='profile-a','live profile is readable');
select pg_temp.assert((select profile_version='profile-a' from public.radar_evaluation_queue),'publish updates evaluation profile');
create temp table old_claim as select public.radar_claim_jobs(1) record;
select public.radar_publish_profile(jsonb_build_object('version','test','revision',repeat('b',64),'evaluation_version','profile-b','search','{}'::jsonb));
select pg_temp.assert((select state='pending' and lease_token is null and profile_version='profile-b' from public.radar_evaluation_queue),'profile change invalidates old lease');
select pg_temp.assert(public.radar_get_profile(repeat('a',64))->>'evaluation_version'='profile-a','inflight collectors retain immutable profile snapshot');
do $$ declare r jsonb; rejected boolean:=false; begin
 select record into r from old_claim;
 begin perform public.radar_save_evaluation((r->'job'->>'id')::uuid,(r->>'lease_token')::uuid,r->'job'->>'content_hash',80,'high','uncertain','old profile','["test"]');
 exception when sqlstate '22023' then rejected:=true; end;
 perform pg_temp.assert(rejected,'old-profile save rejected'); end; $$;
select pg_temp.assert((select status='saved' from public.radar_user_decisions),'human decisions survive profile change');
select pg_temp.assert(not has_function_privilege('radar_reader','public.radar_publish_profile(jsonb)','execute'),'reader cannot change search profile');
select pg_temp.assert(not has_function_privilege('radar_evaluator','public.radar_publish_profile(jsonb)','execute'),'evaluator cannot change search profile');
select pg_temp.assert(not has_function_privilege('anon','public.radar_get_profile(text)','execute'),'profile private');
select public.radar_reclassify_jobs(repeat('b',64),'[{"job_id":"00000000-0000-0000-0000-000000000041","state":"excluded","reason":"senior_role"}]');
select pg_temp.assert((select state='skipped' from public.radar_evaluation_queue),'profile-excluded jobs are skipped, not evaluator failures');
select pg_temp.assert(not exists(select 1 from public.radar_claim_jobs(1)),'excluded job cannot be claimed');
select public.radar_reclassify_jobs(repeat('b',64),'[{"job_id":"00000000-0000-0000-0000-000000000041","state":"candidate","reason":"primary_or_adjacent"}]');
select pg_temp.assert((select state='pending' and profile_version='profile-b' from public.radar_evaluation_queue),'relaxed profile requeues retained job');
insert into public.radar_collection_runs(id,source_id,idempotency_key,scheduled_for) values
('00000000-0000-0000-0000-000000000042','apify_bebity','bad-country-test',now());
insert into public.radar_job_observations(job_id,run_id,raw) values
('00000000-0000-0000-0000-000000000041','00000000-0000-0000-0000-000000000042','{}');
select pg_temp.assert(public.radar_quarantine_run('00000000-0000-0000-0000-000000000042','wrong geography')=1,'bad country run quarantined without deletion');
select pg_temp.assert((select state='skipped' from public.radar_evaluation_queue),'quarantined job removed from evaluation queue');
select public.radar_publish_profile(jsonb_build_object('version','test','revision',repeat('c',64),'evaluation_version','profile-c','search','{}'::jsonb));
select public.radar_reclassify_jobs(repeat('c',64),'[{"job_id":"00000000-0000-0000-0000-000000000041","state":"candidate","reason":"primary_or_adjacent"}]');
select pg_temp.assert((select discovery_state='quarantined' from public.radar_jobs),'profile edit cannot revive quarantined provider data');
select pg_temp.assert(not exists(select 1 from public.radar_claim_jobs(1)),'quarantine survives profile publication');
select pg_temp.assert((select count(*)=1 from public.radar_jobs),'quarantine retains raw/canonical evidence');
select public.radar_save_briefing(now(),'{}'::jsonb);
select pg_temp.assert((select timezone='UTC' from public.radar_briefings),'briefings default to UTC');
select public.radar_publish_profile(jsonb_build_object('version','test','revision',repeat('d',64),'evaluation_version','profile-d',
  'search','{}'::jsonb,'preferences',jsonb_build_object('timezone','Europe/Berlin')));
select public.radar_save_briefing(now(),'{}'::jsonb);
select pg_temp.assert(exists(select 1 from public.radar_briefings where timezone='Europe/Berlin'
  and briefing_day=(now() at time zone 'Europe/Berlin')::date),'briefings use the configured timezone');
rollback;
