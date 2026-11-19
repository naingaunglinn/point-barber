# infra/backup

The `backup` service of `docker-compose.yml` (design D13 · ADR-002). It has the PostgreSQL 16 client
tools and an idle command. It holds `INTERNAL_OPS_KEY`, which the backup job will use to report runs
to the internal API.

Schedule and bucket upload: `add-backup-restore`.
