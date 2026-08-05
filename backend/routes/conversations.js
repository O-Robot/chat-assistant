import express from "express";
import { openDB } from "../db.js";
import { v4 as uuidv4 } from "uuid";
import { exportUserTranscript } from "../utils/email/email.js";
import { authenticateVisitor } from "../middleware/auth.js";
import { getMessagesPage } from "../services/conversationService.js";
import { recordAuditEvent } from "../utils/audit.js";
import { logger } from "../utils/logger.js";

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

    const page = await getMessagesPage(db, {
      conversationId: req.params.id,
      tenantId: req.principal.tenantId,
      before: req.query.before,
      limit: req.query.limit,
    });
    res.json(page);
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

    const conversationId = uuidv4();
    await db.exec("BEGIN IMMEDIATE");
    try {
      await db.run(
        `UPDATE conversations
         SET status = 'closed', closedAt = CURRENT_TIMESTAMP
         WHERE userId = ? AND tenantId = ? AND status IN ('open', 'transferred')`,
        [userId, tenantId],
      );
      await db.run("INSERT INTO conversations (id, userId, status, tenantId) VALUES (?, ?, 'open', ?)", [conversationId, userId, tenantId]);
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
    await recordAuditEvent(db, {
      tenantId,
      actorId: userId,
      actorRole: "visitor",
      action: "conversation.created",
      resourceType: "conversation",
      resourceId: conversationId,
    });
    logger.info("conversation_created", { tenantId, conversationId, userId });

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
    await recordAuditEvent(db, {
      tenantId: req.principal.tenantId,
      actorId: req.principal.id,
      actorRole: "visitor",
      action: "conversation.closed",
      resourceType: "conversation",
      resourceId: req.params.id,
    });
    logger.info("conversation_closed", { tenantId: req.principal.tenantId, conversationId: req.params.id, userId: req.principal.id });

    res.json({ success: true, message: "Conversation closed" });
  } catch (error) {
    console.error("Error closing conversation:", error);
    res.status(500).json({ error: "Failed to close conversation" });
  }
});

export default router;
