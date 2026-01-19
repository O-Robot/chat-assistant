import express from "express";
import { openDB } from "../db.js";
import { v4 as uuidv4 } from "uuid";

const router = express.Router();

// Get messages for a conversation
router.get("/:id/messages", async (req, res) => {
  try {
    const db = await openDB();

    const messages = await db.all(
      `SELECT 
        m.id, 
        m.conversationId, 
        m.senderId, 
        m.content, 
        m.timestamp,
        u.firstName,
        u.lastName,
        u.email
      FROM messages m
      LEFT JOIN users u ON m.senderId = u.id
      WHERE m.conversationId = ? 
      ORDER BY m.timestamp ASC`,
      [req.params.id]
    );

    // Convert timestamp strings to numbers for frontend
    const formattedMessages = messages.map((msg) => ({
      ...msg,
      timestamp: new Date(msg.timestamp).getTime(),
      sender:
        msg.senderId === "system"
          ? {
              id: "system",
              firstName: "Robot",
              lastName: "",
              email: "robot@ogooluwaniadewale.com",
            }
          : {
              id: msg.senderId,
              firstName: msg.firstName,
              lastName: msg.lastName,
              email: msg.email,
            },
    }));

    res.json(formattedMessages);
  } catch (error) {
    console.error("Error fetching messages:", error);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Get conversation details
router.get("/:id", async (req, res) => {
  try {
    const db = await openDB();

    const conversation = await db.get(
      `SELECT * FROM conversations WHERE id = ?`,
      [req.params.id]
    );

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json(conversation);
  } catch (error) {
    console.error("Error fetching conversation:", error);
    res.status(500).json({ error: "Failed to fetch conversation" });
  }
});

// Create new conversation
router.post("/new", async (req, res) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "User ID required" });
    }

    const db = await openDB();

    // Close any existing open conversations
    await db.run(
      `UPDATE conversations 
       SET status = 'closed', closedAt = CURRENT_TIMESTAMP 
       WHERE userId = ? AND status = 'open'`,
      [userId]
    );

    // Create new conversation
    const conversationId = uuidv4();
    await db.run(
      "INSERT INTO conversations (id, userId, status) VALUES (?, ?, 'open')",
      [conversationId, userId]
    );

    res.json({ conversationId });
  } catch (error) {
    console.error("Error creating conversation:", error);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// Send transcript
router.post("/:id/send-transcript", async (req, res) => {
  try {
    const { email } = req.body;
    const conversationId = req.params.id;

    if (!email) {
      return res.status(400).json({ error: "Email required" });
    }

    const db = await openDB();

    // Get messages
    const messages = await db.all(
      `SELECT m.*, u.firstName, u.lastName 
       FROM messages m 
       LEFT JOIN users u ON m.senderId = u.id 
       WHERE m.conversationId = ? 
       ORDER BY m.timestamp ASC`,
      [conversationId]
    );

    // TODO: Implement email sending with your email service
    // For now, just return success
    console.log(`Transcript requested for ${email}:`, messages);

    res.json({ success: true, message: "Transcript sent to email" });
  } catch (error) {
    console.error("Error sending transcript:", error);
    res.status(500).json({ error: "Failed to send transcript" });
  }
});

// Close a conversation
router.post("/:id/close", async (req, res) => {
  try {
    const db = await openDB();

    await db.run(
      `UPDATE conversations 
       SET status = 'closed', closedAt = CURRENT_TIMESTAMP 
       WHERE id = ?`,
      [req.params.id]
    );

    res.json({ success: true, message: "Conversation closed" });
  } catch (error) {
    console.error("Error closing conversation:", error);
    res.status(500).json({ error: "Failed to close conversation" });
  }
});

export default router;
