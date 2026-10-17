-- TEMPLATE ONLY. The project owner runs this in the NEW project's SQL Editor.
-- Passwords must be supplied privately; never commit a completed copy.
-- Uncomment only after setting strong unique passwords in a private session.

-- create role radar_migrator login noinherit nosuperuser nocreatedb nocreaterole
--   noreplication nobypassrls password 'SET_PRIVATELY';
-- grant connect on database postgres to radar_migrator;
-- grant usage, create on schema public to radar_migrator;

-- create role radar_evaluator login noinherit nosuperuser nocreatedb nocreaterole
--   noreplication nobypassrls password 'SET_PRIVATELY';
-- create role radar_reader login noinherit nosuperuser nocreatedb nocreaterole
--   noreplication nobypassrls password 'SET_PRIVATELY';
-- grant connect on database postgres to radar_evaluator, radar_reader;

-- After migrations: use npm run db:grant-roles with the migration connection.
-- Do not grant runtime roles postgres/service_role membership or direct table writes.
