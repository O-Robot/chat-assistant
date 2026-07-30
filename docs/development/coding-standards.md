# Coding standards

## Purpose

Set lightweight conventions for changes while the project evolves.

## General

- Use UK English in user-facing copy and documentation.
- Prefer small, focused modules and descriptive names over large route/component files.
- Do not mix authorisation, persistence, transport, and UI rendering concerns in one function.
- Avoid `any`; define shared TypeScript types or schemas at boundaries.
- Use parameterised SQL only. Do not concatenate input into queries.

## Frontend

- Keep server components server-rendered unless browser APIs, interactivity, or client state are needed.
- Reuse shared chat behaviour rather than duplicating widget and full-page logic.
- Treat all rendered HTML as untrusted; use the approved sanitisation policy.
- Implement loading, empty, error, offline, and retry states for asynchronous flows.

## Backend and realtime

- Validate every HTTP body, parameter, and socket event before use.
- Derive actor identity, role, tenant, and allowed conversation from authenticated server context.
- Use acknowledgements/idempotency for message-changing events.
- Put long-running AI, email, and document work behind explicit jobs when introduced.

## Quality gate

Run frontend lint/build before review. TODO: add formatting, backend lint/type checks, unit/integration/e2e tests, and CI gates.

See [security checklist](../security/checklist.md) and [backend](../architecture/backend.md).

