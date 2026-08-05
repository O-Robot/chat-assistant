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
| P006 | 2026-07-31 | ✅ Completed | `feat(admin): polish premium support inbox workspace` |
| P006.1 | 2026-07-31 | ✅ Completed | `fix(admin): stabilise handover and conversation controls` |
| P007 | 2026-08-04 | ✅ Completed | `feat(admin): add inbox productivity and conversation intelligence` |

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

<details>
<summary><strong>P006 — Premium Admin Inbox Experience</strong></summary>

### Objective

Turn the existing admin inbox into a clearer, more comfortable support workspace while preserving the established API, authentication, and realtime behaviour.

### UX Improvements Made

- Redesigned the inbox layout around an intentional three-panel workspace: conversation list, message workspace, and responsive customer context.
- Improved conversation-list hierarchy with search, filter states, unread emphasis, online presence, selection treatment, keyboard focus, loading skeletons, and a useful empty state.
- Improved conversation reading with day separators, sender grouping, system-message treatment, clearer bubbles, typing feedback, archive affordances, and a non-disruptive jump-to-latest control.
- Polished the composer with clearer focus and disabled states, a visible keyboard shortcut hint, send-button feedback, and per-conversation draft preservation.
- Added a customer-details panel on ultrawide displays and an accessible context drawer on smaller viewports, using existing visitor and conversation data only.

### Components Redesigned

- `frontend/app/admin/page.tsx` — inbox shell, conversation sidebar, conversation header, message timeline, composer, responsive details context, and empty/loading states.

### Responsive and Accessibility Improvements

- The inbox list becomes a mobile drawer; customer context becomes a drawer below the ultrawide breakpoint rather than compressing the message workspace.
- Replaced click-only conversation rows with semantic buttons and added labels for toolbar, drawer, search, and send controls.
- Added visible keyboard focus states, semantic message/conversation labels, improved contrast, and motion-safe transitions/typing animation.

### Performance Considerations

- Kept existing data and Socket.IO flows unchanged.
- The message timeline now avoids forcing agents back to the bottom while they review history, while retaining an explicit jump-to-latest action.
- Used derived client-side filter state and avoided introducing new polling, API calls, or dependencies.

### Verification Steps

- Ran `npx tsc --noEmit` in `frontend` successfully.
- Ran frontend lint successfully.
- Ran the frontend production build successfully.
- Checked the working-tree diff for whitespace errors.

### Remaining Risks

- Inbox data still relies on the existing full user list and per-user conversation-history endpoint; backend pagination/filter APIs remain the scalability path.
- Tags, assignment, activity timeline, and attachment handling are intentionally presented only as future workspace capacity; no product workflow was added in this UI phase.

### Next Phase

P007 — Not started.

### Suggested Conventional Commit

```text
feat(admin): polish premium support inbox workspace
```

</details>

<details>
<summary><strong>P006.1 — Admin Workspace Stabilisation &amp; UX Refinements</strong></summary>

### Objective

Correct functional regressions from P006 and refine the existing admin workspace without changing the broader product architecture or authentication contracts.

### Bugs Fixed

- Made message identity explicit across the socket, stored message hydration, and the admin timeline: visitor, admin, AI, and system messages now have distinct sender metadata and rendering.
- Changed new AI replies to use the `ai` sender identity; historical and operational system events remain lightweight system messages.
- Made human handover durable: an authenticated admin reply persists `transferred` status before broadcast, suppresses AI immediately, and drops any AI result that completes after takeover.
- Restored transferred-conversation room membership after reconnect for both visitors and admins.
- Restored admin typing visibility on the visitor side and refreshes the typing heartbeat while the composer changes.
- Added acknowledged close handling with optimistic local state, error feedback, and visitor realtime propagation.
- Added a tenant-scoped, admin-only delete conversation action with confirmation, processing state, audit logging, realtime notification, and dependent data cleanup.
- Corrected the Online filter to use live Socket.IO presence rather than persisted visitor status.
- Fixed Socket.IO principal selection when visitor and admin cookies coexist: the client now requests its route context and the server selects the matching verified session, so admin replies are persisted as admin messages and initiate human takeover.
- Standardised the admin timeline AI avatar to DiceBear Bottts Neutral seed `Nadia` and added lifecycle-safe destructive actions: only closed conversations can be deleted, while admin-only visitor deletion removes the visitor and all tenant-scoped conversation history after confirmation.
- Added selected-conversation transcript actions to the customer-details drawer alongside contact shortcuts for email, telephone, and WhatsApp.
- Clarified conversation scope in the admin workspace: the ellipsis menu now retains full-history conversation send/export/delete actions, while each session divider exposes independent send/export/delete chat actions backed by tenant-scoped admin HTTP endpoints.

### UX and Accessibility Improvements

- Refined admin authentication into a responsive, accessible SaaS sign-in experience without altering the login flow.
- Upgraded the shared confirmation dialog to support asynchronous actions and expose processing state, then reused it for logout, close, and deletion confirmations.
- Added clear admin, Robot, and system labels plus distinct bubble/colour/avatar treatment in the admin timeline, without redesigning visitor chat surfaces.
- Consolidated the admin profile experience into the existing customer-details drawer, preserving its responsive structure while adding the legacy profile view and edit/save workflow. The standalone profile component remains available for other consumers.

### Verification Steps

- Ran `npx tsc --noEmit` successfully in `frontend`.
- Ran frontend lint successfully: 20 pre-existing warnings remain, with no errors or new warnings from this phase.
- Ran frontend production build successfully.
- Ran `node --check` for all changed backend modules successfully.
- Checked the working-tree diff for whitespace errors.
- Manual runtime checks still required in a configured local environment: admin reply takeover while an AI request is in flight, close/delete acknowledgements, and visitor typing visibility.

### Remaining Known Issues

- Conversation ownership is persisted via status but is still managed by process-local Socket.IO state for live presence and pending transfer prompts; multi-node scaling remains a later infrastructure concern.
- Existing historical AI responses stored as `system` remain styled as system events. Newly generated AI messages use the explicit `ai` identity.
- The admin conversation-history endpoint remains unpaginated and should be replaced before very large histories are common.

### Next Phase

P007 — Not started.

### Suggested Conventional Commit

```text
fix(admin): stabilise handover and conversation controls
```

</details>

<details>
<summary><strong>P007 — Productivity &amp; Inbox Intelligence</strong></summary>

### Objective

Make the existing admin inbox faster for daily support work without changing the established security, realtime, or layout architecture.

### Productivity and UX Improvements

- Added tenant-scoped pin, star, and one-day snooze controls to the existing conversation workspace.
- Added multi-select bulk pin and star actions in the inbox list.
- Added a command palette (Cmd/Ctrl + K), reply shortcut (`R`), copy-conversation-link action, and per-message copy action.
- Added FTS-backed message search results with matching snippets alongside visitor search.
- Added pinned/starred indicators in the conversation list.

### Customer Context Improvements

- Added migration-backed conversation tags and internal notes with tenant-scoped API access.
- Added conversation context in the existing customer details drawer: tags, private notes, message statistics, and available location data.

### Performance and Security Considerations

- Reused the existing FTS message-search index and capped message search results.
- Added indexed inbox metadata and tenant-scoped tag/note tables through an idempotent migration.
- All new routes remain behind the existing admin authentication middleware and scope every read/write to the authenticated tenant.
- Bulk requests are capped at 100 conversations and validate allowed actions.

### Verification Steps

- Ran `node --check` for changed backend modules successfully.
- Ran `npx tsc --noEmit` successfully in `frontend`.
- Ran targeted frontend lint: no errors; four pre-existing hook-dependency warnings remain in the admin page.
- Ran `npm run build` successfully in `frontend`.
- Checked the working-tree diff for whitespace errors.

### Remaining Known Issues

- The inbox still retrieves the full tenant visitor list; server-side inbox pagination and richer filtering remain the next scalability step.
- Browser/device data is not currently collected by the visitor client, so the drawer presents only available location/profile data.
- Attachments are prepared in the data model but have no upload or message-rendering workflow yet.

### Next Phase

P008 — Not started.

### Suggested Conventional Commit

```text
feat(admin): add inbox productivity and conversation intelligence
```

</details>
