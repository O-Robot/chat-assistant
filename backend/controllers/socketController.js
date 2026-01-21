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

  // User joins
  socket.on("user_join", async (userData) => {
    try {
      const { id, firstName, lastName, email, role } = userData;

      if (!id || !email) {
        console.error("Invalid user data received");
        return;
      }

      userSockets.set(socket.id, { ...userData, socketId: socket.id });
      onlineUsers.set(id, socket.id);

      console.log(`User ${firstName} ${lastName} (${role}) joined - ${id}`);

      socket.join(`user-${id}`);

      if (role === "visitor") {
        const db = await openDB();

        await db.run(
          `UPDATE conversations 
           SET status = 'closed', closedAt = CURRENT_TIMESTAMP 
           WHERE userId = ? AND status = 'open' AND id NOT IN (
             SELECT id FROM conversations 
             WHERE userId = ? AND status = 'open' 
             ORDER BY createdAt DESC LIMIT 1
           )`,
          [id, id],
        );

        const conversation = await db.get(
          "SELECT * FROM conversations WHERE userId = ? AND status = 'open' ORDER BY createdAt DESC LIMIT 1",
          [id],
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
            await sendWelcomeMessage(io, conversation.id, firstName);
          }
        }
      }

      if (role === "admin") {
        const db = await openDB();
        const conversations = await db.all(
          "SELECT * FROM conversations WHERE status = 'open'",
        );

        conversations.forEach((conv) => {
          socket.join(`conversation-${conv.id}`);
        });
      }

      io.emit("user_online", id);

      if (role === "admin") {
        io.emit("user_online", "admin");
      }

      io.emit("user_online", "system");

      const onlineUserIds = Array.from(onlineUsers.keys());
      socket.emit("users_online", onlineUserIds);

      io.emit("users_online", onlineUserIds);
    } catch (error) {
      console.error("Error in user_join:", error);
    }
  });

  // Send message
  socket.on("send_message", async (message) => {
    try {
      const { id, conversationId, senderId, content, timestamp } = message;

      if (!conversationId || !senderId || !content) {
        console.error("Invalid message data");
        return;
      }

      const sanitizedContent = sanitizeHTML(content);

      if (!sanitizedContent) {
        console.error("Empty content after sanitization");
        return;
      }

      const db = await openDB();

      const conversation = await db.get(
        "SELECT status FROM conversations WHERE id = ?",
        [conversationId],
      );

      if (!conversation || conversation.status === "closed") {
        console.log("Cannot send message to closed conversation");
        return;
      }

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
          new Date(timestamp).toISOString(),
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
        ...message,
        content: sanitizedContent,
        sender,
      };
      io.emit("receive_message", messageWithSender);

      // ADMIN JOINS - Switch from AI to Human
      if (senderId === "admin" && !isAdminHandled) {
        await db.run(
          "UPDATE conversations SET status = 'transferred' WHERE id = ?",
          [conversationId],
        );

        conversationAdminStatus.set(conversationId, true);
        pendingTransferRequests.delete(conversationId);

        io.emit("system_offline_for_conversation", conversationId);

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
            "UPDATE conversations SET status = 'transferred' WHERE id = ?",
            [conversationId],
          );

          conversationAdminStatus.set(conversationId, true);
          pendingTransferRequests.delete(conversationId);

          io.emit("system_offline_for_conversation", conversationId);

          setTimeout(async () => {
            await sendSystemMessage(
              io,
              conversationId,
              "Perfect! I'm connecting you to Ogooluwani now. He'll be with you shortly.",
            );

            const user = await db.get("SELECT * FROM users WHERE id = ?", [
              senderId,
            ]);
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
    if (!userData || !conversationId) return;

    io.emit("user_typing", { id: userData.id, conversationId });
  });

  socket.on("typing_stop", (conversationId) => {
    const userData = userSockets.get(socket.id);
    if (!userData || !conversationId) return;

    io.emit("user_stopped_typing", { id: userData.id, conversationId });
  });

  // Close conversation
  socket.on("close_conversation", async (conversationId) => {
    try {
      const db = await openDB();

      await db.run(
        "UPDATE conversations SET status = 'closed', closedAt = CURRENT_TIMESTAMP WHERE id = ?",
        [conversationId],
      );

      conversationAdminStatus.delete(conversationId);
      pendingTransferRequests.delete(conversationId);

      await sendConversationClosedMessage(io, conversationId);
      io.emit("conversation_closed", conversationId);

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
      onlineUsers.delete(userData.id);
      userSockets.delete(socket.id);

      // Broadcast offline status to EVERYONE
      io.emit("user_offline", userData.id);

      if (userData.role === "admin") {
        io.emit("user_offline", "admin");
      }

      // Send updated online users list to everyone
      const onlineUserIds = Array.from(onlineUsers.keys());
      io.emit("users_online", onlineUserIds);
    }

    console.log(`Socket disconnected: ${socket.id}`);
  });
}

export function setPendingTransfer(conversationId, value) {
  pendingTransferRequests.set(conversationId, value);
}
