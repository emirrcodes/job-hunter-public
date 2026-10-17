-- Run only against a fresh disposable database after the migrations.
begin;
create function pg_temp.assert(ok boolean, label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %', label; end if;
  raise notice 'PASS: %', label;
end;
$$;

select pg_temp.assert((select count(*) = 10 from public.radar_sources), '10 sources seeded, none scheduled');
select pg_temp.assert(not exists(select 1 from public.radar_sources where enabled), 'collection disabled initially');
select pg_temp.assert((select bool_and(relrowsecurity) from pg_class where relname = any(array[
  'radar_sources','radar_searches','radar_collection_runs','radar_jobs','radar_job_observations',
  'radar_evaluation_queue','radar_evaluations','radar_user_decisions','radar_briefings'])), 'RLS enabled on all tables');
select pg_temp.assert(not has_table_privilege('anon','public.radar_jobs','select'), 'anonymous job reads denied');
select pg_temp.assert(not has_table_privilege('authenticated','public.radar_user_decisions','update'), 'generic signed-in user cannot change decisions');
select pg_temp.assert(not has_function_privilege('anon','public.radar_claim_jobs(integer)','execute'), 'anonymous evaluator RPC denied');
select pg_temp.assert(not has_function_privilege('authenticated','public.radar_get_shortlist(integer)','execute'), 'shortlist private by default');
select pg_temp.assert(has_function_privilege('service_role','public.radar_claim_jobs(integer)','execute'), 'server role can claim');

insert into public.radar_jobs(id,identity_key,title,company,source_url,description) values
('00000000-0000-0000-0000-000000000001','linkedin:123','Backend Engineer','Acme','https://linkedin.com/jobs/view/123','Original job description');
select pg_temp.assert((select content_hash is not null and content_version = 1 from public.radar_jobs), 'job fingerprint computed by trigger');
select pg_temp.assert((select state = 'pending' from public.radar_evaluation_queue), 'new job automatically queued');
create temporary table test_claims as select public.radar_claim_jobs(10) as record;
select pg_temp.assert((select count(*) = 1 from test_claims), 'one job claimed');
select pg_temp.assert((select count(*) = 0 from public.radar_claim_jobs(10)), 'unexpired lease prevents duplicate evaluation');

create temporary table test_receipts as
select public.radar_save_evaluation(
  (record->'job'->>'id')::uuid,(record->>'lease_token')::uuid,
  record->'job'->>'content_hash',80,'high','uncertain','Relevant backend role; geography unclear',
  '["Backend experience"]','[]','[]') as id from test_claims;
select pg_temp.assert((select state = 'completed' from public.radar_evaluation_queue), 'successful evaluation completes queue');
select pg_temp.assert((select count(*) = 1 from public.radar_get_shortlist(20)), 'fresh evaluation appears in shortlist');
select pg_temp.assert((select public.radar_save_evaluation(
  (record->'job'->>'id')::uuid,(record->>'lease_token')::uuid,
  record->'job'->>'content_hash',80,'high','uncertain','Relevant backend role; geography unclear',
  '["Backend experience"]','[]','[]') = (select id from test_receipts) from test_claims), 'save retry is idempotent');
update public.radar_jobs set last_seen_at = now() + interval '1 minute';
select pg_temp.assert((select content_version = 1 from public.radar_jobs), 'scrape timestamps do not change content version');
select pg_temp.assert((select state = 'completed' from public.radar_evaluation_queue), 'unchanged content does not requeue');
insert into public.radar_user_decisions(job_id,status,notes)
values('00000000-0000-0000-0000-000000000001','saved','My own decision');
update public.radar_jobs set description = 'Changed requirements';
select pg_temp.assert((select content_version = 2 from public.radar_jobs), 'real changes increment version');
select pg_temp.assert((select state = 'pending' from public.radar_evaluation_queue), 'changed job requeued');
select pg_temp.assert((select count(*) = 0 from public.radar_get_shortlist(20)), 'stale evaluation excluded from shortlist');
select pg_temp.assert((select status = 'saved' and notes = 'My own decision' from public.radar_user_decisions), 'human decision survives job updates');

truncate test_claims;
insert into test_claims select public.radar_claim_jobs(10);
update public.radar_jobs set description = 'Requirements changed while agent was working';
do $$
declare rejected boolean := false; r jsonb;
begin
  select record into r from test_claims;
  begin
    perform public.radar_save_evaluation((r->'job'->>'id')::uuid,(r->>'lease_token')::uuid,
      r->'job'->>'content_hash',80,'high','uncertain','Stale result','["backend"]','[]','[]');
  exception when sqlstate '22023' then rejected := true; end;
  perform pg_temp.assert(rejected,'stale in-flight evaluation rejected');
end;
$$;
truncate test_claims;
insert into test_claims select public.radar_claim_jobs(10);
update public.radar_evaluation_queue set lease_until = now() - interval '1 minute';
select pg_temp.assert((select count(*) = 1 from public.radar_claim_jobs(10)), 'expired lease recovered after worker failure');
update public.radar_evaluation_queue set lease_until = now() - interval '1 minute', attempts = 5;
select pg_temp.assert((select count(*) = 0 from public.radar_claim_jobs(10)), 'poison job does not retry forever');
select pg_temp.assert((select state = 'failed' from public.radar_evaluation_queue), 'exhausted task visibly failed');

update public.radar_jobs set description = 'Another update';
update public.radar_user_decisions set status = 'dismissed';
select pg_temp.assert((select count(*) = 0 from public.radar_claim_jobs(10)), 'dismissed jobs stay dismissed');
update public.radar_user_decisions set status = 'saved';
update public.radar_jobs set is_closed = true;
select pg_temp.assert((select count(*) = 0 from public.radar_claim_jobs(10)), 'explicitly closed jobs are not evaluated');

insert into public.radar_collection_runs(id,source_id,idempotency_key,scheduled_for) values
('00000000-0000-0000-0000-000000000010','apify_bebity','run-1',now());
insert into public.radar_job_observations(job_id,run_id,raw) values
('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','{}');
do $$
declare rejected boolean := false;
begin
  begin
    insert into public.radar_job_observations(job_id,run_id,raw) values
      ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000010','{}');
  exception when unique_violation then rejected := true; end;
  perform pg_temp.assert(rejected,'duplicate provider callback cannot duplicate observations');
end;
$$;
do $$
declare rejected boolean := false;
begin
  begin perform public.radar_claim_jobs(5000);
  exception when sqlstate '22023' then rejected := true; end;
  perform pg_temp.assert(rejected,'unbounded evaluation batch denied');
end;
$$;
rollback;
