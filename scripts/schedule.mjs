import {readFileSync} from 'node:fs';
import {loadEnv,query,root,sqlLiteral} from './lib.mjs';
loadEnv();
const command=process.argv[2];
if(command==='off') {
  await query(`begin; update public.radar_settings set value='false',updated_at=now() where key='collection_enabled';
    update cron.job set active=false where jobname in ('radar-collect-twice-daily','radar-poll-existing-runs'); commit;`);
  console.log('Collection disabled; both schedules paused');
} else if(command==='on') {
  for(const [name,value] of [['radar_project_url',process.env.SUPABASE_URL],['radar_collector_token',process.env.RADAR_COLLECTOR_TOKEN]]) {
    if(!value) throw new Error('Missing scheduler secret');
    await query(`do $$ declare v_id uuid; begin
      select id into v_id from vault.secrets where name=${sqlLiteral(name)};
      if v_id is null then perform vault.create_secret(${sqlLiteral(value)},${sqlLiteral(name)});
      else perform vault.update_secret(v_id,${sqlLiteral(value)}); end if;
      end; $$;`);
  }
  await query(readFileSync(new URL('supabase/setup/schedule.sql',root),'utf8'));
  await query(`update public.radar_settings set value='true',updated_at=now() where key='collection_enabled';`);
  console.log('Collection: 07:00 and 19:00 Europe/Istanbul. Poll existing runs: every 5 minutes.');
} else if(command!=='status') throw new Error('Use schedule.mjs on|off|status');
console.log(await query(`select jobname,schedule,active from cron.job where jobname like 'radar-%' order by jobname`));
