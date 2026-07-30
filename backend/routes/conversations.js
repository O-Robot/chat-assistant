import express from "express";
import { openDB } from "../db.js";
import { v4 as uuidv4 } from "uuid";
import { exportUserTranscript } from "../utils/email/email.js";
import { authenticateVisitor } from "../middleware/auth.js";

const router = express.Router();

// Get messages for a conversation
router.get("/:id/messages", authenticateVisitor, async (req, res) => {
  try {
    const db = await openDB();
    const conversation = await db.get(
      "SELECT id FROM conversations WHERE id = ? AND userId = ? AND tenantId = ?",
      [req.params.id, req.principal.id, req.principal.tenantId],
    );
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

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
      JOIN conversations c ON c.id = m.conversationId
      WHERE m.conversationId = ? AND c.userId = ? AND c.tenantId = ?
      ORDER BY m.timestamp ASC`,
      [req.params.id, req.principal.id, req.principal.tenantId],
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
router.get("/:id", authenticateVisitor, async (req, res) => {
  try {
    const db = await openDB();

    const conversation = await db.get(
      `SELECT * FROM conversations WHERE id = ? AND userId = ? AND tenantId = ?`,
      [req.params.id, req.principal.id, req.principal.tenantId],
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
router.post("/new", authenticateVisitor, async (req, res) => {
  try {
    const db = await openDB();
    const { id: userId, tenantId } = req.principal;

    // Close any existing open conversations
    await db.run(
      `UPDATE conversations 
       SET status = 'closed', closedAt = CURRENT_TIMESTAMP 
       WHERE userId = ? AND tenantId = ? AND status = 'open'`,
      [userId, tenantId],
    );

    // Create new conversation
    const conversationId = uuidv4();
    await db.run("INSERT INTO conversations (id, userId, status, tenantId) VALUES (?, ?, 'open', ?)", [conversationId, userId, tenantId]);

    res.json({ conversationId });
  } catch (error) {
    console.error("Error creating conversation:", error);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// Send transcript
router.post("/:id/send-transcript", authenticateVisitor, async (req, res) => {
  try {
    const { email } = req.body;
    const conversationId = req.params.id;

    const db = await openDB();

    // Get messages
    const convo = await db.get(
      `SELECT c.id, c.userId, c.status, c.createdAt, 
              u.firstName, u.lastName, u.email AS userEmail, u.phone, u.country
       FROM conversations c
       JOIN users u ON c.userId = u.id
       WHERE c.id = ? AND c.userId = ? AND c.tenantId = ?`,
      [conversationId, req.principal.id, req.principal.tenantId],
    );

    if (!convo)
      return res.status(404).json({ error: "Conversation not found" });

    if (email && email.trim().toLowerCase() !== convo.userEmail.trim().toLowerCase()) {
      return res.status(403).json({ error: "Transcript recipient must match your verified email" });
    }

    const messages = await db.all(
      `SELECT m.*, u.firstName, u.lastName
       FROM messages m
       LEFT JOIN users u ON m.senderId = u.id
       WHERE m.conversationId = ?
       ORDER BY m.timestamp ASC`,
      [conversationId],
    );

    convo.messages = messages;

    await exportUserTranscript([convo], email, res);
  } catch (error) {
    console.error("Error sending transcript:", error);
    res.status(500).json({ error: "Failed to send transcript" });
  }
});

// Close a conversation
router.post("/:id/close", authenticateVisitor, async (req, res) => {
  try {
    const db = await openDB();

    const result = await db.run(
      `UPDATE conversations 
       SET status = 'closed', closedAt = CURRENT_TIMESTAMP 
       WHERE id = ? AND userId = ? AND tenantId = ?`,
      [req.params.id, req.principal.id, req.principal.tenantId],
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json({ success: true, message: "Conversation closed" });
  } catch (error) {
    console.error("Error closing conversation:", error);
    res.status(500).json({ error: "Failed to close conversation" });
  }
});

export default router;
