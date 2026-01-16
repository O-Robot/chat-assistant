// backend/db.js
import sqlite3 from "sqlite3";
import { open } from "sqlite";

// Initialize and open SQLite DB
export async function openDB() {
  const db = await open({
    filename: "./db/data.sqlite",
    driver: sqlite3.Database,
  });

  // Create users table if it doesn't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      firstName TEXT,
      lastName TEXT,
      email TEXT,
      phone TEXT,
      country TEXT
    )
  `);

  // Create conversations table if it doesn't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      userId TEXT,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  return db;
}
