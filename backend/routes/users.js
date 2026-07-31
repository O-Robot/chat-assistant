import express from "express";
import { v4 as uuidv4 } from "uuid";
import { openDB } from "../db.js";
import {
  authenticateVisitor,
  getDefaultTenantId,
  setVisitorSession,
  signVisitorSession,
} from "../middleware/auth.js";
import { recordAuditEvent } from "../utils/audit.js";

const router = express.Router();

router.get("/:id", authenticateVisitor, async (req, res) => {
  try {
    const db = await openDB();

    const { id } = req.params;
    if (req.principal.id !== id) {
      return res.status(403).json({ message: "Forbidden" });
    }
    if (!id) {
      return res.status(400).json({ message: "User id is required" });
    }

    const user = await db.get(
      "SELECT * FROM users WHERE id = ? AND tenantId = ?",
      [id, req.principal.tenantId],
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const conversation = await db.get(
      `SELECT * FROM conversations
       WHERE userId = ? AND tenantId = ? AND status = 'open'
       ORDER BY createdAt DESC
       LIMIT 1`,
      [user.id, req.principal.tenantId],
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
    const tenantId = getDefaultTenantId();
    let user;
    const conversationId = uuidv4();

    await db.exec("BEGIN IMMEDIATE");
    try {
      user = await db.get(
        "SELECT * FROM users WHERE email = ? AND tenantId = ?",
        [email, tenantId],
      );

      if (!user) {
        const userId = uuidv4();
        await db.run(
          `INSERT INTO users (id, firstName, lastName, email, phone, country, tenantId)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [userId, firstName, lastName, email, phone, country, tenantId],
        );
        user = await db.get("SELECT * FROM users WHERE id = ? AND tenantId = ?", [userId, tenantId]);
      }

      if (!user) throw new Error("Failed to create or fetch user");

      await db.run(
        `UPDATE conversations
         SET status = 'closed', closedAt = CURRENT_TIMESTAMP
         WHERE userId = ? AND tenantId = ? AND status = 'open'`,
        [user.id, tenantId],
      );
      await db.run(
        `INSERT INTO conversations (id, userId, status, tenantId)
         VALUES (?, ?, 'open', ?)`,
        [conversationId, user.id, tenantId],
      );
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }

    setVisitorSession(res, signVisitorSession(user));
    await recordAuditEvent(db, {
      tenantId,
      actorId: user.id,
      actorRole: "visitor",
      action: "visitor.session.created",
      resourceType: "conversation",
      resourceId: conversationId,
    });

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
