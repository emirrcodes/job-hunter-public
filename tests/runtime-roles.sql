begin;
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$
begin
  if ok is distinct from true then raise exception 'FAIL: %',label; end if;
  raise notice 'PASS: %',label;
end;
$$;
select pg_temp.assert(not has_table_privilege('radar_evaluator','public.radar_jobs','select'), 'evaluator has no direct table read');
select pg_temp.assert(not has_table_privilege('radar_evaluator','public.radar_user_decisions','update'), 'evaluator cannot overwrite decisions');
select pg_temp.assert(not has_function_privilege('radar_reader','public.radar_claim_jobs(integer)','execute'), 'reader cannot claim work');
select pg_temp.assert(not has_function_privilege('radar_reader','public.radar_save_evaluation(uuid,uuid,text,integer,text,text,text,jsonb,jsonb,jsonb)','execute'), 'reader cannot save evaluations');
insert into public.radar_jobs(identity_key,title,company,source_url,description)
values('linkedin:role-test','Role Test','Acme','https://linkedin.com/jobs/view/123456','Role fixture');
set local role radar_evaluator;
create temporary table role_claims as select public.radar_claim_jobs(1) as data;
select pg_temp.assert((select count(*)=1 from role_claims), 'restricted evaluator can claim via RPC');
select public.radar_save_evaluation((data->'job'->>'id')::uuid,(data->>'lease_token')::uuid,
  data->'job'->>'content_hash',75,'medium','uncertain','Location unclear','["Backend"]','[]','[]')
from role_claims;
reset role;
set local role radar_reader;
select pg_temp.assert((select count(*)=1 from public.radar_get_shortlist(5)), 'restricted reader can read shortlist via RPC');
reset role;
rollback;
