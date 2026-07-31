# Deployment and operations

## Purpose

Provide the minimum production operating procedure for the current single-node deployment.

## Deployment notes

GitHub Actions builds the frontend, copies frontend/backend archives to the server, installs backend production dependencies, then reloads PM2. The PM2 ecosystem configuration and reverse-proxy configuration are not stored in this repository.

Before deployment:

- Set and validate backend environment values, especially a 32+ character `JWT_SECRET`, admin credentials, tenant ID, database path, CORS origin, email, and AI keys.
- Run frontend type checks, lint, and production build. TODO: resolve the existing frontend lint errors before treating lint as a release gate.
- Back up the SQLite database before applying a release, then run `npm run migrate --workspace=robot-chat-backend`. Startup also applies outstanding migrations, but the explicit command makes failures visible before traffic is switched.
- Confirm `/health` returns `200` and `/ready` returns database status `ok` after deployment.

## Logging and monitoring

The backend writes single-line JSON logs containing timestamp, level, event, and safe operational context. Never log tokens, cookies, message bodies, email addresses, or raw request bodies.

Monitor at minimum:

- HTTP request count, status class, and duration by route.
- Health/readiness success rate and database readiness failures.
- Socket connection/authentication failures, connected sessions, reconnect rate, event failures, and message acknowledgement failures.
- AI provider latency, failures, fallback rate, and cost. TODO: expose these as metrics.
- Audit-event write failures and security-sensitive action volume.

## Backup and recovery

The current database is SQLite at `DB_PATH`; it requires filesystem-level backups while the service is stopped or through SQLite's safe backup mechanism.

1. Put the service into maintenance or stop the backend process.
2. Copy the SQLite database and verify the copied file can be opened.
3. Encrypt and store backups outside the deployment host with a documented retention policy. TODO: define retention and ownership.
4. To recover, stop the backend, retain the failed database for investigation, restore a verified backup to `DB_PATH`, run migrations only after taking a fresh copy, start the backend, then check `/ready` and a known authorised flow.

Test restoration regularly. Do not rely on deployment archives as database backups.

## Incident response

Record the request ID, relevant structured log events, tenant/resource identifiers, timestamps, and the smallest necessary audit-event range. Rotate credentials and invalidate affected sessions where compromise is suspected. TODO: define escalation contacts, recovery time objectives, and a formal incident runbook.
