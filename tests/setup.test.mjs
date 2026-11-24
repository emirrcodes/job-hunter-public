import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,readFileSync,statSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {gatewayTarget,isProjectDatabase,projectTarget} from '../scripts/lib.mjs';
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
  mkdirSync(join(temp,'config'));
  copyFileSync(new URL('../config/profile.example.json',import.meta.url),join(temp,'config','profile.example.json'));
  for(const name of ['lib.mjs','init.mjs']) copyFileSync(new URL(`../scripts/${name}`,import.meta.url),join(temp,'scripts',name));
  copyFileSync(new URL('../.env.example',import.meta.url),join(temp,'.env.example'));
  const env={...process.env};for(const key of Object.keys(env)) if(/^(RADAR_|SUPABASE_|APIFY_)/.test(key)) delete env[key];
  const run=()=>spawnSync(process.execPath,[join(temp,'scripts/init.mjs')],{env,encoding:'utf8'});
  assert.equal(run().status,0);
  const privateProfile=join(temp,'local','profile.json');
  const initialProfile=readFileSync(privateProfile,'utf8');
  assert.match(initialProfile,/example-customer-support-v1/);
  const editedProfile=initialProfile.replace('example-customer-support-v1','my-search-v1');
  writeFileSync(privateProfile,editedProfile);
  const before=readFileSync(join(temp,'.env.local'),'utf8');
  const tokens=[...before.matchAll(/^RADAR_(?:COLLECTOR|EVALUATOR|READER)_TOKEN="([a-f0-9]{64})"$/gm)].map(x=>x[1]);
  assert.equal(new Set(tokens).size,3);
  const repeat=run();assert.equal(repeat.status,0);
  assert.equal(readFileSync(join(temp,'.env.local'),'utf8'),before);
  assert.equal(readFileSync(privateProfile,'utf8'),editedProfile);
  if(process.platform!=='win32') {
   assert.equal(statSync(join(temp,'.env.local')).mode&0o777,0o600);
   assert.equal(statSync(privateProfile).mode&0o777,0o600);
  }
  for(const token of tokens) assert.ok(!repeat.stdout.includes(token));
 } finally {rmSync(temp,{recursive:true,force:true});}
});

test('gateway URL and database target are constrained to the selected Supabase project',()=>{
 const ref='abcdefghijklmnopqrst';
 const origin=`https://${ref}.supabase.co`;
 assert.equal(gatewayTarget({SUPABASE_URL:origin}),origin);
 for(const url of [`${origin}/`,`${origin}.example.com`, `https://user@${ref}.supabase.co`]) {
  assert.throws(()=>gatewayTarget({SUPABASE_URL:url}));
 }
 assert.ok(isProjectDatabase(new URL(`postgresql://postgres@db.${ref}.supabase.co:5432/postgres`),ref));
 assert.ok(isProjectDatabase(new URL(`postgresql://postgres.${ref}@aws-0-test.pooler.supabase.com:5432/postgres`),ref));
 for(const url of [
  `postgresql://postgres@db.${ref}.supabase.co:6543/postgres`,
  'postgresql://postgres@db.another-project.supabase.co:5432/postgres',
  `postgresql://postgres.${ref}@aws-0-test.pooler.supabase.com.example.com:5432/postgres`,
  'postgresql://postgres.other@aws-0-test.pooler.supabase.com:5432/postgres',
 ]) assert.equal(isProjectDatabase(new URL(url),ref),false);
});
