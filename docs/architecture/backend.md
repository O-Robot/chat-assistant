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

## TODO

- Introduce request/event schemas, central error handling, structured logging, rate limiting, and health checks.
- Move durable business operations and AI/email work to explicit services/jobs.
- Document production process management and reverse-proxy configuration; the referenced PM2 ecosystem file is not in this repository.

See [database](database.md), [authentication](authentication.md), and [security overview](../security/overview.md).

