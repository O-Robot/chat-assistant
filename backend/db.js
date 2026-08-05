import path from "path";
import fs from "fs";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { runMigrations } from "./migrations.js";
import { logger } from "./utils/logger.js";

let database = null;
let initialisation = null;

async function createSchema(db) {
  const dbPath = process.env.DB_PATH || path.resolve("./db/data.sqlite");
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

  await db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000");
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, firstName TEXT, lastName TEXT, email TEXT NOT NULL, phone TEXT, country TEXT, tenantId TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, userId TEXT, status TEXT DEFAULT 'open', tenantId TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP, closedAt DATETIME, lastMessageAt DATETIME, FOREIGN KEY (userId) REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversationId TEXT, senderId TEXT, content TEXT, timestamp DATETIME DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (conversationId) REFERENCES conversations(id));
    CREATE TABLE IF NOT EXISTS conversation_reads (conversationId TEXT NOT NULL, tenantId TEXT NOT NULL, readerId TEXT NOT NULL, lastReadMessageId TEXT, readAt DATETIME DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (conversationId, readerId), FOREIGN KEY (conversationId) REFERENCES conversations(id), FOREIGN KEY (lastReadMessageId) REFERENCES messages(id));
    CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, tenantId TEXT NOT NULL, actorId TEXT, actorRole TEXT, action TEXT NOT NULL, resourceType TEXT, resourceId TEXT, metadata TEXT, createdAt DATETIME DEFAULT CURRENT_TIMESTAMP);
  `);

  const userColumns = await db.all("PRAGMA table_info(users)");
  if (!userColumns.some((column) => column.name === "tenantId")) await db.exec("ALTER TABLE users ADD COLUMN tenantId TEXT");
  const conversationColumns = await db.all("PRAGMA table_info(conversations)");
  if (!conversationColumns.some((column) => column.name === "tenantId")) await db.exec("ALTER TABLE conversations ADD COLUMN tenantId TEXT");

  const tenantId = process.env.DEFAULT_TENANT_ID || "portfolio";
  await db.run("INSERT OR IGNORE INTO tenants (id, name) VALUES (?, ?)", [tenantId, process.env.TENANT_NAME || "Portfolio"]);
  await db.run("UPDATE users SET tenantId = ? WHERE tenantId IS NULL", [tenantId]);
  await db.run("UPDATE conversations SET tenantId = ? WHERE tenantId IS NULL", [tenantId]);
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_tenant_created ON users(tenantId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_conversations_tenant_user_status ON conversations(tenantId, userId, status, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_messages_conversation_timestamp ON messages(conversationId, timestamp DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_conversation_reads_tenant ON conversation_reads(tenantId, readerId, readAt DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_events_tenant_created ON audit_events(tenantId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_events_resource ON audit_events(resourceType, resourceId, createdAt DESC);
  `);
}

export async function initializeDatabase({ migrate = true } = {}) {
  if (database) return database;
  if (!initialisation) {
    initialisation = (async () => {
      const dbPath = process.env.DB_PATH || path.resolve("./db/data.sqlite");
      const dbDir = path.dirname(dbPath);
      if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
      const db = await open({ filename: dbPath, driver: sqlite3.Database });
      await createSchema(db);
      if (migrate) await runMigrations(db);
      database = db;
      logger.info("database_ready", { path: dbPath, migrationsRun: migrate });
      return db;
    })().catch((error) => {
      initialisation = null;
      throw error;
    });
  }
  return initialisation;
}

/** Returns the startup-managed database. Request handlers never run migrations. */
export async function openDB() {
  if (!database) throw new Error("Database is not initialised");
  return database;
}

export async function closeDatabase() {
  if (!database) return;
  await database.close();
  database = null;
  initialisation = null;
}
