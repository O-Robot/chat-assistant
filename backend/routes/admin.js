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
              msg.senderId === "system"
                ? { id: "system", firstName: "System", lastName: "", email: "" }
                : msg.senderId === "admin"
                  ? {
                      id: "admin",
                      firstName: "Ogooluwani",
                      lastName: "",
                      email: "",
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

export default router;
