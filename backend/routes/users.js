import express from "express";
import { v4 as uuidv4 } from "uuid";
import { openDB } from "../db.js";

const router = express.Router();

router.get("/:id", async (req, res) => {
  try {
    const db = await openDB();

    const { id } = req.params;
    if (!id) {
      return res.status(400).json({ message: "User id is required" });
    }

    const user = await db.get("SELECT * FROM users WHERE id = ?", [id]);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const conversation = await db.get(
      `SELECT * FROM conversations
       WHERE userId = ? AND status = 'open'
       ORDER BY createdAt DESC
       LIMIT 1`,
      [user.id],
    );

    res.json({
      user,
      conversation: conversation || null,
    });
  } catch (error) {
    console.error("GET /users/:id error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

router.post("/", async (req, res) => {
  try {
    const { firstName, lastName, email, phone, country } = req.body;

    if (
      !firstName?.trim() ||
      !lastName?.trim() ||
      !email?.trim() ||
      !phone?.trim() ||
      !country?.trim()
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const db = await openDB();

    let user = await db.get("SELECT * FROM users WHERE email = ?", [email]);

    if (!user) {
      const userId = uuidv4();

      await db.run(
        `INSERT INTO users (id, firstName, lastName, email, phone, country)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [userId, firstName, lastName, email, phone, country],
      );

      user = await db.get("SELECT * FROM users WHERE id = ?", [userId]);
    }

    if (!user) {
      return res
        .status(500)
        .json({ message: "Failed to create or fetch user" });
    }

    await db.run(
      `UPDATE conversations
       SET status = 'closed', closedAt = CURRENT_TIMESTAMP
       WHERE userId = ? AND status = 'open'`,
      [user.id],
    );

    const conversationId = uuidv4();

    await db.run(
      `INSERT INTO conversations (id, userId, status)
       VALUES (?, ?, 'open')`,
      [conversationId, user.id],
    );

    res.json({
      userId: user.id,
      conversationId,
    });
  } catch (error) {
    console.error("POST /users error:", error);
    res.status(500).json({ message: "Server error" });
  }
});

export default router;
