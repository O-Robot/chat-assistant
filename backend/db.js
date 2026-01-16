import sqlite3 from "sqlite3";
import { open } from "sqlite";

export async function openDB() {
  const db = await open({
    filename: "./db/data.sqlite",
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
      country TEXT
    )
  `);

  // Conversations table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      userId TEXT,
      status TEXT DEFAULT 'open', -- open / closed / resolved
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Messages table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversationId TEXT,
      senderId TEXT,
      content TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db;
}
