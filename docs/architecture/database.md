# Database architecture

## Purpose

Describe the current storage model, scaling safeguards, and the path away from SQLite when product demand requires it.

## Current storage

The backend opens SQLite through `backend/db.js`. The database path is `DB_PATH` or `./db/data.sqlite` relative to the backend runtime. Startup applies the compatibility schema and then versioned, transactional data migrations from `backend/migrations.js`. `npm run migrate --workspace=robot-chat-backend` is safe to run before deployment; startup also checks that migrations are current.

| Table | Current role |
| --- | --- |
| `users` | Visitor contact details and creation time. |
| `conversations` | A visitor conversation, status, creation and close time. |
| `messages` | Conversation message content, sender ID, and timestamp. |
| `conversation_reads` | Per-principal last-read message and timestamp for a conversation. |
| `audit_events` | Tenant-scoped immutable record of security-sensitive actions. |
| `attachments` | Attachment metadata and lifecycle state; binary file bytes are intentionally not stored in SQLite. |
| `message_search` | SQLite FTS5 index for tenant-filtered message search. It is a data-layer foundation, not yet a product API. |
| `schema_migrations` | Applied migration IDs. |

`conversations.userId` references `users.id`; `messages.conversationId` references `conversations.id`. UUID strings are used as primary IDs. Conversation activity is represented by `lastMessageAt`; it is backfilled for existing data and updated when a message is persisted.

## Important constraints

- `conversation_reads`, `attachments`, and search rows carry tenant information or derive it through the conversation. New data access must filter by the authenticated tenant, even after a preceding authorisation check.
- At most one `open` conversation exists per tenant/user, enforced by a partial unique index. Creation closes the previous conversation and inserts the replacement inside an immediate SQLite transaction.
- Message history is keyset paginated by `(timestamp, id)` with a maximum page size of 100. The compound message index supports this access pattern.
- The legacy `users.email UNIQUE` constraint may remain in existing SQLite files. New databases use a tenant/email index, but a controlled table rebuild is required before existing SQLite deployments can support the same email in multiple tenants. TODO: schedule this alongside tenant provisioning or the PostgreSQL migration.
- `senderId` can represent a visitor, `admin`, or `system`; it is not a consistent foreign key.
- Foreign-key enforcement is enabled for every connection in `openDB`.

## Maintenance rule

Message history is retrieved newest-first with a bounded cursor page, then returned in chronological order. Read markers use a conversation/principal primary key. The admin selected-user endpoint is still a compatibility endpoint that loads full histories; do not use it as an inbox listing at scale. TODO: replace it with a tenant-scoped, paginated admin conversation API before large-scale rollout.

## Attachment lifecycle

Attachment metadata may be created as `pending`, then moved to `available` only after the object has been stored and scanned. `quarantined`, `failed`, and `deleted` prevent delivery. A future upload implementation must use tenant-prefixed, opaque object keys, checksum/size/content-type validation, short-lived signed upload/download URLs, malware scanning, and a scheduled purge of expired/deleted objects. No upload endpoint or object-storage provider is configured today.

## Search foundation

`message_search` is maintained by SQLite triggers and backfilled by migration `001_data_layer_scaling`. The internal search helper accepts a tenant ID and uses a bounded, prefix-matching FTS query. Any future endpoint must first authorise conversation membership/role and must preserve tenant filtering. Conversation/contact search has no index or API yet. TODO: define relevance, retention, redaction, and permission requirements before exposing search.

## SQLite production assessment and PostgreSQL path

SQLite is suitable for the current single-node, low-write deployment with reliable local disk and tested backups. It serialises writers, does not share Socket.IO/data state between nodes, and makes multi-instance deployments, high attachment throughput, and sustained concurrent message writes poor fits.

Move to PostgreSQL before horizontal backend scaling or sustained write contention. The migration should: export a consistent SQLite snapshot; validate tenant, user, conversation, message, read-marker, audit, and attachment counts/checksums; load into a staging PostgreSQL database; recreate constraints and indexes; dual-verify keyset pagination and tenant authorisation; take a short write freeze; switch `DATABASE_URL`; and retain the SQLite snapshot for rollback. TODO: select a PostgreSQL driver/query layer and perform a rehearsed restore before committing to a cutover date.

See [backend](backend.md) and [security overview](../security/overview.md).
