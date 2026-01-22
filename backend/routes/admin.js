import { Router } from "express";
import { openDB } from "../db.js";
import { authenticateAdmin } from "../middleware/adminAuth.js";
import { sendEmail, exportConversation } from "../utils/email/email.js";

const router = Router();

router.use(authenticateAdmin);

// Get all users
router.get("/users", async (req, res) => {
  try {
    const db = await openDB();
    const users = await db.all("SELECT * FROM users ORDER BY createdAt DESC");
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

    const existingUser = await db.get("SELECT id FROM users WHERE id = ?", [
      id,
    ]);

    if (!existingUser) {
      return res.status(404).json({ message: "User not found" });
    }

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

    const userExists = await db.get("SELECT id FROM users WHERE id = ?", [
      userId,
    ]);

    if (!userExists) {
      return res.status(404).json({ message: "User not found" });
    }

    const conversations = await db.all(
      `SELECT * FROM conversations 
       WHERE userId = ? 
       ORDER BY createdAt ASC`,
      [userId],
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

    await exportConversation(id, email, res);
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

    await exportConversation(id, email, res);
  } catch (error) {
    console.error("Error exporting conversation:", error);
    res.status(500).json({ error: "Failed to export conversation" });
  }
});

export default router;
