import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,statSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {projectTarget} from '../scripts/lib.mjs';
test('management target comes from matching project settings; mismatches fail closed',()=>{
 const ref='abcdefghijklmnopqrst';
 assert.deepEqual(projectTarget({SUPABASE_PROJECT_REF:ref,SUPABASE_URL:`https://${ref}.supabase.co`}),{ref,url:`https://${ref}.supabase.co`});
 for(const url of ['https://other.supabase.co',`http://${ref}.supabase.co`,`https://${ref}.supabase.co.attacker.example`,`https://${ref}.supabase.co/path`])
  assert.throws(()=>projectTarget({SUPABASE_PROJECT_REF:ref,SUPABASE_URL:url}));
 assert.throws(()=>projectTarget({}));
});
test('first-run initializer generates separate tokens and preserves credentials on repeat',()=>{
 const temp=mkdtempSync(join(tmpdir(),'radar-init-'));
 try {
  mkdirSync(join(temp,'scripts'));
  for(const name of ['lib.mjs','init.mjs']) copyFileSync(new URL(`../scripts/${name}`,import.meta.url),join(temp,'scripts',name));
  copyFileSync(new URL('../.env.example',import.meta.url),join(temp,'.env.example'));
  const env={...process.env};for(const key of Object.keys(env)) if(/^(RADAR_|SUPABASE_|APIFY_)/.test(key)) delete env[key];
  const run=()=>spawnSync(process.execPath,[join(temp,'scripts/init.mjs')],{env,encoding:'utf8'});
  assert.equal(run().status,0);
  const before=readFileSync(join(temp,'.env.local'),'utf8');
  const tokens=[...before.matchAll(/^RADAR_(?:COLLECTOR|EVALUATOR|READER)_TOKEN="([a-f0-9]{64})"$/gm)].map(x=>x[1]);
  assert.equal(new Set(tokens).size,3);
  const repeat=run();assert.equal(repeat.status,0);
  assert.equal(readFileSync(join(temp,'.env.local'),'utf8'),before);
  if(process.platform!=='win32') assert.equal(statSync(join(temp,'.env.local')).mode&0o777,0o600);
  for(const token of tokens) assert.ok(!repeat.stdout.includes(token));
 } finally {rmSync(temp,{recursive:true,force:true});}
});
