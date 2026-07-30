import { openDB } from "../db.js";
import {
  sendWelcomeMessage,
  sendConversationClosedMessage,
  sendSystemMessage,
} from "../utils/systemMessages.js";
import { handleAIResponse } from "../controllers/aiController.js";
import { notifyAdminNewChat } from "../utils/email/email.js";
import { sanitizeHTML } from "../utils/sanitize.js";

const onlineUsers = new Map();
const userSockets = new Map();
const conversationAdminStatus = new Map();
const pendingTransferRequests = new Map();

export function handleSocketConnection(io, socket) {
  console.log(`Socket connected: ${socket.id}`);
  const principal = socket.data.principal;
  const tenantRoom = `tenant-${principal.tenantId}`;
  socket.join(tenantRoom);

  // User joins
  socket.on("user_join", async () => {
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
      onlineUsers.set(`${principal.tenantId}:${principal.id}`, socket.id);
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

      io.to(tenantRoom).emit("user_online", principal.id);

      if (role === "admin") {
        io.to(tenantRoom).emit("user_online", "admin");
      }

      io.to(tenantRoom).emit("user_online", "system");

      const onlineUserIds = Array.from(onlineUsers.keys())
        .filter((key) => key.startsWith(`${principal.tenantId}:`))
        .map((key) => key.slice(principal.tenantId.length + 1));
      socket.emit("users_online", onlineUserIds);

      io.to(tenantRoom).emit("users_online", onlineUserIds);
    } catch (error) {
      console.error("Error in user_join:", error);
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
      await db.run(
        "INSERT INTO messages (id, conversationId, senderId, content, timestamp) VALUES (?, ?, ?, ?, ?)",
        [
          id,
          conversationId,
          senderId,
          sanitizedContent,
          new Date().toISOString(),
        ],
      );

      console.log(`Message saved: ${id} in conversation ${conversationId}`);

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
        timestamp: Date.now(),
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
          ...message,
          content: sanitizedContent,
        };
        setTimeout(async () => {
          await handleAIResponse(io, sanitizedMessage);
        }, 800);
      }
    } catch (error) {
      console.error("Error in send_message:", error);
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

  // Typing indicators - broadcast to EVERYONE
  socket.on("typing_start", (conversationId) => {
    const userData = userSockets.get(socket.id);
    if (!userData || !conversationId || !socket.rooms.has(`conversation-${conversationId}`)) return;
    io.to(`conversation-${conversationId}`).emit("user_typing", {
      id: userData.id,
      conversationId,
    });
  });

  socket.on("typing_stop", (conversationId) => {
    const userData = userSockets.get(socket.id);
    if (!userData || !conversationId || !socket.rooms.has(`conversation-${conversationId}`)) return;
    io.to(`conversation-${conversationId}`).emit("user_stopped_typing", {
      id: userData.id,
      conversationId,
    });
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

      conversationAdminStatus.delete(conversationId);
      pendingTransferRequests.delete(conversationId);

      await sendConversationClosedMessage(io, conversationId);
      io.to(`conversation-${conversationId}`).emit(
        "conversation_closed",
        conversationId,
      );

      console.log(`Conversation closed: ${conversationId}`);
    } catch (error) {
      console.error("Error closing conversation:", error);
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    const userData = userSockets.get(socket.id);

    if (userData) {
      console.log(
        `User ${userData.firstName} ${userData.lastName} disconnected`,
      );

      // Remove from maps
      onlineUsers.delete(`${principal.tenantId}:${principal.id}`);
      userSockets.delete(socket.id);

      io.to(tenantRoom).emit("user_offline", principal.id);

      if (userData.role === "admin") {
        io.to(tenantRoom).emit("user_offline", "admin");
      }

      // Send updated online users list to everyone
      const onlineUserIds = Array.from(onlineUsers.keys())
        .filter((key) => key.startsWith(`${principal.tenantId}:`))
        .map((key) => key.slice(principal.tenantId.length + 1));
      io.to(tenantRoom).emit("users_online", onlineUserIds);
    }

    console.log(`Socket disconnected: ${socket.id}`);
  });
}

export function setPendingTransfer(conversationId, value) {
  pendingTransferRequests.set(conversationId, value);
}
