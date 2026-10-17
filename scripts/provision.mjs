import {loadEnv,query,sqlLiteral} from './lib.mjs';
loadEnv();
// HTTP gateway uses scope tokens. Optional direct-DB access is not provisioned here.
for(const role of ['radar_evaluator','radar_reader']) {
 const rows=await query(`select rolname from pg_roles where rolname=${sqlLiteral(role)}`);
 if(!rows.length) {
  await query(`create role ${role} nologin noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;`);
  console.log(`${role}: created (NOLOGIN)`);
 } else console.log(`${role}: exists; unchanged`);
}
console.log('Runtime roles ready. Apply migrations and db:grant-roles next.');
