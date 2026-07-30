# Project Journal

## Purpose

This document is a chronological development log for the project. Append each completed phase to this file.

| Phase | Date       | Status         | Commit                                                                      |
| ----- | ---------- | -------------- | --------------------------------------------------------------------------- |
| 003   | 2026-08-02 | 🚧 In Progress | Pending                                                                     |
| P001  | 2026-07-30 | ✅ Completed   | `feat(security): harden tenant-scoped sessions and Socket.IO authorisation` |

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

P002 — Widget embed security and cross-origin hardening.

### Suggested Conventional Commit

```text
feat(security): harden tenant-scoped sessions and Socket.IO authorisation
```

</details>
