import {execFileSync} from 'node:child_process';
execFileSync(process.execPath,[new URL('./profile.mjs',import.meta.url).pathname,'plan',...process.argv.slice(2)],{stdio:'inherit'});
