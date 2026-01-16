// backend/routes/users.js
import express from "express";
import { openDB } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

// POST /api/users → save user and create conversation
router.post("/", async (req, res) => {
  try {
    const { firstName, lastName, email, phone, country } = req.body;

    if (!firstName || !lastName || !email || !phone || !country) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    const db = await openDB();

    const userId = uuidv4();

    // Save user
    await db.run(
      `INSERT INTO users (id, firstName, lastName, email, phone, country)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, firstName, lastName, email, phone, country]
    );

    // Create conversation
    const conversationId = uuidv4();
    await db.run(`INSERT INTO conversations (id, userId) VALUES (?, ?)`, [
      conversationId,
      userId,
    ]);

    res.json({ userId, conversationId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
