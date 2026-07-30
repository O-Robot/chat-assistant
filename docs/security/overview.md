# Security overview

## Purpose

State the current security posture and the minimum direction for secure development.

## Current posture

The project uses prepared SQL statements, sanitises HTML on the backend and frontend, and protects admin HTTP routes with JWT verification. These are useful controls, but they do not make the application production-safe.

The current code has critical authorisation gaps:

- Visitor HTTP routes expose records by raw ID without authenticated ownership checks.
- Socket.IO accepts client-supplied identities, roles, senders, and conversation IDs without handshake authentication/authorisation.
- The admin JWT is returned to browser JavaScript and stored in `localStorage`.
- The embed uses wildcard `postMessage` targets without origin/source validation.
- No workspace/tenant isolation model exists.

## Security direction

Treat user, conversation, and tenant IDs as identifiers, never as credentials. Authenticate every HTTP and socket actor; authorise every resource and event against server-derived identity and tenant context. Fail closed when secrets/configuration are missing. Apply layered controls: schema validation, limits, secure headers, monitoring, least privilege, audit logs, backups, and tested incident response.

## Reporting and secrets

Do not put secrets, tokens, customer data, or transcript content in Git, documentation, issue trackers, or client logs. TODO: define the private vulnerability-reporting contact, secret manager, rotation process, data-retention policy, and incident-response runbook.

See [authentication](../architecture/authentication.md) and [security checklist](checklist.md).

