import { Router } from "express";
import { openDB } from "../db.js";
import { authenticateAdmin } from "../middleware/adminAuth.js";
import { sendEmail, exportConversation } from "../utils/email/email.js";
import { recordAuditEvent } from "../utils/audit.js";

const router = Router();

router.use(authenticateAdmin);

// Get all users
router.get("/users", async (req, res) => {
  try {
    const db = await openDB();
    const users = await db.all(
      "SELECT * FROM users WHERE tenantId = ? ORDER BY createdAt DESC",
      [req.admin.tenantId],
    );
    res.json(users || []);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: error || "Failed to fetch users" });
  }
});

// Update user info
router.put("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, phone, country } = req.body;

    const db = await openDB();

    if (!id) {
      return res.status(400).json({ message: "User id is required" });
    }

    if (
      !firstName?.trim() ||
      !lastName?.trim() ||
      !email?.trim() ||
      !phone?.trim() ||
      !country?.trim()
    ) {
      return res.status(400).json({ message: "All fields are required" });
    }

    const existingUser = await db.get(
      "SELECT id FROM users WHERE id = ? AND tenantId = ?",
      [id, req.admin.tenantId],
    );

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

    await db.run(
      `UPDATE users 
       SET firstName = ?, lastName = ?, email = ?, phone = ?, country = ? 
       WHERE id = ? AND tenantId = ?`,
      [firstName, lastName, email, phone, country, id, req.admin.tenantId],
    );

    const updatedUser = await db.get("SELECT * FROM users WHERE id = ? AND tenantId = ?", [id, req.admin.tenantId]);
    await recordAuditEvent(db, {
      tenantId: req.admin.tenantId,
      actorId: req.admin.id,
      actorRole: req.admin.role,
      action: "admin.user.updated",
      resourceType: "user",
      resourceId: id,
    });
    res.json(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: error || "Failed to update user" });
  }
});

// Get conversations for a user
router.get("/conversations/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({ message: "User id is required" });
    }

    const db = await openDB();

    const userExists = await db.get(
      "SELECT id FROM users WHERE id = ? AND tenantId = ?",
      [userId, req.admin.tenantId],
    );

    if (!userExists) {
      return res.status(404).json({ message: "User not found" });
    }

    const conversations = await db.all(
      `SELECT * FROM conversations 
       WHERE userId = ? AND tenantId = ?
       ORDER BY COALESCE(lastMessageAt, createdAt) ASC, id ASC`,
      [userId, req.admin.tenantId],
    );

    if (!conversations || conversations.length === 0) {
      return res.json([]);
    }

    const conversationsWithMessages = await Promise.all(
      conversations.map(async (conv) => {
        const messages = await db.all(
          `SELECT m.*, u.firstName, u.lastName, u.email 
           FROM messages m 
           LEFT JOIN users u ON m.senderId = u.id 
           JOIN conversations c ON c.id = m.conversationId
           WHERE m.conversationId = ? AND c.tenantId = ?
           ORDER BY m.timestamp ASC`,
          [conv.id, req.admin.tenantId],
        );

        return {
          ...conv,
          messages: messages.map((msg) => ({
            ...msg,
            timestamp: new Date(msg.timestamp).getTime(),
            sender:
              msg.senderId === "ai"
                ? { id: "ai", firstName: "Robot", lastName: "", email: "", role: "ai" }
                : msg.senderId === "system"
                ? { id: "system", firstName: "System", lastName: "", email: "" }
                : msg.senderId === "admin"
                  ? {
                      id: "admin",
                      firstName: "Ogooluwani",
                      lastName: "",
                      email: "",
                      role: "admin",
                    }
                  : {
                      id: msg.senderId,
                      firstName: msg.firstName,
                      lastName: msg.lastName,
                      email: msg.email,
                    },
          })),
        };
      }),
    );

    res.json(conversationsWithMessages);
  } catch (error) {
    console.error("Error fetching conversations:", error);
    res.status(500).json({ error: error || "Failed to fetch conversations" });
  }
});

async function deleteConversationData(db, conversationIds, tenantId) {
  for (const conversationId of conversationIds) {
    await db.run("DELETE FROM conversation_reads WHERE conversationId = ? AND tenantId = ?", [conversationId, tenantId]);
    await db.run("DELETE FROM attachments WHERE conversationId = ? AND tenantId = ?", [conversationId, tenantId]);
    await db.run("DELETE FROM messages WHERE conversationId = ?", [conversationId]);
  }
}

router.delete("/chats/:id", async (req, res) => {
  try {
    const db = await openDB();
    const chat = await db.get(
      "SELECT id, status FROM conversations WHERE id = ? AND tenantId = ?",
      [req.params.id, req.admin.tenantId],
    );
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (chat.status !== "closed") {
      return res.status(409).json({ error: "End the chat before deleting it" });
    }
    await db.exec("BEGIN IMMEDIATE");
    try {
      await deleteConversationData(db, [chat.id], req.admin.tenantId);
      await db.run("DELETE FROM conversations WHERE id = ? AND tenantId = ?", [chat.id, req.admin.tenantId]);
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
    await recordAuditEvent(db, { tenantId: req.admin.tenantId, actorId: req.admin.id, actorRole: req.admin.role, action: "admin.chat.deleted", resourceType: "conversation", resourceId: chat.id });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting chat:", error);
    res.status(500).json({ error: "Failed to delete chat" });
  }
});

router.delete("/users/:userId/conversations", async (req, res) => {
  try {
    const db = await openDB();
    const conversations = await db.all("SELECT id, status FROM conversations WHERE userId = ? AND tenantId = ?", [req.params.userId, req.admin.tenantId]);
    if (!conversations.length) return res.status(404).json({ error: "No conversations found" });
    if (conversations.some((conversation) => conversation.status !== "closed")) {
      return res.status(409).json({ error: "End every active chat before deleting conversation history" });
    }
    await db.exec("BEGIN IMMEDIATE");
    try {
      await deleteConversationData(db, conversations.map((conversation) => conversation.id), req.admin.tenantId);
      await db.run("DELETE FROM conversations WHERE userId = ? AND tenantId = ?", [req.params.userId, req.admin.tenantId]);
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
    await recordAuditEvent(db, { tenantId: req.admin.tenantId, actorId: req.admin.id, actorRole: req.admin.role, action: "admin.user.conversations.deleted", resourceType: "user", resourceId: req.params.userId, metadata: { conversationCount: conversations.length } });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting conversations:", error);
    res.status(500).json({ error: "Failed to delete conversations" });
  }
});

router.delete("/users/:userId", async (req, res) => {
  try {
    const db = await openDB();
    const user = await db.get("SELECT id FROM users WHERE id = ? AND tenantId = ?", [req.params.userId, req.admin.tenantId]);
    if (!user) return res.status(404).json({ error: "Visitor not found" });
    const conversations = await db.all("SELECT id, status FROM conversations WHERE userId = ? AND tenantId = ?", [user.id, req.admin.tenantId]);
    if (conversations.some((conversation) => conversation.status !== "closed")) {
      return res.status(409).json({ error: "End every active chat before deleting the visitor" });
    }
    await db.exec("BEGIN IMMEDIATE");
    try {
      await deleteConversationData(db, conversations.map((conversation) => conversation.id), req.admin.tenantId);
      await db.run("DELETE FROM conversations WHERE userId = ? AND tenantId = ?", [user.id, req.admin.tenantId]);
      await db.run("DELETE FROM users WHERE id = ? AND tenantId = ?", [user.id, req.admin.tenantId]);
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
    await recordAuditEvent(db, { tenantId: req.admin.tenantId, actorId: req.admin.id, actorRole: req.admin.role, action: "admin.user.deleted", resourceType: "user", resourceId: user.id });
    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting visitor:", error);
    res.status(500).json({ error: "Failed to delete visitor" });
  }
});

router.post("/conversations/:id/export", async (req, res) => {
  try {
    const { id } = req.params;
    const email = process.env.ADMIN_EMAIL;

    if (!email) {
      return res.status(400).json({ error: "ADMIN_EMAIL not set" });
    }

    const db = await openDB();
    const conversation = await db.get("SELECT id FROM conversations WHERE id = ? AND tenantId = ?", [id, req.admin.tenantId]);
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });
    await recordAuditEvent(db, {
      tenantId: req.admin.tenantId,
      actorId: req.admin.id,
      actorRole: req.admin.role,
      action: "admin.conversation.exported",
      resourceType: "conversation",
      resourceId: id,
    });
    await exportConversation(id, email, res, req.admin.tenantId);
  } catch (error) {
    console.error("Error exporting conversation:", error);
    res.status(500).json({ error: "Failed to export conversation" });
  }
});

router.post("/conversations/:id/export/:email", async (req, res) => {
  try {
    const { id, email } = req.params;

    if (!email) {
      return res.status(400).json({ error: "No email provided" });
    }

    const db = await openDB();
    const conversation = await db.get("SELECT id FROM conversations WHERE id = ? AND tenantId = ?", [id, req.admin.tenantId]);
    if (!conversation) return res.status(404).json({ error: "Conversation not found" });
    await recordAuditEvent(db, {
      tenantId: req.admin.tenantId,
      actorId: req.admin.id,
      actorRole: req.admin.role,
      action: "admin.conversation.exported",
      resourceType: "conversation",
      resourceId: id,
    });
    await exportConversation(id, email, res, req.admin.tenantId);
  } catch (error) {
    console.error("Error exporting conversation:", error);
    res.status(500).json({ error: "Failed to export conversation" });
  }
});

router.post("/chats/:id/export", async (req, res) => {
  try {
    const { id } = req.params;
    if (!process.env.ADMIN_EMAIL) {
      return res.status(400).json({ error: "ADMIN_EMAIL not set" });
    }
    const db = await openDB();
    const chat = await db.get(
      "SELECT id FROM conversations WHERE id = ? AND tenantId = ?",
      [id, req.admin.tenantId],
    );
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    await recordAuditEvent(db, {
      tenantId: req.admin.tenantId,
      actorId: req.admin.id,
      actorRole: req.admin.role,
      action: "admin.chat.exported",
      resourceType: "conversation",
      resourceId: id,
    });
    await exportConversation(id, process.env.ADMIN_EMAIL, res, req.admin.tenantId, "conversation");
  } catch (error) {
    console.error("Error exporting chat:", error);
    res.status(500).json({ error: "Failed to export chat" });
  }
});

router.post("/chats/:id/export/:email", async (req, res) => {
  try {
    const { id, email } = req.params;
    const db = await openDB();
    const chat = await db.get(
      `SELECT c.id, u.email AS visitorEmail
       FROM conversations c JOIN users u ON u.id = c.userId
       WHERE c.id = ? AND c.tenantId = ?`,
      [id, req.admin.tenantId],
    );
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    if (email.toLowerCase() !== chat.visitorEmail.toLowerCase()) {
      return res.status(400).json({ error: "Transcript recipient must match the visitor email" });
    }
    await recordAuditEvent(db, {
      tenantId: req.admin.tenantId,
      actorId: req.admin.id,
      actorRole: req.admin.role,
      action: "admin.chat.transcript_sent",
      resourceType: "conversation",
      resourceId: id,
    });
    await exportConversation(id, email, res, req.admin.tenantId, "conversation");
  } catch (error) {
    console.error("Error sending chat transcript:", error);
    res.status(500).json({ error: "Failed to send chat transcript" });
  }
});

router.post("/users/:userId/export", async (req, res) => {
  try {
    const { userId } = req.params;
    if (!process.env.ADMIN_EMAIL) {
      return res.status(400).json({ error: "ADMIN_EMAIL not set" });
    }
    const db = await openDB();
    const user = await db.get(
      "SELECT id FROM users WHERE id = ? AND tenantId = ?",
      [userId, req.admin.tenantId],
    );
    if (!user) return res.status(404).json({ error: "Visitor not found" });

    await recordAuditEvent(db, {
      tenantId: req.admin.tenantId,
      actorId: req.admin.id,
      actorRole: req.admin.role,
      action: "admin.user.conversations.exported",
      resourceType: "user",
      resourceId: userId,
    });
    await exportConversation(
      userId,
      process.env.ADMIN_EMAIL,
      res,
      req.admin.tenantId,
      "user",
    );
  } catch (error) {
    console.error("Error exporting user conversations:", error);
    res.status(500).json({ error: "Failed to export conversations" });
  }
});

export default router;
