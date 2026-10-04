-- Grants for the API's login role point_app (design D4.3 · D-AUD-02). Hand-written.
-- point_app is created before the migrations by db/bootstrap/00-roles.sh (design D4.4).
-- The migrations run as the owner role, so ALTER DEFAULT PRIVILEGES covers every table and
-- sequence a later migration creates.

GRANT USAGE ON SCHEMA public TO point_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO point_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO point_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO point_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO point_app;

-- audit_events is append-only for the API: INSERT + SELECT only (the statement the Part 8
-- constraint file prescribes).
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events FROM point_app;

-- The API has no reason to read or change the migration history.
REVOKE ALL ON _prisma_migrations FROM point_app;
