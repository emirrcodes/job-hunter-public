begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'FAIL: %',label; end if; raise notice 'PASS: %',label; end; $$;
select pg_temp.assert(public.radar_reserve_collection('himalayas')->>'skip'='collection_disabled','collection kill switch');
update public.radar_settings set value='true' where key='collection_enabled';
update public.radar_sources set enabled=true where id in ('himalayas','apify_bebity');
create temp table reservations as select public.radar_reserve_collection('himalayas') r;
select pg_temp.assert((select r ? 'run' from reservations),'first reservation succeeds');
select pg_temp.assert(public.radar_reserve_collection('himalayas')->>'skip'='slot_already_reserved','same slot does not double start');
create temp table items as select '[{"job":{"identity_key":"url:https://example.com/test","title":"Engineer","company":"Example","source_url":"https://example.com/test","description":"original"},"raw":{"title":"Engineer"}}]'::jsonb j;
select public.radar_ingest_run((r->'run'->>'id')::uuid,j,1) from reservations,items;
select pg_temp.assert((select count(*)=1 from public.radar_jobs),'atomic ingest writes job');
select pg_temp.assert((select state='pending' from public.radar_evaluation_queue),'ingest queues evaluation');
select pg_temp.assert((select public.radar_ingest_run((r->'run'->>'id')::uuid,j,1)->>'replayed'='true' from reservations,items),'repeated ingest returns receipt');
select pg_temp.assert((select count(*)=1 from public.radar_job_observations),'repeated batch has one observation');
select pg_temp.assert(not has_function_privilege('radar_reader','public.radar_ingest_run(uuid,jsonb,integer,text,numeric,jsonb)','execute'),'reader cannot ingest');
select pg_temp.assert(not has_function_privilege('radar_evaluator','public.radar_reserve_collection(text,numeric)','execute'),'evaluator cannot start collectors');
select pg_temp.assert(not has_function_privilege('anon','public.radar_get_status()','execute'),'status private');
select pg_temp.assert(public.radar_reserve_collection('apify_bebity',0.05) ? 'run','bounded LinkedIn reservation');
delete from public.radar_collection_runs where source_id='apify_bebity';
insert into public.radar_collection_runs(source_id,idempotency_key,scheduled_for,state,reserved_cost_usd,created_at)
  values('apify_bebity','old-unknown',now()-interval '2 days','unknown',0.05,now()-interval '2 days');
select pg_temp.assert(public.radar_reserve_collection('apify_bebity',0.05)->>'skip'='unresolved_provider_run','ambiguous provider start blocks another paid POST');
delete from public.radar_collection_runs where source_id='apify_bebity';
insert into public.radar_collection_runs(source_id,idempotency_key,scheduled_for,state,reserved_cost_usd,created_at)
  values('apify_bebity','budget-test',now()-interval '2 days','succeeded',3.49,now()-interval '2 days');
select pg_temp.assert(public.radar_reserve_collection('apify_bebity',0.05)->>'skip'='rolling_trial_budget','rolling free credit guard');
select pg_temp.assert((public.radar_briefing_window()->>'from')::timestamptz='1970-01-01'::timestamptz,'initial delivery watermark');
create temp table briefing as select public.radar_save_briefing(now(),'{"summary":"test"}') id;
select pg_temp.assert((public.radar_briefing_window()->>'from')::timestamptz='1970-01-01'::timestamptz,'ready report does not advance watermark');
select pg_temp.assert((select public.radar_deliver_briefing(id) from briefing),'delivery receipt');
select pg_temp.assert((public.radar_briefing_window()->>'from')::timestamptz=now(),'successful delivery advances watermark');
rollback;
