import {readFileSync, writeFileSync, chmodSync, existsSync} from 'node:fs';
export const root = new URL('../', import.meta.url);
export function loadEnv() { const file=new URL('.env.local',root); if(existsSync(file)) process.loadEnvFile(file); }
export function saveEnv(values) {
  const path = new URL('.env.local',root);
  let body = readFileSync(path,'utf8');
  for (const [key,value] of Object.entries(values)) {
    if (!/^[A-Z_]+$/.test(key) || /[\r\n]/.test(value)) throw new Error('Invalid env entry');
    const line = `${key}=${JSON.stringify(value)}`;
    const re = new RegExp(`^${key}=.*$`,'m');
    body = re.test(body) ? body.replace(re,()=>line) : `${body.trimEnd()}\n${line}\n`;
    process.env[key] = value;
  }
  writeFileSync(path,body,{mode:0o600}); chmodSync(path,0o600);
}
export async function management(path,body) {
  const {ref}=projectTarget();
  if (!process.env.SUPABASE_ACCESS_TOKEN) throw new Error('Missing SUPABASE_ACCESS_TOKEN');
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`,{
    method:body === undefined?'GET':'POST',
    headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,'Content-Type':'application/json'},
    ...(body === undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(45000),
  });
  if (!response.ok) throw new Error(`Supabase management ${response.status} on ${path}`);
  const result=await response.text();
  return result?JSON.parse(result):null;
}
export const query = sql => management('/database/query',{query:sql});
export function sqlLiteral(value) { return "'"+value.replaceAll("'","''")+"'"; }

export function projectTarget(env=process.env) {
  const ref=env.SUPABASE_PROJECT_REF;
  if (!/^[a-z]{20}$/.test(ref||'')) throw new Error('Set your own 20-letter SUPABASE_PROJECT_REF in .env.local');
  const expected=`https://${ref}.supabase.co`;
  if (env.SUPABASE_URL !== expected) throw new Error('SUPABASE_URL must match SUPABASE_PROJECT_REF exactly');
  return {ref,url:expected};
}

export function gatewayTarget(env=process.env) {
  if (env.SUPABASE_PROJECT_REF) return projectTarget(env).url;
  if (!/^https:\/\/[a-z]{20}\.supabase\.co$/.test(env.SUPABASE_URL ?? '')) {
    throw new Error('Set SUPABASE_URL to your project’s https://<project-ref>.supabase.co origin');
  }
  return env.SUPABASE_URL;
}

export function isProjectDatabase(url, ref) {
  if ((url.port || '5432') !== '5432') return false;
  return url.hostname === `db.${ref}.supabase.co`
    || (url.hostname.endsWith('.pooler.supabase.com') && decodeURIComponent(url.username).endsWith(`.${ref}`));
}
