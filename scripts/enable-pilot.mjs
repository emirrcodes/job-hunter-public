import {loadEnv,query} from './lib.mjs';
loadEnv();
await query(`begin;
do $$ declare profile jsonb:=public.radar_get_profile(); begin
  if profile->'search'->'enabled' is distinct from 'true'::jsonb or not exists (
    select 1 from public.radar_sources where profile->'search'->'sources'->id->'enabled'='true'::jsonb and stage<>'broken'
  ) then raise exception 'Publish a search profile with at least one enabled source before the pilot'; end if;
end; $$;
update public.radar_sources set enabled=coalesce(
  public.radar_get_profile()->'search'->'sources'->id->'enabled'='true'::jsonb,false
) where id in ('himalayas','remotive','wwr','apify_bebity') and stage<>'broken';
update public.radar_settings set value='true',updated_at=now() where key='collection_enabled';
commit;`);
console.log('Selected sources enabled for manual collection. No schedule was installed.');
