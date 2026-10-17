-- Run with a schema-owner/migration connection through npm run db:grant-roles.
-- User provisions these LOGIN roles and their passwords separately.
-- No passwords are created, read or emitted here.
begin;
select set_config('radar.evaluator_role', :'evaluator_role', true);
select set_config('radar.reader_role', :'reader_role', true);
do $$
declare
  role_name text;
  role_info pg_roles%rowtype;
begin
  foreach role_name in array array[current_setting('radar.evaluator_role'), current_setting('radar.reader_role')] loop
    select * into role_info from pg_roles where rolname = role_name;
    if not found then raise exception 'Role % must be provisioned first', role_name; end if;
    if role_info.rolsuper or role_info.rolbypassrls or role_info.rolcreaterole or role_info.rolcreatedb
      or pg_has_role(role_name, 'service_role', 'member')
      or role_name in ('postgres','anon','authenticated','service_role',current_user) then
      raise exception 'Role % is too privileged for radar runtime', role_name;
    end if;
    if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relname like 'radar_%' and pg_has_role(role_name,c.relowner,'member')) then
      raise exception 'Runtime role % must not own radar tables or inherit their owner', role_name;
    end if;
    if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind in ('r','p') and c.relname like 'radar_%'
      and has_table_privilege(role_name,c.oid,'SELECT,INSERT,UPDATE,DELETE')) then
      raise exception 'Runtime role % already has broad radar table privileges; provision a dedicated role', role_name;
    end if;
  end loop;
end;
$$;
grant usage on schema public to :"evaluator_role", :"reader_role";
grant execute on function public.radar_claim_jobs(integer) to :"evaluator_role";
grant execute on function public.radar_save_evaluation(uuid,uuid,text,integer,text,text,text,jsonb,jsonb,jsonb) to :"evaluator_role";
grant execute on function public.radar_get_shortlist(integer) to :"evaluator_role", :"reader_role";
grant execute on function public.radar_get_status() to :"evaluator_role", :"reader_role";
grant execute on function public.radar_get_profile(text) to :"evaluator_role", :"reader_role";
grant execute on function public.radar_briefing_window(),public.radar_save_briefing(timestamptz,jsonb),public.radar_deliver_briefing(uuid) to :"evaluator_role";
-- No table grants; these roles operate exclusively through owner-checked RPCs.
commit;
