# Backend architecture

## Purpose

Describe the responsibilities of the current Express backend.

## Current responsibilities

`backend/server.js` creates one HTTP server shared by Express and Socket.IO. It configures JSON parsing, cookie parsing, CORS, and routes.

- `routes/users.js`: visitor creation and lookup.
- `routes/conversations.js`: conversation lookup, creation, close, message history, and transcript requests.
- `routes/admin*.js`: admin login/session and protected user/conversation operations.
- `controllers/socketController.js`: realtime connection, messages, typing, presence, closure, and human-transfer handling.
- `controllers/aiController.js`: provider fallback and AI response generation.
- `utils/email/`: email and PDF transcript helpers.

## Conventions

SQL values use prepared statements. User and AI HTML is sanitised before persistence. There is no formal controller/service/repository boundary: routes and socket handlers call the database directly.

## Operations

The backend assigns an `X-Request-Id` to HTTP requests and emits structured JSON request/error logs without request bodies or credentials. `GET /health` is a liveness endpoint; `GET /ready` verifies the SQLite connection. Unhandled HTTP failures use `{ error: { code, message, requestId } }`.

Security-sensitive activity is persisted in tenant-scoped `audit_events`; current events include session creation, admin login, admin updates/exports, conversation creation/closure/read, message sends, and socket joins.

## TODO

- Introduce request/event schemas, rate limiting, formal migrations, and metrics export.
- Move durable business operations and AI/email work to explicit services/jobs.
- Document production process management and reverse-proxy configuration; the referenced PM2 ecosystem file is not in this repository.

See [database](database.md), [authentication](authentication.md), and [security overview](../security/overview.md).
