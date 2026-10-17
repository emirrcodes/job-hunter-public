import {loadEnv,query} from './lib.mjs';
loadEnv();
await query(`begin;
update public.radar_settings set value='true',updated_at=now() where key='collection_enabled';
update public.radar_sources set enabled=true,stage='tested' where id in ('himalayas','remotive','wwr','apify_bebity');
commit;`);
console.log('Four pilot sources enabled; no schedule installed. Next collect may consume Apify credit.');
