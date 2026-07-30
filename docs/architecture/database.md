# Database architecture

## Purpose

Record the current SQLite model and its known constraints.

## Current storage

The backend opens SQLite through `backend/db.js`. The database path is `DB_PATH` or `./db/data.sqlite` relative to the backend runtime. The application currently creates tables with `CREATE TABLE IF NOT EXISTS`.

| Table | Current role |
| --- | --- |
| `users` | Visitor contact details and creation time. |
| `conversations` | A visitor conversation, status, creation and close time. |
| `messages` | Conversation message content, sender ID, and timestamp. |
| `conversation_reads` | Per-principal last-read message and timestamp for a conversation. |

`conversations.userId` references `users.id`; `messages.conversationId` references `conversations.id`. UUID strings are used as primary IDs.

## Important constraints

- No membership, agent, attachment, event, or audit tables exist.
- No versioned migrations are defined.
- `senderId` can represent a visitor, `admin`, or `system`; it is not a consistent foreign key.
- TODO: confirm whether SQLite foreign-key enforcement is enabled in every deployed runtime.

## Maintenance rule

Message history has a conversation/timestamp/id index and is retrieved newest-first with a bounded cursor page, then returned in chronological order. Read markers use a conversation/principal primary key. TODO: introduce formal migrations and transactional status transitions; current compatibility DDL still runs from application setup.

See [backend](backend.md) and [security overview](../security/overview.md).
