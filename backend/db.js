import path from "path";
import fs from "fs";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

export async function openDB() {
  const dbPath = process.env.DB_PATH || path.resolve("./db/data.sqlite");
  const dbDir = path.dirname(dbPath);

  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`✅ Created missing DB folder: ${dbDir}`);
  }

  const db = await open({
    filename: process.env.DB_PATH || "./db/data.sqlite",
    driver: sqlite3.Database,
  });

  await db.exec("PRAGMA foreign_keys = ON");

  await db.exec(`
    CREATE TABLE IF NOT EXISTS tenants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  const tenantId = process.env.DEFAULT_TENANT_ID || "portfolio";
  await db.run(
    "INSERT OR IGNORE INTO tenants (id, name) VALUES (?, ?)",
    [tenantId, process.env.TENANT_NAME || "Portfolio"],
  );

  // Users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      firstName TEXT,
      lastName TEXT,
      email TEXT UNIQUE,
      phone TEXT,
      country TEXT,
      tenantId TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Conversations table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      userId TEXT,
      status TEXT DEFAULT 'open', -- open / closed / transferred / resolved
      tenantId TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      closedAt DATETIME,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
  `);

  const userColumns = await db.all("PRAGMA table_info(users)");
  if (!userColumns.some((column) => column.name === "tenantId")) {
    await db.exec("ALTER TABLE users ADD COLUMN tenantId TEXT");
  }
  const conversationColumns = await db.all("PRAGMA table_info(conversations)");
  if (!conversationColumns.some((column) => column.name === "tenantId")) {
    await db.exec("ALTER TABLE conversations ADD COLUMN tenantId TEXT");
  }

  await db.run("UPDATE users SET tenantId = ? WHERE tenantId IS NULL", [tenantId]);
  await db.run(
    "UPDATE conversations SET tenantId = ? WHERE tenantId IS NULL",
    [tenantId],
  );
  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_tenant_created ON users(tenantId, createdAt DESC);
    CREATE INDEX IF NOT EXISTS idx_conversations_tenant_user_status ON conversations(tenantId, userId, status, createdAt DESC);
  `);

  // Messages table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversationId TEXT,
      senderId TEXT,
      content TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversationId) REFERENCES conversations(id)
    )
  `);

  await db.exec(
    "CREATE INDEX IF NOT EXISTS idx_messages_conversation_timestamp ON messages(conversationId, timestamp ASC)",
  );

  return db;
}
