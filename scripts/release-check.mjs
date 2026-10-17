import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {root} from './lib.mjs';
const paths=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const secret=/(?:apify_api_[a-zA-Z0-9]{20,}|sb_secret_[a-zA-Z0-9_-]{20,}|gh[opusr]_[a-zA-Z0-9]{20,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|eyJ[a-zA-Z0-9_-]{25,}\.[a-zA-Z0-9_-]{15,}\.[a-zA-Z0-9_-]{15,})/;
let failed=false;
for(const path of [...new Set(paths)]) {
 if(/(^|\/)(?:local|node_modules)\//.test(path)||/(^|\/)\.env(?!\.example$)(?:$|\.)/.test(path)||/\.(?:zip|pdf|docx|log)$/.test(path)) {
  console.error(`Private/generated file in release: ${path}`);failed=true;continue;
 }
 if(secret.test(readFileSync(new URL(path,root),'utf8'))) {console.error(`Credential pattern in: ${path}`);failed=true;}
}
if(failed) process.exit(1);
console.log(`Release check passed (${new Set(paths).size} files). Review customized profiles separately before publishing.`);
