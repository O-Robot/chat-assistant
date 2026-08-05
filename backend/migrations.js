const migrations = [
  {
    id: "001_data_layer_scaling",
    async up(db) {
      const conversationColumns = await db.all("PRAGMA table_info(conversations)");
      if (!conversationColumns.some((column) => column.name === "lastMessageAt")) {
        await db.exec("ALTER TABLE conversations ADD COLUMN lastMessageAt DATETIME");
      }

      await db.exec(`
        UPDATE conversations
        SET lastMessageAt = (
          SELECT MAX(m.timestamp)
          FROM messages m
          WHERE m.conversationId = conversations.id
        )
        WHERE lastMessageAt IS NULL;

        UPDATE conversations
        SET status = 'closed', closedAt = COALESCE(closedAt, CURRENT_TIMESTAMP)
        WHERE status = 'open'
          AND EXISTS (
            SELECT 1
            FROM conversations newer
            WHERE newer.userId = conversations.userId
              AND newer.tenantId = conversations.tenantId
              AND newer.status = 'open'
              AND (
                newer.createdAt > conversations.createdAt
                OR (newer.createdAt = conversations.createdAt AND newer.id > conversations.id)
              )
          );

        CREATE INDEX IF NOT EXISTS idx_users_tenant_email
          ON users(tenantId, email);
        CREATE INDEX IF NOT EXISTS idx_conversations_tenant_status_activity
          ON conversations(tenantId, status, lastMessageAt DESC, createdAt DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_one_open_per_user
          ON conversations(tenantId, userId) WHERE status = 'open';

        CREATE TABLE IF NOT EXISTS attachments (
          id TEXT PRIMARY KEY,
          tenantId TEXT NOT NULL,
          conversationId TEXT NOT NULL,
          messageId TEXT,
          storageKey TEXT NOT NULL UNIQUE,
          originalName TEXT NOT NULL,
          contentType TEXT NOT NULL,
          byteSize INTEGER NOT NULL CHECK (byteSize >= 0),
          checksum TEXT,
          status TEXT NOT NULL DEFAULT 'pending'
            CHECK (status IN ('pending', 'available', 'quarantined', 'deleted', 'failed')),
          expiresAt DATETIME,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          uploadedAt DATETIME,
          deletedAt DATETIME,
          FOREIGN KEY (conversationId) REFERENCES conversations(id),
          FOREIGN KEY (messageId) REFERENCES messages(id)
        );
        CREATE INDEX IF NOT EXISTS idx_attachments_tenant_conversation_status
          ON attachments(tenantId, conversationId, status, createdAt DESC);
        CREATE INDEX IF NOT EXISTS idx_attachments_cleanup
          ON attachments(status, expiresAt) WHERE expiresAt IS NOT NULL;

        CREATE VIRTUAL TABLE IF NOT EXISTS message_search USING fts5(
          messageId UNINDEXED,
          conversationId UNINDEXED,
          tenantId UNINDEXED,
          content,
          tokenize = 'unicode61'
        );

        CREATE TRIGGER IF NOT EXISTS message_search_insert
        AFTER INSERT ON messages
        BEGIN
          INSERT INTO message_search (messageId, conversationId, tenantId, content)
          SELECT NEW.id, NEW.conversationId, c.tenantId, NEW.content
          FROM conversations c WHERE c.id = NEW.conversationId;
        END;

        CREATE TRIGGER IF NOT EXISTS message_search_update
        AFTER UPDATE OF content, conversationId ON messages
        BEGIN
          DELETE FROM message_search WHERE messageId = OLD.id;
          INSERT INTO message_search (messageId, conversationId, tenantId, content)
          SELECT NEW.id, NEW.conversationId, c.tenantId, NEW.content
          FROM conversations c WHERE c.id = NEW.conversationId;
        END;

        CREATE TRIGGER IF NOT EXISTS message_search_delete
        AFTER DELETE ON messages
        BEGIN
          DELETE FROM message_search WHERE messageId = OLD.id;
        END;
      `);

      await db.run(`
        INSERT INTO message_search (messageId, conversationId, tenantId, content)
        SELECT m.id, m.conversationId, c.tenantId, m.content
        FROM messages m
        JOIN conversations c ON c.id = m.conversationId
        WHERE NOT EXISTS (
          SELECT 1 FROM message_search s WHERE s.messageId = m.id
        )
      `);
    },
  },
  {
    id: "002_inbox_productivity",
    async up(db) {
      const columns = await db.all("PRAGMA table_info(conversations)");
      if (!columns.some((column) => column.name === "isPinned")) {
        await db.exec("ALTER TABLE conversations ADD COLUMN isPinned INTEGER NOT NULL DEFAULT 0");
      }
      if (!columns.some((column) => column.name === "isStarred")) {
        await db.exec("ALTER TABLE conversations ADD COLUMN isStarred INTEGER NOT NULL DEFAULT 0");
      }
      if (!columns.some((column) => column.name === "snoozedUntil")) {
        await db.exec("ALTER TABLE conversations ADD COLUMN snoozedUntil DATETIME");
      }

      await db.exec(`
        CREATE INDEX IF NOT EXISTS idx_conversations_tenant_inbox
          ON conversations(tenantId, status, isPinned DESC, isStarred DESC, snoozedUntil, lastMessageAt DESC);

        CREATE TABLE IF NOT EXISTS conversation_tags (
          conversationId TEXT NOT NULL,
          tenantId TEXT NOT NULL,
          tag TEXT NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (conversationId, tag),
          FOREIGN KEY (conversationId) REFERENCES conversations(id)
        );
        CREATE INDEX IF NOT EXISTS idx_conversation_tags_tenant_tag
          ON conversation_tags(tenantId, tag);

        CREATE TABLE IF NOT EXISTS conversation_notes (
          id TEXT PRIMARY KEY,
          conversationId TEXT NOT NULL,
          tenantId TEXT NOT NULL,
          authorId TEXT NOT NULL,
          content TEXT NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (conversationId) REFERENCES conversations(id)
        );
        CREATE INDEX IF NOT EXISTS idx_conversation_notes_tenant_conversation
          ON conversation_notes(tenantId, conversationId, createdAt DESC);
      `);
    },
  },
  {
    id: "003_remove_archive_status",
    async up(db) {
      // Archive was not retained as an inbox workflow. Restore any chats that
      // may have been archived while P007 was being introduced.
      await db.run("UPDATE conversations SET status = 'open' WHERE status = 'archived'");
    },
  },
  {
    id: "004_ai_and_remote_admin",
    async up(db) {
      const columns = await db.all("PRAGMA table_info(conversations)");
      if (!columns.some((column) => column.name === "aiState")) await db.exec("ALTER TABLE conversations ADD COLUMN aiState TEXT NOT NULL DEFAULT 'active'");
      if (!columns.some((column) => column.name === "summary")) await db.exec("ALTER TABLE conversations ADD COLUMN summary TEXT");
      if (!columns.some((column) => column.name === "summaryUpdatedAt")) await db.exec("ALTER TABLE conversations ADD COLUMN summaryUpdatedAt DATETIME");
      await db.exec(`
        CREATE TABLE IF NOT EXISTS conversation_journeys (
          conversationId TEXT PRIMARY KEY,
          tenantId TEXT NOT NULL,
          currentPage TEXT,
          referrer TEXT,
          visitedPages TEXT NOT NULL DEFAULT '[]',
          userAgent TEXT,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (conversationId) REFERENCES conversations(id)
        );
        CREATE TABLE IF NOT EXISTS saved_replies (
          id TEXT PRIMARY KEY,
          tenantId TEXT NOT NULL,
          shortcut TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT NOT NULL,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (tenantId, shortcut)
        );
        CREATE INDEX IF NOT EXISTS idx_saved_replies_tenant_shortcut ON saved_replies(tenantId, shortcut);
      `);
    },
  },
  {
    id: "005_pause_ai_on_handover",
    async up(db) {
      await db.run("UPDATE conversations SET aiState = 'paused' WHERE status = 'transferred'");
    },
  },
];

export async function runMigrations(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      appliedAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  for (const migration of migrations) {
    const applied = await db.get("SELECT id FROM schema_migrations WHERE id = ?", [migration.id]);
    if (applied) continue;

    await db.exec("BEGIN IMMEDIATE");
    try {
      await migration.up(db);
      await db.run("INSERT INTO schema_migrations (id) VALUES (?)", [migration.id]);
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  }
}
