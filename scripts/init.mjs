import {copyFileSync,existsSync,mkdirSync,chmodSync,constants} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {root,loadEnv,saveEnv} from './lib.mjs';
const target=new URL('.env.local',root);
if(!existsSync(target)) copyFileSync(new URL('.env.example',root),target,constants.COPYFILE_EXCL);
chmodSync(target,0o600);
mkdirSync(new URL('local/',root),{recursive:true,mode:0o700});
const profile=new URL('local/profile.json',root);
if(!existsSync(profile)) copyFileSync(new URL('config/profile.example.json',root),profile,constants.COPYFILE_EXCL);
chmodSync(profile,0o600);
loadEnv();
const values={};
for(const scope of ['COLLECTOR','EVALUATOR','READER']) {
 const key=`RADAR_${scope}_TOKEN`;
 if(!process.env[key]) values[key]=randomBytes(32).toString('hex');
}
saveEnv(values);
console.log('Local settings ready (0600). Three scope tokens generated if missing; existing values preserved.');
console.log('Customize local/profile.json and enter your own credentials privately in .env.local. Follow docs/SETUP.md.');
