# syntax=docker/dockerfile:1
# Backup container (design D13 · ADR-002): PostgreSQL 16 client tools (pg_dump, pg_restore, psql)
# and an idle command. The schedule and the bucket upload are add-backup-restore's.
# The server binaries in this image are never started.
FROM postgres:16.15-bookworm
ARG APP_VERSION=0.0.0-dev
ENV APP_VERSION=${APP_VERSION}
USER postgres
WORKDIR /tmp
# Idle until stopped; the trap lets `docker compose stop` end it at once instead of after 10 s.
CMD ["sh", "-c", "trap 'exit 0' TERM INT; sleep infinity & wait"]
