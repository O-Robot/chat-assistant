# Project Journal

## Purpose

This document is a chronological development log for the project. Append each completed phase to this file.

| Phase | Date | Status | Commit |
| --- | --- | --- | --- |
| 001 | 2026-07-30 | ✅ Completed | `feat(auth): implement secure JWT flow` |
| 002 | 2026-08-01 | ✅ Completed | `fix(widget): isolate iframe theme` |
| 003 | 2026-08-02 | 🚧 In Progress | Pending |

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

