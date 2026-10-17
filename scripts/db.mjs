import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
if (existsSync(`${root}.env.local`)) process.loadEnvFile(`${root}.env.local`);
const command = process.argv[2] || 'whoami';
const roleFor = {whoami:'reader',migrate:'migration','grant-roles':'migration',pending:'evaluator',shortlist:'reader'};
if (!roleFor[command]) { console.error('Commands: whoami, migrate [--dry-run], grant-roles, pending, shortlist'); process.exit(1); }
const roleFlag = process.argv.indexOf('--role');
const role = roleFlag === -1 ? roleFor[command] : process.argv[roleFlag + 1];
if (!['migration','evaluator','reader'].includes(role)) { console.error('Invalid --role'); process.exit(1); }
if (['migrate','grant-roles'].includes(command) && role !== 'migration') { console.error('Migration connection required'); process.exit(1); }

const files = readdirSync(`${root}supabase/migrations`).filter(f=>/^\d+_[a-z0-9_]+\.sql$/.test(f)).sort();
if (command === 'migrate' && process.argv.includes('--dry-run')) {
  console.log('PLAN ONLY. Target is RADAR_MIGRATION_DATABASE_URL; no connection or changes.');
  for (const file of files) console.log(file);
  process.exit(0);
}

const variable = `RADAR_${role.toUpperCase()}_DATABASE_URL`;
const passwordVariable = `RADAR_${role.toUpperCase()}_DATABASE_PASSWORD`;
if (!process.env[variable]) { console.error(`Missing ${variable}. Save it in ignored .env.local; never paste the password into chat.`); process.exit(1); }
let url;
try { url = new URL(process.env[variable]); } catch { console.error('Invalid PostgreSQL connection URL'); process.exit(1); }
if (!['postgres:', 'postgresql:'].includes(url.protocol)) { console.error('PostgreSQL connection URL required'); process.exit(1); }
const sslmode = url.searchParams.get('sslmode') || 'require';
if (!['require','verify-ca','verify-full'].includes(sslmode)) { console.error('TLS is required for the cloud database'); process.exit(1); }
if ([...url.searchParams.keys()].some(k=>!['sslmode','sslrootcert','application_name'].includes(k))) {
  console.error('Unsupported connection parameter; use sslmode and optional sslrootcert only'); process.exit(1);
}
const env = {...process.env,
  PGHOST:url.hostname, PGPORT:url.port || '5432', PGUSER:decodeURIComponent(url.username),
  PGPASSWORD:process.env[passwordVariable] || decodeURIComponent(url.password), PGDATABASE:decodeURIComponent(url.pathname.slice(1)) || 'postgres',
  PGSSLMODE:sslmode, PGCONNECT_TIMEOUT:'15', PGAPPNAME:'job-hunter',
};
if (url.searchParams.has('sslrootcert')) env.PGSSLROOTCERT = url.searchParams.get('sslrootcert');
let sql;
if (command === 'whoami') sql = 'select current_user, current_database(), version();';
if (command === 'pending') sql = 'select jsonb_pretty(x) from public.radar_claim_jobs(20) x;';
if (command === 'shortlist') sql = 'select jsonb_pretty(x) from public.radar_get_shortlist(20) x;';
if (command === 'grant-roles') {
  const evaluator = process.env.RADAR_EVALUATOR_ROLE || 'radar_evaluator';
  const reader = process.env.RADAR_READER_ROLE || 'radar_reader';
  if (![evaluator,reader].every(x=>/^[a-z_][a-z0-9_]{0,62}$/.test(x)) || evaluator === reader) {
    console.error('Use two distinct simple PostgreSQL role names'); process.exit(1);
  }
  sql = `\\set evaluator_role ${evaluator}\n\\set reader_role ${reader}\n` + readFileSync(`${root}supabase/setup/grant-runtime-roles.sql`, 'utf8');
}
if (command === 'migrate') {
  const pieces = [
    'begin;',
    "select pg_advisory_xact_lock(hashtext('job-hunter-schema-migrations'));",
    'create table if not exists public.radar_schema_migrations(version text primary key, sha256 text not null, applied_at timestamptz not null default now());',
    'alter table public.radar_schema_migrations enable row level security;',
    'revoke all on table public.radar_schema_migrations from public, anon, authenticated;',
  ];
  for (const file of files) {
    const original = readFileSync(`${root}supabase/migrations/${file}`, 'utf8');
    const sha = createHash('sha256').update(original).digest('hex');
    const body = original.replace(/^begin;\s*$/gmi,'').replace(/^commit;\s*$/gmi,'');
    pieces.push(`do $check$ begin if exists(select 1 from public.radar_schema_migrations where version='${file}' and sha256 <> '${sha}') then raise exception 'Applied migration changed: ${file}'; end if; end; $check$;`);
    pieces.push(`select not exists(select 1 from public.radar_schema_migrations where version='${file}') as apply_migration \\gset`);
    pieces.push('\\if :apply_migration', body,
      `insert into public.radar_schema_migrations(version,sha256) values('${file}','${sha}');`, '\\endif');
  }
  pieces.push('commit;');
  sql = pieces.join('\n');
}
const result = spawnSync('psql',['-X','-v','ON_ERROR_STOP=1','-P','pager=off'], {env,input:sql,encoding:'utf8',maxBuffer:8*1024*1024});
if (result.error) { console.error('Could not execute psql; check installation and connection settings.'); process.exit(1); }
// Never print the original connection URL or password, even in diagnostic output.
function clean(text) {
  let value = text || '';
  for (const secret of [process.env[variable], env.PGPASSWORD]) if (secret) value = value.split(secret).join('[REDACTED]');
  return value;
}
process.stdout.write(clean(result.stdout));
process.stderr.write(clean(result.stderr));
process.exit(result.status ?? 1);
