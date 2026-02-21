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

  // Users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      firstName TEXT,
      lastName TEXT,
      email TEXT UNIQUE,
      phone TEXT,
      country TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Conversations table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      userId TEXT,
      status TEXT DEFAULT 'open', -- open / closed / transferred / resolved
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      closedAt DATETIME,
      FOREIGN KEY (userId) REFERENCES users(id)
    )
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

  return db;
}
