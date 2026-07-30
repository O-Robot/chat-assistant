# Security checklist

## Purpose

Use this concise checklist during feature work and before a production release.

## Identity and authorisation

- [ ] HTTP endpoints authenticate the actor where required.
- [ ] Every resource query verifies server-derived ownership, role, and workspace scope.
- [ ] Socket.IO handshake is authenticated; event payloads cannot choose actor, role, tenant, or room.
- [ ] Admin sessions are HttpOnly/Secure and tokens are not stored in `localStorage`.
- [ ] JWT/config defaults fail closed; expiry, revocation, and logout are defined.
- [ ] Login, registration, transcript, message, and socket events are rate limited.

## Input and data

- [ ] HTTP bodies, params, query values, and socket payloads have strict schemas and length limits.
- [ ] SQL uses parameters; migrations include constraints and indexes.
- [ ] HTML/URLs are sanitised with a tested allowlist before persistence/rendering.
- [ ] Attachments, if added, have authorisation, size/type limits, malware scanning, and private storage.
- [ ] Sensitive data has retention, deletion, export, backup, and restore policies.

## Frontend and widget

- [ ] `postMessage` uses expected target origin and validates `event.origin`, `event.source`, schema, and instance nonce.
- [ ] CORS is allowlisted and never relied on as authorisation.
- [ ] CSP, frame-ancestor policy, HSTS, secure cookies, and other security headers are configured for deployment.
- [ ] Browser storage contains only approved, non-sensitive data.
- [ ] UI errors do not disclose internal details or tokens.

## Operations

- [ ] Secrets are in a managed store and can be rotated.
- [ ] Dependencies are locked, scanned, and updated deliberately.
- [ ] CI runs lint, tests, build, and security regression checks before deployment.
- [ ] Logs/audit events support investigation without exposing secrets or unnecessary PII.
- [ ] Alerts, backup restore tests, rollback, and incident-response procedures are documented.

## TODO

Convert this checklist into release gates once CI, observability, tenancy, and the production hosting model are defined.

