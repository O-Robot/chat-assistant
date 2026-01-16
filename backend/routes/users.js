import express from "express";
import { v4 as uuidv4 } from "uuid";
import { openDB } from "../db.js";

const router = express.Router();

// GET /api/users/:id → check user, return user info and latest conversation if any
router.get("/:id", async (req, res) => {
  const db = await openDB();
  const user = await db.get("SELECT * FROM users WHERE id = ?", req.params.id);

  if (!user) return res.status(404).json({ message: "User not found" });

  // Get the latest conversation for this user (if any)
  const conversation = await db.get(
    `SELECT * FROM conversations WHERE userId = ? ORDER BY createdAt DESC LIMIT 1`,
    req.params.id
  );

  res.json({
    user,
    conversation: conversation || null, // return the conversation if exists
  });
});

// POST /api/users → create user if not exists, ensure one open conversation
router.post("/", async (req, res) => {
  const { firstName, lastName, email, phone, country } = req.body;
  if (!firstName || !lastName || !email || !phone || !country) {
    return res.status(400).json({ message: "Missing fields" });
  }

  const db = await openDB();

  // 1️⃣ Check if user exists
  let user = await db.get("SELECT * FROM users WHERE email = ?", email);

  if (!user) {
    const userId = uuidv4();
    await db.run(
      "INSERT INTO users (id, firstName, lastName, email, phone, country) VALUES (?, ?, ?, ?, ?, ?)",
      userId,
      firstName,
      lastName,
      email,
      phone,
      country
    );
    user = { id: userId, firstName, lastName, email, phone, country };
  }

  // 2️⃣ Close any existing open conversation
  await db.run(
    "UPDATE conversations SET status='closed' WHERE userId=? AND status='open'",
    user.id
  );

  // 3️⃣ Create a new conversation
  const conversationId = uuidv4();
  await db.run(
    "INSERT INTO conversations (id, userId, status) VALUES (?, ?, 'open')",
    conversationId,
    user.id
  );

  res.json({ userId: user.id, conversationId });
});

export default router;
