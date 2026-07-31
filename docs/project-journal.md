# Project Journal

## Purpose

This document is a chronological development log for completed project phases.

| Phase | Date | Status | Commit |
| --- | --- | --- | --- |
| P001 | 2026-07-30 | ✅ Completed | `feat(security): harden tenant-scoped sessions and Socket.IO authorisation` |
| P002 | 2026-07-30 | ✅ Completed | `feat(realtime): harden message delivery and conversation state` |
| P003 | 2026-07-30 | ✅ Completed | `feat(ops): add observability and audit foundations` |
| P004 | 2026-07-31 | ✅ Completed | `feat(data): add scalable storage foundations` |
| P005 | 2026-07-31 | ✅ Completed | `feat(visitor): polish widget experience and conversation history` |

<details>
<summary><strong>P001 — Security Hardening Foundation</strong></summary>

### Objective

Eliminate release-blocking authentication, authorisation, tenant-isolation, and Socket.IO impersonation risks.

### Work Completed

- Moved privileged/admin authentication to HttpOnly cookies and fail-closed JWT configuration.
- Added visitor session authentication, tenant-scoped API queries, and authenticated Socket.IO handshakes.
- Derived socket identities from verified sessions and restricted room/event access.

### Remaining Risks

- Multi-instance Socket.IO state, rate limiting, CSRF defence-in-depth, CSP, and attachment controls remain future work.

### Suggested Conventional Commit

```text
feat(security): harden tenant-scoped sessions and Socket.IO authorisation
```

</details>

<details>
<summary><strong>P002 — Realtime Reliability &amp; Conversation Integrity</strong></summary>

### Objective

Make authenticated realtime chat reliable under reconnects, duplicate delivery, and multiple browser sessions.

### Work Completed

- Added bounded cursor pagination, persisted read markers, acknowledgement-based sends, and idempotent message IDs.
- Added reconnect sync, typing expiry, and multi-socket presence handling.

### Remaining Risks

- Presence, typing, transfer state, and AI locks remain process-local; the legacy admin history endpoint is unbounded.

### Suggested Conventional Commit

```text
feat(realtime): harden message delivery and conversation state
```

</details>

<details>
<summary><strong>P003 — Production Readiness &amp; Observability</strong></summary>

### Objective

Establish operational foundations for structured logging, error handling, health checks, auditing, and recovery guidance.

### Work Completed

- Added structured logs, request IDs, health/readiness endpoints, audit events, frontend error boundaries, and deployment/recovery documentation.

### Remaining Risks

- External log aggregation, metrics/alerts, and automated backup/recovery validation remain deployment work.

### Suggested Conventional Commit

```text
feat(ops): add observability and audit foundations
```

</details>

<details>
<summary><strong>P004 — Data Layer Scaling &amp; Storage Architecture</strong></summary>

### Objective

Prepare the data layer for production growth without changing the product experience or weakening existing tenant and realtime guarantees.

### Work Completed

- Added a transactional migration baseline with recorded migration IDs and an explicit backend migration command.
- Added conversation activity storage/backfill, data indexes, and an integrity constraint allowing one open conversation per tenant/user.
- Made visitor registration and new-conversation replacement atomic with immediate SQLite transactions.
- Made paginated message reads explicitly tenant-scoped in the data access service and Socket.IO recovery path.
- Updated message writes to maintain `lastMessageAt` for activity-query planning.
- Added attachment metadata/lifecycle storage and cleanup indexes without adding an upload feature or storing file bytes in SQLite.
- Added a tenant-filtered SQLite FTS5 message-search foundation and documented the conditions for exposing it safely.
- Documented SQLite operating limits and a rehearsable PostgreSQL migration path.

### Files Changed

- `backend/db.js`, `backend/migrations.js`, `backend/migrate.js`, and `backend/package.json`
- `backend/services/conversationService.js` and `backend/services/messageSearchService.js`
- `backend/routes/users.js`, `backend/routes/conversations.js`, and `backend/routes/admin.js`
- `backend/controllers/socketController.js` and `backend/utils/systemMessages.js`
- `docs/architecture/database.md`, `docs/operations/deployment.md`, and this journal

### Security and Data Decisions Made

- Tenant IDs are required inside paginated message retrieval, preventing a future caller from retrieving another tenant's messages using only a conversation ID.
- Search remains an internal tenant-filtered primitive until a separately authorised product flow exists.
- Attachments are metadata only; future object storage must use opaque tenant-prefixed keys, validation, scanning, signed access, and lifecycle deletion.
- SQLite remains single-node storage. PostgreSQL is the defined path before horizontal scaling or sustained concurrent writes.

### Verification Steps

- Checked syntax for all changed backend modules with `node --check`.
- Used a clean temporary SQLite database to apply the migration and verify same-email users across new tenants, the one-open-conversation constraint, cursor pagination, cross-tenant message denial, FTS search, attachment schema, and migration ledger.
- Ran frontend production build successfully.
- Ran frontend lint; it remains blocked by four pre-existing unescaped-apostrophe errors in visitor chat JSX, plus existing warnings. P004 did not modify frontend code.

### Remaining Risks

- Existing SQLite databases retain their historical global email unique constraint; same-email support across tenants needs a planned table rebuild or PostgreSQL cutover.
- The admin selected-user conversation endpoint remains unbounded for backwards compatibility and needs a paginated inbox API before large histories are common.
- Attachments and search are storage foundations only; no object-store integration, scan pipeline, retention worker, or user-facing search endpoint exists.
- SQLite writer serialisation and process-local Socket.IO state remain unsuitable for multi-node production.

### Next Phase

P006 — Not started.

### Suggested Conventional Commit

```text
feat(data): add scalable storage foundations
```

</details>

<details>
<summary><strong>P005 — Visitor Experience &amp; Widget UX</strong></summary>

### Objective

Improve the visitor journey from widget launch through conversation completion, with a focused premium-quality pass over hierarchy, responsiveness, feedback, accessibility, and message-history usability.

### Work Completed

- Reworked the embedded widget shell to use its full iframe viewport, with clearer onboarding hierarchy, calmer visual weight, stronger status feedback, and responsive host sizing.
- Improved first-run and empty states, loading copy, connection feedback, composer focus treatment, message bubbles, status labels, and keyboard-focus visibility.
- Added accessible labels to visitor controls, the message region, the iframe, and attachment preparation affordances.
- Added reduced-motion support and improved touch/focus interaction treatment.
- Exposed existing cursor pagination through “Load earlier messages” controls in both visitor chat surfaces, preserving scroll position while earlier history is inserted.
- Added graceful retained-history messaging when a refresh fails, without changing visitor authentication or backend behaviour.
- Added visual-only attachment affordances marked as unavailable until a secure attachment capability is delivered.
- Corrected stale connection-status presentation when the shared socket connected before the visitor store attached its listeners.
- Hardened visitor message rendering against incomplete persisted or realtime message objects so a malformed event cannot trip the route error boundary.
- Configured the existing DiceBear avatar source for Next image rendering, preventing a valid visitor avatar from triggering the route error boundary after message sends.
- Made the authenticated Socket.IO join event tolerate its legacy client payload and only invoke acknowledgement callbacks when they are functions, preventing an invalid join acknowledgement from crashing the backend.

### Verification Steps

- Ran TypeScript validation and the frontend production build successfully.
- Ran frontend lint successfully and checked the working-tree diff for whitespace errors.
- TODO: complete manual embedded-host checks at mobile, tablet, and desktop widths before release.

### Remaining Risks

- Cross-site iframe cookie behaviour and embed `postMessage` origin validation remain security/platform work and are outside this visual phase.
- Attachments are visual preparation only; no upload, storage, scanning, or lifecycle handling is available.
- The two visitor surfaces still duplicate some interaction code and should be consolidated only in a future, scoped maintainability phase.

### Next Phase

P006 — Not started.

### Suggested Conventional Commit

```text
feat(visitor): polish widget experience and conversation history
```

</details>
