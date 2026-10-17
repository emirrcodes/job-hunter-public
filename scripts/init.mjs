import {copyFileSync,existsSync,mkdirSync,chmodSync,constants} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {root,loadEnv,saveEnv} from './lib.mjs';
const target=new URL('.env.local',root);
if(!existsSync(target)) copyFileSync(new URL('.env.example',root),target,constants.COPYFILE_EXCL);
chmodSync(target,0o600);
mkdirSync(new URL('local/',root),{recursive:true});
loadEnv();
const values={};
for(const scope of ['COLLECTOR','EVALUATOR','READER']) {
 const key=`RADAR_${scope}_TOKEN`;
 if(!process.env[key]) values[key]=randomBytes(32).toString('hex');
}
saveEnv(values);
console.log('Local settings ready (0600). Three scope tokens generated if missing; existing values preserved.');
console.log('Fill in your own Supabase and Apify credentials privately, then follow docs/SETUP.md.');
