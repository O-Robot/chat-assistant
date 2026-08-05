import { Router } from "express";
import { openDB } from "../db.js";
import { authenticateAdmin } from "../middleware/adminAuth.js";
import { sendEmail, exportConversation } from "../utils/email/email.js";
import { recordAuditEvent } from "../utils/audit.js";
import { searchMessages } from "../services/messageSearchService.js";
import { randomUUID } from "crypto";
import { generateAssistantText } from "../controllers/aiController.js";

const router = Router();

router.use(authenticateAdmin);

async function getChatHistory(db, conversationId, tenantId) {
  const conversation = await db.get("SELECT c.*, u.firstName, u.lastName, u.email FROM conversations c JOIN users u ON u.id = c.userId WHERE c.id = ? AND c.tenantId = ?", [conversationId, tenantId]);
  if (!conversation) return null;
  const messages = await db.all("SELECT senderId, content, timestamp FROM messages WHERE conversationId = ? ORDER BY timestamp ASC LIMIT 50", [conversationId]);
  return { conversation, messages };
}

router.post("/chats/:id/ai-state", async (req, res) => {
  try {
    const aiState = req.body?.aiState;
    if (!['active', 'paused'].includes(aiState)) return res.status(400).json({ error: "Invalid AI state" });
    const db = await openDB();
    const result = await db.run("UPDATE conversations SET aiState = ? WHERE id = ? AND tenantId = ?", [aiState, req.params.id, req.admin.tenantId]);
    if (!result.changes) return res.status(404).json({ error: "Chat not found" });
    await recordAuditEvent(db, { tenantId: req.admin.tenantId, actorId: req.admin.id, actorRole: req.admin.role, action: `admin.ai.${aiState}`, resourceType: "conversation", resourceId: req.params.id });
    res.json({ aiState });
  } catch (error) { res.status(500).json({ error: "Failed to update AI state" }); }
});

router.post("/chats/:id/summary", async (req, res) => {
  try {
    const db = await openDB();
    const chat = await getChatHistory(db, req.params.id, req.admin.tenantId);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    const summary = await generateAssistantText({ instructions: "Summarise this visitor conversation for its owner in 3 concise bullet points: need, relevant context, and next action.", conversationHistory: chat.messages });
    await db.run("UPDATE conversations SET summary = ?, summaryUpdatedAt = CURRENT_TIMESTAMP WHERE id = ? AND tenantId = ?", [summary, req.params.id, req.admin.tenantId]);
    res.json({ summary });
  } catch (error) { res.status(502).json({ error: "Unable to generate summary" }); }
});

router.post("/ai/rewrite", async (req, res) => {
  try {
    const { draft, mode = 'professional', language = 'English' } = req.body || {};
    if (typeof draft !== 'string' || !draft.trim() || draft.length > 4000) return res.status(400).json({ error: "A draft of up to 4,000 characters is required" });
    const modes = { professional: 'professional and clear', friendly: 'warm and friendly', shorter: 'shorter while preserving meaning', longer: 'more detailed but concise', grammar: 'grammatically correct while preserving the original tone and meaning' };
    if (!modes[mode]) return res.status(400).json({ error: "Invalid rewrite mode" });
    const content = await generateAssistantText({ instructions: `Rewrite the following reply to be ${modes[mode]}. Translate it to ${language} when that is not English. Preserve facts and do not add commitments.\n\nDRAFT:\n${draft}`, conversationHistory: [] });
    res.json({ content });
  } catch (error) { res.status(502).json({ error: "Unable to rewrite draft" }); }
});

router.get("/saved-replies", async (req, res) => {
  const db = await openDB();
  const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  const rows = await db.all(`SELECT * FROM saved_replies WHERE tenantId = ? ${query ? 'AND (shortcut LIKE ? OR title LIKE ? OR content LIKE ?)' : ''} ORDER BY shortcut`, query ? [req.admin.tenantId, `%${query}%`, `%${query}%`, `%${query}%`] : [req.admin.tenantId]);
  res.json(rows);
});

router.post("/saved-replies", async (req, res) => {
  try {
    const { shortcut, title, content } = req.body || {};
    if (![shortcut, title, content].every((value) => typeof value === 'string' && value.trim()) || shortcut.length > 40 || content.length > 4000) return res.status(400).json({ error: "Shortcut, title and content are required" });
    const db = await openDB(); const reply = { id: randomUUID(), shortcut: shortcut.trim().replace(/^\/?/, '/'), title: title.trim(), content: content.trim() };
    await db.run("INSERT INTO saved_replies (id, tenantId, shortcut, title, content) VALUES (?, ?, ?, ?, ?)", [reply.id, req.admin.tenantId, reply.shortcut, reply.title, reply.content]);
    res.status(201).json(reply);
  } catch (error) { res.status(409).json({ error: "That shortcut already exists" }); }
});

router.put("/saved-replies/:id", async (req, res) => {
  const { shortcut, title, content } = req.body || {};
  if (![shortcut, title, content].every((value) => typeof value === 'string' && value.trim())) return res.status(400).json({ error: "Shortcut, title and content are required" });
  const db = await openDB();
  const result = await db.run("UPDATE saved_replies SET shortcut = ?, title = ?, content = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ? AND tenantId = ?", [shortcut.trim().replace(/^\/?/, '/'), title.trim(), content.trim(), req.params.id, req.admin.tenantId]);
  if (!result.changes) return res.status(404).json({ error: "Saved reply not found" });
  res.json({ id: req.params.id, shortcut: shortcut.trim().replace(/^\/?/, '/'), title: title.trim(), content: content.trim() });
});

router.delete("/saved-replies/:id", async (req, res) => {
  const db = await openDB();
  const result = await db.run("DELETE FROM saved_replies WHERE id = ? AND tenantId = ?", [req.params.id, req.admin.tenantId]);
  if (!result.changes) return res.status(404).json({ error: "Saved reply not found" });
  res.json({ success: true });
});

// Get all users
router.get("/users", async (req, res) => {
  try {
    const db = await openDB();
    const users = await db.all(
      `SELECT u.*,
         (SELECT c.id FROM conversations c WHERE c.userId = u.id AND c.tenantId = u.tenantId
          ORDER BY COALESCE(c.lastMessageAt, c.createdAt) DESC, c.id DESC LIMIT 1) AS latestConversationId,
         (SELECT c.status FROM conversations c WHERE c.userId = u.id AND c.tenantId = u.tenantId
          ORDER BY COALESCE(c.lastMessageAt, c.createdAt) DESC, c.id DESC LIMIT 1) AS latestConversationStatus,
         COALESCE((SELECT c.isPinned FROM conversations c WHERE c.userId = u.id AND c.tenantId = u.tenantId
          ORDER BY COALESCE(c.lastMessageAt, c.createdAt) DESC, c.id DESC LIMIT 1), 0) AS isPinned,
         COALESCE((SELECT c.isStarred FROM conversations c WHERE c.userId = u.id AND c.tenantId = u.tenantId
          ORDER BY COALESCE(c.lastMessageAt, c.createdAt) DESC, c.id DESC LIMIT 1), 0) AS isStarred,
         (SELECT c.snoozedUntil FROM conversations c WHERE c.userId = u.id AND c.tenantId = u.tenantId
          ORDER BY COALESCE(c.lastMessageAt, c.createdAt) DESC, c.id DESC LIMIT 1) AS snoozedUntil
         ,(SELECT c.lastMessageAt FROM conversations c WHERE c.userId = u.id AND c.tenantId = u.tenantId
          ORDER BY COALESCE(c.lastMessageAt, c.createdAt) DESC, c.id DESC LIMIT 1) AS lastMessageAt
       FROM users u WHERE u.tenantId = ?
       ORDER BY isPinned DESC, isStarred DESC, u.createdAt DESC`,
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
          // A human-owned conversation must never hydrate as AI-active, even
          // when it predates the durable aiState column.
          aiState: conv.status === "transferred" ? "paused" : conv.aiState || "active",
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

router.patch("/chats/:id/inbox", async (req, res) => {
  try {
    const { id } = req.params;
    const { isPinned, isStarred, snoozedUntil, status } = req.body || {};
    if (status !== undefined && status !== "open") {
      return res.status(400).json({ error: "Invalid inbox status" });
    }
    if (snoozedUntil !== undefined && snoozedUntil !== null && Number.isNaN(Date.parse(snoozedUntil))) {
      return res.status(400).json({ error: "Invalid snooze time" });
    }

    const db = await openDB();
    const conversation = await db.get(
      "SELECT * FROM conversations WHERE id = ? AND tenantId = ?",
      [id, req.admin.tenantId],
    );
    if (!conversation) return res.status(404).json({ error: "Chat not found" });
    if (status === "open") {
      const existingOpen = await db.get(
        "SELECT id FROM conversations WHERE tenantId = ? AND userId = ? AND status = 'open' AND id != ?",
        [req.admin.tenantId, conversation.userId, id],
      );
      if (existingOpen) return res.status(409).json({ error: "This visitor already has an active chat" });
    }

    const next = {
      isPinned: isPinned === undefined ? conversation.isPinned : Number(Boolean(isPinned)),
      isStarred: isStarred === undefined ? conversation.isStarred : Number(Boolean(isStarred)),
      snoozedUntil: snoozedUntil === undefined ? conversation.snoozedUntil : snoozedUntil,
      status: status === undefined ? conversation.status : status,
    };
    await db.run(
      `UPDATE conversations SET isPinned = ?, isStarred = ?, snoozedUntil = ?, status = ?
       WHERE id = ? AND tenantId = ?`,
      [next.isPinned, next.isStarred, next.snoozedUntil, next.status, id, req.admin.tenantId],
    );
    const updated = await db.get("SELECT * FROM conversations WHERE id = ? AND tenantId = ?", [id, req.admin.tenantId]);
    await recordAuditEvent(db, {
      tenantId: req.admin.tenantId, actorId: req.admin.id, actorRole: req.admin.role,
      action: "admin.chat.inbox_updated", resourceType: "conversation", resourceId: id,
      metadata: { isPinned: updated.isPinned, isStarred: updated.isStarred, status: updated.status },
    });
    res.json(updated);
  } catch (error) {
    console.error("Error updating inbox state:", error);
    res.status(500).json({ error: "Failed to update inbox state" });
  }
});

router.post("/chats/bulk", async (req, res) => {
  try {
    const { conversationIds, action } = req.body || {};
    if (!Array.isArray(conversationIds) || !conversationIds.length || conversationIds.length > 100) {
      return res.status(400).json({ error: "Select between 1 and 100 chats" });
    }
    const updates = {
      pin: "isPinned = 1", unpin: "isPinned = 0", star: "isStarred = 1", unstar: "isStarred = 0",
      reopen: "status = 'open'",
    };
    if (!updates[action]) return res.status(400).json({ error: "Invalid bulk action" });
    const db = await openDB();
    const placeholders = conversationIds.map(() => "?").join(", ");
    if (action === "reopen") {
      const conflicts = await db.get(
        `SELECT COUNT(*) AS count FROM conversations c
         WHERE c.id IN (${placeholders}) AND c.tenantId = ? AND EXISTS (
           SELECT 1 FROM conversations open_chat
           WHERE open_chat.tenantId = c.tenantId AND open_chat.userId = c.userId
             AND open_chat.status = 'open' AND open_chat.id != c.id
         )`,
        [...conversationIds, req.admin.tenantId],
      );
      if (conflicts.count) return res.status(409).json({ error: "Some visitors already have an active chat" });
    }
    const result = await db.run(
      `UPDATE conversations SET ${updates[action]} WHERE id IN (${placeholders}) AND tenantId = ?`,
      [...conversationIds, req.admin.tenantId],
    );
    await recordAuditEvent(db, {
      tenantId: req.admin.tenantId, actorId: req.admin.id, actorRole: req.admin.role,
      action: "admin.chat.bulk_updated", resourceType: "conversation", metadata: { action, count: result.changes },
    });
    res.json({ success: true, updated: result.changes });
  } catch (error) {
    console.error("Error applying bulk inbox action:", error);
    res.status(500).json({ error: "Failed to update chats" });
  }
});

router.get("/search", async (req, res) => {
  try {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!query) return res.json({ users: [], messages: [] });
    const db = await openDB();
    const users = await db.all(
      `SELECT id, firstName, lastName, email, country FROM users
       WHERE tenantId = ? AND (firstName LIKE ? OR lastName LIKE ? OR email LIKE ?)
       ORDER BY createdAt DESC LIMIT 12`,
      [req.admin.tenantId, `%${query}%`, `%${query}%`, `%${query}%`],
    );
    const messages = await searchMessages(db, { tenantId: req.admin.tenantId, query, limit: 20 });
    res.json({ users, messages });
  } catch (error) {
    console.error("Error searching inbox:", error);
    res.status(500).json({ error: "Failed to search inbox" });
  }
});

router.get("/chats/:id/context", async (req, res) => {
  try {
    const db = await openDB();
    const conversation = await db.get("SELECT id FROM conversations WHERE id = ? AND tenantId = ?", [req.params.id, req.admin.tenantId]);
    if (!conversation) return res.status(404).json({ error: "Chat not found" });
    const [tags, notes, statistics] = await Promise.all([
      db.all("SELECT tag FROM conversation_tags WHERE conversationId = ? AND tenantId = ? ORDER BY tag", [conversation.id, req.admin.tenantId]),
      db.all("SELECT id, content, createdAt FROM conversation_notes WHERE conversationId = ? AND tenantId = ? ORDER BY createdAt DESC LIMIT 20", [conversation.id, req.admin.tenantId]),
      db.get("SELECT COUNT(*) AS messageCount, MIN(timestamp) AS firstMessageAt, MAX(timestamp) AS lastMessageAt FROM messages WHERE conversationId = ?", [conversation.id]),
    ]);
    res.json({ tags: tags.map((row) => row.tag), notes, statistics });
  } catch (error) {
    console.error("Error loading chat context:", error);
    res.status(500).json({ error: "Failed to load chat context" });
  }
});

router.put("/chats/:id/tags", async (req, res) => {
  try {
    const tags = Array.isArray(req.body?.tags) ? [...new Set(req.body.tags.map((tag) => String(tag).trim().toLowerCase()).filter((tag) => tag && tag.length <= 32))].slice(0, 20) : null;
    if (!tags) return res.status(400).json({ error: "Tags must be an array" });
    const db = await openDB();
    const chat = await db.get("SELECT id FROM conversations WHERE id = ? AND tenantId = ?", [req.params.id, req.admin.tenantId]);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    await db.exec("BEGIN IMMEDIATE");
    try {
      await db.run("DELETE FROM conversation_tags WHERE conversationId = ? AND tenantId = ?", [chat.id, req.admin.tenantId]);
      for (const tag of tags) await db.run("INSERT INTO conversation_tags (conversationId, tenantId, tag) VALUES (?, ?, ?)", [chat.id, req.admin.tenantId, tag]);
      await db.exec("COMMIT");
    } catch (error) { await db.exec("ROLLBACK"); throw error; }
    res.json({ tags });
  } catch (error) {
    console.error("Error updating chat tags:", error);
    res.status(500).json({ error: "Failed to update chat tags" });
  }
});

router.post("/chats/:id/notes", async (req, res) => {
  try {
    const content = typeof req.body?.content === "string" ? req.body.content.trim() : "";
    if (!content || content.length > 2000) return res.status(400).json({ error: "A note of up to 2,000 characters is required" });
    const db = await openDB();
    const chat = await db.get("SELECT id FROM conversations WHERE id = ? AND tenantId = ?", [req.params.id, req.admin.tenantId]);
    if (!chat) return res.status(404).json({ error: "Chat not found" });
    const note = { id: randomUUID(), conversationId: chat.id, tenantId: req.admin.tenantId, authorId: req.admin.id, content };
    await db.run("INSERT INTO conversation_notes (id, conversationId, tenantId, authorId, content) VALUES (?, ?, ?, ?, ?)", [note.id, note.conversationId, note.tenantId, note.authorId, note.content]);
    await recordAuditEvent(db, { tenantId: req.admin.tenantId, actorId: req.admin.id, actorRole: req.admin.role, action: "admin.chat.note_added", resourceType: "conversation", resourceId: chat.id });
    res.status(201).json({ ...note, createdAt: new Date().toISOString() });
  } catch (error) {
    console.error("Error adding chat note:", error);
    res.status(500).json({ error: "Failed to add chat note" });
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
