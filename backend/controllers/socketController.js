import { openDB } from "../db.js";
import {
  sendWelcomeMessage,
  sendConversationClosedMessage,
  sendSystemMessage,
} from "../utils/systemMessages.js";
import { handleAIResponse } from "../controllers/aiController.js";
import { notifyAdminNewChat } from "../utils/email/email.js";
import { sanitizeHTML } from "../utils/sanitize.js";
import { getMessagesPage } from "../services/conversationService.js";
import { recordAuditEvent } from "../utils/audit.js";
import { logger } from "../utils/logger.js";

const onlineUsers = new Map();
const userSockets = new Map();
const conversationAdminStatus = new Map();
const pendingTransferRequests = new Map();
const typingTimeouts = new Map();
const TYPING_TIMEOUT_MS = 5000;

function presenceKey(principal) {
  return `${principal.tenantId}:${principal.id}`;
}

function getOnlineUserIds(tenantId) {
  return Array.from(onlineUsers.entries())
    .filter(([key, socketIds]) => key.startsWith(`${tenantId}:`) && socketIds.size > 0)
    .map(([key]) => key.slice(tenantId.length + 1));
}

function clearTyping(io, conversationId, userId) {
  const key = `${conversationId}:${userId}`;
  const timeout = typingTimeouts.get(key);
  if (timeout) clearTimeout(timeout);
  typingTimeouts.delete(key);
  io.to(`conversation-${conversationId}`).emit("user_stopped_typing", {
    id: userId,
    conversationId,
  });
}

export function handleSocketConnection(io, socket) {
  logger.info("socket_handler_started", { socketId: socket.id, tenantId: socket.data.principal.tenantId });
  const principal = socket.data.principal;
  const tenantRoom = `tenant-${principal.tenantId}`;
  socket.join(tenantRoom);

  // User joins
  socket.on("user_join", async (acknowledge) => {
    try {
      const db = await openDB();
      const role = principal.role;
      let userData = { ...principal, socketId: socket.id };

      if (role === "visitor") {
        const user = await db.get(
          "SELECT id, firstName, lastName, email FROM users WHERE id = ? AND tenantId = ?",
          [principal.id, principal.tenantId],
        );
        if (!user) return socket.disconnect(true);
        userData = { ...userData, ...user };
      }

      userSockets.set(socket.id, userData);
      const key = presenceKey(principal);
      const sockets = onlineUsers.get(key) || new Set();
      const wasOffline = sockets.size === 0;
      sockets.add(socket.id);
      onlineUsers.set(key, sockets);
      socket.join(`user-${principal.tenantId}-${principal.id}`);

      if (role === "visitor") {
        await db.run(
          `UPDATE conversations 
           SET status = 'closed', closedAt = CURRENT_TIMESTAMP 
           WHERE userId = ? AND tenantId = ? AND status = 'open' AND id NOT IN (
             SELECT id FROM conversations 
             WHERE userId = ? AND tenantId = ? AND status = 'open'
             ORDER BY createdAt DESC LIMIT 1
           )`,
          [principal.id, principal.tenantId, principal.id, principal.tenantId],
        );

        const conversation = await db.get(
          "SELECT * FROM conversations WHERE userId = ? AND tenantId = ? AND status = 'open' ORDER BY createdAt DESC LIMIT 1",
          [principal.id, principal.tenantId],
        );

        if (conversation) {
          for (const room of socket.rooms) {
            if (room.startsWith("conversation-")) socket.leave(room);
          }
          socket.join(`conversation-${conversation.id}`);

          const messageCount = await db.get(
            "SELECT COUNT(*) as count FROM messages WHERE conversationId = ?",
            [conversation.id],
          );

          if (
            messageCount.count === 0 &&
            !conversationAdminStatus.get(conversation.id)
          ) {
            await sendWelcomeMessage(io, conversation.id, userData.firstName);
          }
        }
      }

      if (role === "admin") {
        const conversations = await db.all(
          "SELECT * FROM conversations WHERE tenantId = ? AND status = 'open'",
          [principal.tenantId],
        );

        conversations.forEach((conv) => {
          socket.join(`conversation-${conv.id}`);
        });
      }

      if (wasOffline) io.to(tenantRoom).emit("user_online", principal.id);

      if (role === "admin") {
        io.to(tenantRoom).emit("user_online", "admin");
      }

      io.to(tenantRoom).emit("user_online", "system");

      const onlineUserIds = getOnlineUserIds(principal.tenantId);
      socket.emit("users_online", onlineUserIds);

      io.to(tenantRoom).emit("users_online", onlineUserIds);
      await recordAuditEvent(db, {
        tenantId: principal.tenantId,
        actorId: principal.id,
        actorRole: principal.role,
        action: "socket.joined",
        resourceType: "socket",
        resourceId: socket.id,
      });
      acknowledge?.({ ok: true, onlineUserIds });
    } catch (error) {
      logger.error("socket_join_error", { socketId: socket.id, tenantId: principal.tenantId, errorName: error.name, errorMessage: error.message });
      acknowledge?.({ ok: false, error: "Unable to join chat" });
    }
  });

  // Send message
  socket.on("send_message", async (message, acknowledge) => {
    try {
      const { id, conversationId, content } = message || {};

      if (!id || !conversationId || typeof content !== "string") {
        acknowledge?.({ ok: false, error: "Invalid message" });
        return;
      }

      const sanitizedContent = sanitizeHTML(content);

      if (!sanitizedContent) {
        acknowledge?.({ ok: false, error: "Message is empty" });
        return;
      }

      const db = await openDB();

      const conversation = await db.get(
        "SELECT status, userId, tenantId FROM conversations WHERE id = ? AND tenantId = ?",
        [conversationId, principal.tenantId],
      );

      if (!conversation || conversation.status === "closed" || (principal.role === "visitor" && conversation.userId !== principal.id)) {
        acknowledge?.({ ok: false, error: "Conversation is unavailable" });
        return;
      }

      const senderId = principal.role === "admin" ? "admin" : principal.id;

      // Check if admin is handling
      const isAdminHandled = conversationAdminStatus.get(conversationId);

      // Save message
      const timestamp = new Date().toISOString();
      try {
        await db.run(
          "INSERT INTO messages (id, conversationId, senderId, content, timestamp) VALUES (?, ?, ?, ?, ?)",
          [id, conversationId, senderId, sanitizedContent, timestamp],
        );
        await db.run(
          `UPDATE conversations
           SET lastMessageAt = ?
           WHERE id = ? AND tenantId = ?
             AND (lastMessageAt IS NULL OR julianday(?) >= julianday(lastMessageAt))`,
          [timestamp, conversationId, principal.tenantId, timestamp],
        );
      } catch (error) {
        if (error.code !== "SQLITE_CONSTRAINT") throw error;
        const existing = await db.get(
          "SELECT id, conversationId, senderId, content, timestamp FROM messages WHERE id = ? AND conversationId = ?",
          [id, conversationId],
        );
        if (!existing) throw error;
        acknowledge?.({ ok: true, message: { ...existing, timestamp: new Date(existing.timestamp).getTime() } });
        return;
      }

      logger.info("message_persisted", { tenantId: principal.tenantId, conversationId, messageId: id, senderId });
      await recordAuditEvent(db, {
        tenantId: principal.tenantId,
        actorId: principal.id,
        actorRole: principal.role,
        action: "message.sent",
        resourceType: "message",
        resourceId: id,
        metadata: { conversationId },
      });

      // Get sender info
      let sender = null;
      if (senderId === "system") {
        sender = {
          id: "system",
          firstName: "Robot",
          lastName: "",
          email: "robot@ogooluwaniadewale.com",
        };
      } else if (senderId === "admin") {
        sender = {
          id: "admin",
          firstName: "Ogooluwani",
          lastName: "",
          email: "hey@ogooluwaniadewale.com",
        };
      } else {
        sender = await db.get("SELECT * FROM users WHERE id = ?", [senderId]);
      }

      const messageWithSender = {
        id,
        conversationId,
        senderId,
        timestamp: new Date(timestamp).getTime(),
        content: sanitizedContent,
        sender,
      };
      io.to(`conversation-${conversationId}`).emit(
        "receive_message",
        messageWithSender,
      );
      acknowledge?.({ ok: true, message: messageWithSender });
      // ADMIN JOINS - Switch from AI to Human
      if (senderId === "admin" && !isAdminHandled) {
        await db.run(
          "UPDATE conversations SET status = 'transferred' WHERE id = ? AND tenantId = ?",
          [conversationId, principal.tenantId],
        );

        conversationAdminStatus.set(conversationId, true);
        pendingTransferRequests.delete(conversationId);
        io.to(`conversation-${conversationId}`).emit(
          "system_offline_for_conversation",
          conversationId,
        );

        setTimeout(async () => {
          await sendSystemMessage(
            io,
            conversationId,
            "You've been connected to Ogooluwani. He's now assisting you personally.",
          );
        }, 500);

        return;
      }

      // If admin is handling, skip AI logic
      if (isAdminHandled) {
        console.log(`Admin handling conversation ${conversationId}`);
        return;
      }

      // Handle transfer confirmation
      const lowerContent = sanitizedContent.toLowerCase().trim();

      // user approves transfer
      if (pendingTransferRequests.has(conversationId)) {
        if (lowerContent === "yes" || lowerContent === "y") {
          await db.run(
            "UPDATE conversations SET status = 'transferred' WHERE id = ? AND tenantId = ?",
            [conversationId, principal.tenantId],
          );

          conversationAdminStatus.set(conversationId, true);
          pendingTransferRequests.delete(conversationId);

          io.to(`conversation-${conversationId}`).emit("system_offline_for_conversation", conversationId);

          setTimeout(async () => {
            await sendSystemMessage(
              io,
              conversationId,
              "Perfect! I'm connecting you to Ogooluwani now. He'll be with you shortly.",
            );

            const user = await db.get("SELECT * FROM users WHERE id = ? AND tenantId = ?", [senderId, principal.tenantId]);
            if (user) {
              notifyAdminNewChat(
                `${user.firstName} ${user.lastName}`,
                user.phone,
                user.email,
              ).catch((err) => console.error("Email notify error:", err));
            }
          }, 500);

          return;
        } else if (lowerContent === "no" || lowerContent === "n") {
          pendingTransferRequests.delete(conversationId);
          await sendSystemMessage(
            io,
            conversationId,
            "No problem! I'm here to help. What else can I assist you with?",
          );
          return;
        }
        // If not yes/no, continue normally
      }

      if (senderId !== "system" && senderId !== "admin") {
        const sanitizedMessage = {
          ...messageWithSender,
          content: sanitizedContent,
        };
        setTimeout(async () => {
          await handleAIResponse(io, sanitizedMessage);
        }, 800);
      }
    } catch (error) {
      logger.error("socket_message_error", { socketId: socket.id, tenantId: principal.tenantId, errorName: error.name, errorMessage: error.message });
      acknowledge?.({ ok: false, error: "Unable to send message" });
    }
  });

  //transfer request from ai
  socket.on("transfer_request", async ({ conversationId }) => {
    try {
      if (principal.role !== "visitor" || !socket.rooms.has(`conversation-${conversationId}`)) return;
      pendingTransferRequests.set(conversationId, true);

      await sendSystemMessage(
        io,
        conversationId,
        "I'll need Ogooluwani to handle that personally. Would you like me to transfer you to him? Please reply 'yes' to connect with him.",
      );
    } catch (error) {
      console.error("Error handling transfer request:", error);
    }
  });

  socket.on("sync_conversation", async ({ conversationId, before, limit } = {}, acknowledge) => {
    try {
      if (!conversationId || !socket.rooms.has(`conversation-${conversationId}`)) {
        return acknowledge?.({ ok: false, error: "Conversation is unavailable" });
      }
      const db = await openDB();
      const page = await getMessagesPage(db, {
        conversationId,
        tenantId: principal.tenantId,
        before,
        limit,
      });
      acknowledge?.({ ok: true, ...page });
    } catch (error) {
      logger.error("socket_sync_error", { socketId: socket.id, tenantId: principal.tenantId, errorName: error.name, errorMessage: error.message });
      acknowledge?.({ ok: false, error: "Unable to sync messages" });
    }
  });

  socket.on("mark_read", async ({ conversationId, messageId } = {}, acknowledge) => {
    try {
      if (!conversationId || !messageId || !socket.rooms.has(`conversation-${conversationId}`)) {
        return acknowledge?.({ ok: false, error: "Conversation is unavailable" });
      }
      const db = await openDB();
      const message = await db.get(
        "SELECT id FROM messages WHERE id = ? AND conversationId = ?",
        [messageId, conversationId],
      );
      if (!message) return acknowledge?.({ ok: false, error: "Message not found" });
      const readerId = principal.role === "admin" ? "admin" : principal.id;
      await db.run(
        `INSERT INTO conversation_reads (conversationId, tenantId, readerId, lastReadMessageId, readAt)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(conversationId, readerId) DO UPDATE SET
           lastReadMessageId = excluded.lastReadMessageId, readAt = CURRENT_TIMESTAMP`,
        [conversationId, principal.tenantId, readerId, messageId],
      );
      await recordAuditEvent(db, {
        tenantId: principal.tenantId,
        actorId: principal.id,
        actorRole: principal.role,
        action: "conversation.read",
        resourceType: "conversation",
        resourceId: conversationId,
        metadata: { messageId },
      });
      io.to(`conversation-${conversationId}`).emit("conversation_read", {
        conversationId,
        readerId,
        messageId,
      });
      acknowledge?.({ ok: true });
    } catch (error) {
      logger.error("socket_read_error", { socketId: socket.id, tenantId: principal.tenantId, errorName: error.name, errorMessage: error.message });
      acknowledge?.({ ok: false, error: "Unable to update read state" });
    }
  });

  // Typing indicators
  socket.on("typing_start", (conversationId) => {
    const userData = userSockets.get(socket.id);
    if (!userData || !conversationId || !socket.rooms.has(`conversation-${conversationId}`)) return;
    io.to(`conversation-${conversationId}`).emit("user_typing", {
      id: userData.id,
      conversationId,
    });
    const key = `${conversationId}:${userData.id}`;
    const existingTimeout = typingTimeouts.get(key);
    if (existingTimeout) clearTimeout(existingTimeout);
    typingTimeouts.set(
      key,
      setTimeout(() => clearTyping(io, conversationId, userData.id), TYPING_TIMEOUT_MS),
    );
  });

  socket.on("typing_stop", (conversationId) => {
    const userData = userSockets.get(socket.id);
    if (!userData || !conversationId || !socket.rooms.has(`conversation-${conversationId}`)) return;
    clearTyping(io, conversationId, userData.id);
  });

  // Close conversation
  socket.on("close_conversation", async (conversationId) => {
    try {
      const db = await openDB();

      const conversation = await db.get(
        "SELECT userId FROM conversations WHERE id = ? AND tenantId = ?",
        [conversationId, principal.tenantId],
      );
      if (!conversation || (principal.role === "visitor" && conversation.userId !== principal.id)) return;

      await db.run(
        "UPDATE conversations SET status = 'closed', closedAt = CURRENT_TIMESTAMP WHERE id = ? AND tenantId = ?",
        [conversationId, principal.tenantId],
      );
      await recordAuditEvent(db, {
        tenantId: principal.tenantId,
        actorId: principal.id,
        actorRole: principal.role,
        action: "conversation.closed",
        resourceType: "conversation",
        resourceId: conversationId,
      });

      conversationAdminStatus.delete(conversationId);
      pendingTransferRequests.delete(conversationId);

      await sendConversationClosedMessage(io, conversationId);
      io.to(`conversation-${conversationId}`).emit(
        "conversation_closed",
        conversationId,
      );

      logger.info("conversation_closed", { tenantId: principal.tenantId, conversationId, actorId: principal.id });
    } catch (error) {
      logger.error("socket_close_error", { socketId: socket.id, tenantId: principal.tenantId, errorName: error.name, errorMessage: error.message });
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    const userData = userSockets.get(socket.id);

    if (userData) {
      logger.info("socket_disconnecting", { socketId: socket.id, tenantId: principal.tenantId, actorId: principal.id });

      // Remove from maps
      const key = presenceKey(principal);
      const sockets = onlineUsers.get(key);
      sockets?.delete(socket.id);
      const isOffline = !sockets || sockets.size === 0;
      if (isOffline) onlineUsers.delete(key);
      userSockets.delete(socket.id);

      for (const room of socket.rooms) {
        if (room.startsWith("conversation-")) clearTyping(io, room.slice("conversation-".length), principal.id);
      }

      if (isOffline) io.to(tenantRoom).emit("user_offline", principal.id);

      if (isOffline && userData.role === "admin") {
        io.to(tenantRoom).emit("user_offline", "admin");
      }

      // Send updated online users list to everyone
      const onlineUserIds = getOnlineUserIds(principal.tenantId);
      io.to(tenantRoom).emit("users_online", onlineUserIds);
    }

    logger.info("socket_disconnected", { socketId: socket.id, tenantId: principal.tenantId, actorId: principal.id });
  });
}

export function setPendingTransfer(conversationId, value) {
  pendingTransferRequests.set(conversationId, value);
}
