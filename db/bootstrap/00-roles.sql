-- The API's login role (design D4.4 · D-AUD-02 · ADR-002 · D-PLT-15). Safe to run twice.
-- Run only through 00-roles.sh, which passes the password as the psql variable app_password.
-- Do NOT place this file in the postgres image's /docker-entrypoint-initdb.d/: the image would
-- run it without the variable. Mount only 00-roles.sh there and point ROLES_SQL at this file.
-- Runs as POSTGRES_USER, a superuser in the postgres image (needed for the SETs below).
\set ON_ERROR_STOP on

-- The ALTER ROLE below carries the password: keep it out of the server log (CG-OBS-03).
SET log_statement = 'none';
SET log_min_error_statement = 'panic';
SET log_min_duration_statement = -1;

SELECT 'CREATE ROLE point_app'
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'point_app') \gexec

SELECT format(
  'ALTER ROLE point_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD %L',
  :'app_password'
) \gexec

ALTER ROLE point_app SET timezone = 'Asia/Yangon';
