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

`conversations.userId` references `users.id`; `messages.conversationId` references `conversations.id`. UUID strings are used as primary IDs.

## Important constraints

- No workspace/tenant, membership, agent, attachment, read-receipt, event, or audit tables exist.
- No secondary indexes or versioned migrations are defined.
- `senderId` can represent a visitor, `admin`, or `system`; it is not a consistent foreign key.
- TODO: confirm whether SQLite foreign-key enforcement is enabled in every deployed runtime.

## Maintenance rule

Do not add production schema changes through runtime `CREATE TABLE` calls. Introduce a migration tool and document each migration before schema evolution.

See [backend](backend.md) and [security overview](../security/overview.md).

