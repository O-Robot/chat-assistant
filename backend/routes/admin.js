// routes/admin.ts
import { Router } from "express";
import { openDB } from "../db.js";
import { authenticateAdmin } from "../middleware/adminAuth.js";

const router = Router();

router.use(authenticateAdmin);

// Get all users
router.get("/users", async (req, res) => {
  try {
    const db = await openDB();
    const users = await db.all("SELECT * FROM users ORDER BY createdAt DESC");
    res.json(users);
  } catch (error) {
    console.error("Error fetching users:", error);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// Update user info
router.put("/users/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { firstName, lastName, email, phone, country } = req.body;

    const db = await openDB();
    await db.run(
      `UPDATE users 
       SET firstName = ?, lastName = ?, email = ?, phone = ?, country = ? 
       WHERE id = ?`,
      [firstName, lastName, email, phone, country, id],
    );

    const updatedUser = await db.get("SELECT * FROM users WHERE id = ?", [id]);
    res.json(updatedUser);
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// Get conversations for a user
router.get("/conversations/:userId", async (req, res) => {
  try {
    const db = await openDB();
    const conversations = await db.all(
      "SELECT * FROM conversations WHERE userId = ? ORDER BY createdAt DESC",
      [req.params.userId],
    );

    const conversationsWithMessages = await Promise.all(
      conversations.map(async (conv) => {
        const messages = await db.all(
          `SELECT m.*, u.firstName, u.lastName, u.email 
           FROM messages m 
           LEFT JOIN users u ON m.senderId = u.id 
           WHERE m.conversationId = ? 
           ORDER BY m.timestamp ASC`,
          [conv.id],
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
                  ? { id: "admin", firstName: "Admin", lastName: "", email: "" }
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
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

router.post("/conversations/:id/export", async (req, res) => {
  try {
    const { id } = req.params;
    const { email } = req.body;

    const db = await openDB();

    // Get conversation details
    const conversation = await db.get(
      "SELECT c.*, u.firstName, u.lastName, u.email as userEmail FROM conversations c JOIN users u ON c.userId = u.id WHERE c.id = ?",
      [id],
    );

    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    // Get messages
    const messages = await db.all(
      `SELECT m.*, u.firstName, u.lastName 
       FROM messages m 
       LEFT JOIN users u ON m.senderId = u.id 
       WHERE m.conversationId = ? 
       ORDER BY m.timestamp ASC`,
      [id],
    );

    // Format conversation for email
    const formattedMessages = messages
      .map((msg) => {
        const senderName =
          msg.senderId === "system"
            ? "System"
            : msg.senderId === "admin"
              ? "Admin"
              : `${msg.firstName} ${msg.lastName}`;

        const time = new Date(msg.timestamp).toLocaleString();
        return `[${time}] ${senderName}: ${msg.content}`;
      })
      .join("\n\n");

    const emailContent = `
Conversation Export
==================

Visitor: ${conversation.firstName} ${conversation.lastName}
Email: ${conversation.userEmail}
Date: ${new Date(conversation.createdAt).toLocaleString()}
Status: ${conversation.status}

Messages:
---------

${formattedMessages}
    `;

    // Send email
    await sendEmail(
      email,
      `Conversation Export - ${conversation.firstName} ${conversation.lastName}`,
      emailContent,
    );

    res.json({ success: true, message: "Conversation exported to email" });
  } catch (error) {
    console.error("Error exporting conversation:", error);
    res.status(500).json({ error: "Failed to export conversation" });
  }
});

export default router;
