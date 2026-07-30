# Project Journal

## Purpose

This document is a chronological development log for the project. Append each completed phase to this file.

| Phase | Date       | Status         | Commit                                                                      |
| ----- | ---------- | -------------- | --------------------------------------------------------------------------- |
| 003   | 2026-08-02 | 🚧 In Progress | Pending                                                                     |
| P001  | 2026-07-30 | ✅ Completed   | `feat(security): harden tenant-scoped sessions and Socket.IO authorisation` |
| P002  | 2026-07-30 | ✅ Completed   | `feat(realtime): harden message delivery and conversation state`            |
| P003  | 2026-07-30 | ✅ Completed   | `feat(ops): add observability and audit foundations`                         |

<details>
<summary><strong>Phase 001 — Authentication Hardening</strong></summary>

### Objective

Secure authentication for production.

### Work Completed

- Removed browser-accessible admin JWTs.
- Added HttpOnly cookie support.
- Improved logout flow.
- Added token validation.

### Files Changed

- `backend/auth/*`
- `frontend/lib/auth.ts`

### Decisions Made

Use HttpOnly cookies for privileged sessions.

### Issues Encountered

Refresh token migration required.

### Next Steps

- Secure WebSocket authentication.
- Add tenant validation.

### Suggested Commit

```text
feat(auth): implement secure JWT authentication flow
```

</details>

<details>
<summary><strong>P002 — Realtime Reliability &amp; Conversation Integrity</strong></summary>

### Objective

Make authenticated realtime chat reliable under duplicate delivery, reconnects, multiple browser sessions, stale typing state, and bounded message-history reads.

### Work Completed

- Added tenant-safe, bounded cursor pagination for visitor message history with deterministic `timestamp, id` ordering.
- Added `conversation_reads` persistence and authenticated `mark_read` socket events.
- Added `sync_conversation` with acknowledgement-based reconnect recovery.
- Made client socket listeners idempotent and removed a duplicate global message listener.
- Added acknowledgement-based optimistic sends with pending, delivered, and failed state; pending/failed messages retry after reconnect.
- Made duplicate message IDs idempotent at the server.
- Added five-second typing expiry and multi-socket presence tracking.
- Added message/read indexes and admin send failure recovery.

### Files Changed

- `backend/db.js`
- `backend/services/conversationService.js`
- `backend/routes/conversations.js`
- `backend/controllers/socketController.js`
- `frontend/types/chat.ts`
- `frontend/lib/socket.ts`
- `frontend/store/chatStore.ts`
- `frontend/components/widget/ChatWindow.tsx`
- `frontend/components/chat/FullChatWindow.tsx`
- `frontend/app/admin/page.tsx`
- `docs/architecture/websocket.md`
- `docs/architecture/database.md`

### Verification Steps

- Ran `node --check` for changed backend modules.
- Ran `npx tsc --noEmit --project frontend/tsconfig.json` successfully.
- Used an isolated temporary SQLite backend to verify acknowledged send, duplicate message idempotency, conversation sync, persisted read acknowledgement, typing expiry, and multi-session presence.
- Ran the frontend production build; compilation completed successfully.
- Ran frontend lint. It remains blocked by the same four pre-existing unescaped-apostrophe errors in visitor-chat JSX, plus existing warnings; P002 introduced no new lint errors.

### Remaining Risks

- Presence, typing timers, transfer state, and AI locks are still in-memory and are not shared across backend instances.
- Read markers are persisted but are not yet surfaced as a full read-receipt UI.
- The admin conversation endpoint still loads complete selected-user histories and needs a paginated inbox/read model at larger scale.
- Formal schema migrations and realtime integration tests remain outstanding.

### Next Phase

P003 — Pending definition.

### Suggested Conventional Commit

```text
feat(realtime): harden message delivery and conversation state
```

</details>

<details>
<summary><strong>Phase 002 — Widget Theme Isolation</strong></summary>

### TODO

Add the objective, completed work, affected files, decisions, issues, follow-up actions, and suggested commit for this phase.

</details>

<details>
<summary><strong>Phase 003 — In Progress</strong></summary>

### TODO

Document the active objective, scope, and completion criteria when this phase is defined. Update the summary table and add a full phase record when it is completed.

</details>

<details>
<summary><strong>P001 — Security Hardening Foundation</strong></summary>

### Objective

Eliminate the release-blocking authentication, authorisation, tenant-isolation, and Socket.IO impersonation risks while preserving the existing visitor and admin chat flows.

### Work Completed

- Removed privileged JWTs from the login response and browser `localStorage`; admin authentication now uses the HttpOnly `whoami` cookie only.
- Added fail-closed authentication configuration checks and removed insecure JWT/admin fallback values.
- Added signed HttpOnly visitor sessions after registration and required them for visitor profile, conversation, message, transcript, close, and new-conversation routes.
- Added a `tenants` table plus tenant IDs and tenant-scoped indexes for existing users and conversations, including compatibility updates for existing SQLite data.
- Scoped visitor and admin database access, updates, conversation lists, and exports to the authenticated tenant.
- Added authenticated Socket.IO handshake middleware. Socket identities, roles, senders, tenant IDs, and rooms now come from the verified session instead of client payloads.
- Restricted realtime presence broadcasts to tenant rooms and conversation events to authorised rooms. Message timestamps and sender IDs are now server-derived.
- Added message acknowledgements for successful/rejected Socket.IO sends and limited JSON body size.
- Corrected the ESLint flat-config ignore declaration so lint can execute.

### Files Changed

- `backend/middleware/auth.js`
- `backend/middleware/adminAuth.js`
- `backend/server.js`
- `backend/db.js`
- `backend/routes/adminAuth.js`
- `backend/routes/users.js`
- `backend/routes/conversations.js`
- `backend/routes/admin.js`
- `backend/controllers/socketController.js`
- `backend/controllers/aiController.js`
- `backend/utils/email/email.js`
- `backend/.env.example`
- `frontend/app/admin/auth/page.tsx`
- `frontend/app/chat/page.tsx`
- `frontend/lib/axios.ts`
- `frontend/lib/socket.ts`
- `frontend/store/chatStore.ts`
- `frontend/eslint.config.mjs`

### Security Decisions Made

- Raw user and conversation IDs are identifiers only; a verified session now establishes authority.
- The backend derives privileged/admin and visitor socket identity from signed cookies. Client socket payloads no longer choose the sender, role, or tenant.
- The current deployment uses the configured `DEFAULT_TENANT_ID` as its single tenant. Every protected query now includes the authenticated tenant ID, creating the boundary needed for future tenant provisioning.
- Cross-origin widget support requires credentialed requests; visitor cookies use `SameSite=None; Secure` in production and `Lax` locally.

### Verification Steps

- Checked syntax for all changed backend modules with `node --check`.
- Started an isolated temporary backend using a temporary SQLite database and non-production test configuration.
- Verified visitor API authorisation: unauthenticated profile request returned `401`; owner profile and messages returned `200`; cross-user profile returned `403`; cross-user messages returned `404`.
- Verified Socket.IO: an unauthenticated handshake was rejected and an authenticated visitor session connected successfully.
- Ran `npm run build --workspace=frontend`; compilation completed successfully.
- Ran `npm run lint --workspace=frontend`. The command executes but remains failing on four pre-existing `react/no-unescaped-entities` errors in the two visitor chat components, alongside existing warnings. Those non-security UI issues were not changed in P001.

### Remaining Risks

- The schema compatibility migration is intentionally small; a formal migration framework and multi-tenant provisioning/administration remain future work.
- Socket presence, transfer state, AI locks, and quotas are still process-local and are not horizontally scalable.
- Cookie-authenticated cross-origin deployments need final production CORS/origin and browser third-party-cookie validation.
- Rate limiting, CSRF defence-in-depth, security headers/CSP, attachment controls, and security regression tests remain outstanding.

### Next Phase

P002 — Realtime Reliability & Conversation Integrity.

### Suggested Conventional Commit

```text
feat(security): harden tenant-scoped sessions and Socket.IO authorisation
```

</details>

<details>
<summary><strong>P003 — Production Readiness &amp; Observability</strong></summary>

### Objective

Establish focused production operational foundations for structured logging, error handling, service health, audit history, and recovery guidance.

### Work Completed

- Added structured JSON backend logs for HTTP requests, authentication/permission failures, socket lifecycle/events, and unhandled errors.
- Added request IDs returned as `X-Request-Id` and standardised unhandled HTTP error responses.
- Added `GET /health` liveness and `GET /ready` database-readiness endpoints.
- Added tenant-scoped `audit_events` storage and event recording for sessions, admin actions, conversation lifecycle/read actions, message sends, and socket joins.
- Added frontend route and global error boundaries plus clearer HTTP/socket recovery messages.
- Added deployment, monitoring, backup, recovery, and incident-response documentation.

### Files Changed

- `backend/utils/logger.js`
- `backend/utils/audit.js`
- `backend/db.js`
- `backend/server.js`
- `backend/routes/index.js`
- `backend/middleware/auth.js`
- `backend/middleware/adminAuth.js`
- `backend/routes/adminAuth.js`
- `backend/routes/users.js`
- `backend/routes/conversations.js`
- `backend/routes/admin.js`
- `backend/controllers/socketController.js`
- `frontend/app/error.tsx`
- `frontend/app/global-error.tsx`
- `frontend/lib/axios.ts`
- `frontend/lib/socket.ts`
- `docs/operations/deployment.md`
- `docs/architecture/backend.md`
- `docs/architecture/database.md`

### Verification Steps

- Ran `node --check` for changed backend modules.
- Ran `npx tsc --noEmit --project frontend/tsconfig.json` successfully.
- Used an isolated temporary SQLite backend to verify `GET /health` and `GET /ready` return `200`, health responses include `X-Request-Id`, and visitor-session creation writes an audit event.
- Confirmed structured JSON request and audit logs include safe operational identifiers without request bodies or credentials.
- Ran `npm run build --workspace=frontend` successfully. Frontend lint still fails on four pre-existing unescaped-apostrophe JSX errors and existing warnings; TODO: resolve these before making lint a release gate.

### Remaining Risks

- Structured logs are stdout-only; external aggregation, retention, alerts, and metrics export remain deployment work.
- Audit events are a foundation, not a complete compliance/audit programme.
- SQLite backup and recovery are documented but not automated.

### Next Phase

P004 — Not started.

### Suggested Conventional Commit

```text
feat(ops): add observability and audit foundations
```

</details>
