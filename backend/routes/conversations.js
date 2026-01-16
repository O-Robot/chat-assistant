import express from "express";
import { openDB } from "../db.js";

const router = express.Router();

router.get("/:id/messages", async (req, res) => {
  const db = await openDB();

  const messages = await db.all(
    `SELECT * FROM messages WHERE conversationId = ? ORDER BY timestamp ASC`,
    [req.params.id]
  );

  res.json(messages);
});

export default router;
