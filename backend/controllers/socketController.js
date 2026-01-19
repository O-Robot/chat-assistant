import { openDB } from "../db.js";
import {
  sendWelcomeMessage,
  sendConversationClosedMessage,
  sendSystemMessage,
  sendAdminJoinedMessage,
} from "../utils/systemMessages.js";
import { generateAIResponse } from "../controllers/aiController.js";
import { notifyAdminNewChat } from "../utils/email/email.js";

const onlineUsers = new Map();
const userSockets = new Map();
const conversationAdminStatus = new Map();

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

      // Store user data
      userSockets.set(socket.id, { ...userData, socketId: socket.id });
      onlineUsers.set(id, socket.id);

      console.log(`User ${firstName} ${lastName} (${role}) joined - ${id}`);

      // Join user's own room
      socket.join(`user-${id}`);

      // If visitor, get their conversation and join that room
      if (role === "visitor") {
        const db = await openDB();

        // Close any existing open conversations for this user FIRST
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

        // Get the single open conversation
        const conversation = await db.get(
          "SELECT * FROM conversations WHERE userId = ? AND status = 'open' ORDER BY createdAt DESC LIMIT 1",
          [id],
        );

        if (conversation) {
          socket.join(`conversation-${conversation.id}`);

          // Check if this is a new conversation
          const messageCount = await db.get(
            "SELECT COUNT(*) as count FROM messages WHERE conversationId = ?",
            [conversation.id],
          );

          // Send welcome message for new conversations (only if not taken by admin)
          if (
            messageCount.count === 0 &&
            !conversationAdminStatus.get(conversation.id)
          ) {
            await sendWelcomeMessage(io, conversation.id, firstName);
          }
        }
      }

      // If admin, join all active conversations
      if (role === "admin") {
        const db = await openDB();
        const conversations = await db.all(
          "SELECT * FROM conversations WHERE status = 'open'",
        );

        conversations.forEach((conv) => {
          socket.join(`conversation-${conv.id}`);
        });
      }

      // Broadcast online status to EVERYONE
      io.emit("user_online", id);

      if (role === "admin") {
        io.emit("user_online", "admin");
      }

      // System is always online initially
      io.emit("user_online", "system");

      // Send list of ALL online users to this socket
      const onlineUserIds = Array.from(onlineUsers.keys());
      socket.emit("users_online", onlineUserIds);

      // Also broadcast to everyone else
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

      const db = await openDB();

      // Check if conversation is still open
      const conversation = await db.get(
        "SELECT status FROM conversations WHERE id = ?",
        [conversationId],
      );

      if (!conversation || conversation.status === "closed") {
        console.log("Cannot send message to closed conversation");
        return;
      }

      // Save message to database
      await db.run(
        "INSERT INTO messages (id, conversationId, senderId, content, timestamp) VALUES (?, ?, ?, ?, ?)",
        [
          id,
          conversationId,
          senderId,
          content,
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

      const messageWithSender = { ...message, sender };

      // Broadcast to EVERYONE (all connected sockets)
      io.emit("receive_message", messageWithSender);

      // If admin sends a message, mark conversation as admin-controlled
      if (
        senderId === "admin" &&
        !conversationAdminStatus.get(conversationId)
      ) {
        conversationAdminStatus.set(conversationId, true);

        // System goes offline for this conversation
        io.emit("system_offline_for_conversation", conversationId);

        // Send transfer notification
        setTimeout(async () => {
          await sendSystemMessage(
            io,
            conversationId,
            "You've been connected to our support team. An agent is now assisting you.",
          );
        }, 500);

        setTimeout(async () => {
          await sendAdminJoinedMessage(io, conversationId, sender.firstName);
        }, 500);

        return;
      }

      // Check for transfer request
      const lowerContent = content.toLowerCase();
      if (
        (lowerContent.includes("transfer") ||
          lowerContent.includes("live agent") ||
          lowerContent.includes("human")) &&
        senderId !== "system" &&
        senderId !== "admin" &&
        !conversationAdminStatus.get(conversationId)
      ) {
        setTimeout(async () => {
          await sendSystemMessage(
            io,
            conversationId,
            "Would you like to be transferred to a live agent? Please reply with 'yes' or 'no'.",
          );
        }, 500);
        return;
      }

      // Check for yes/no response to transfer
      if (
        (lowerContent === "yes" || lowerContent === "no") &&
        senderId !== "system" &&
        senderId !== "admin"
      ) {
        const recentMessages = await db.all(
          `SELECT * FROM messages WHERE conversationId = ? ORDER BY timestamp DESC LIMIT 3`,
          [conversationId],
        );

        const hasTransferRequest = recentMessages.some(
          (msg) =>
            msg.senderId === "system" &&
            msg.content.includes("transferred to a live agent"),
        );

        if (hasTransferRequest) {
          if (lowerContent === "yes") {
            conversationAdminStatus.set(conversationId, true);
            io.emit("system_offline_for_conversation", conversationId);

            setTimeout(async () => {
              await sendSystemMessage(
                io,
                conversationId,
                "You've been connected to our support team. An agent will be with you shortly.",
              );
            }, 500);
            const user = await db.get("SELECT * FROM users WHERE id = ?", [
              senderId,
            ]);
            if (user) {
              notifyAdminNewChat(
                `${user.firstName} ${user.lastName}`,
                user.email,
              ).catch((err) =>
                console.error("Error sending admin notification:", err),
              );
            }
          } else {
            setTimeout(async () => {
              await sendSystemMessage(
                io,
                conversationId,
                "No problem! I'm here to help. What can I assist you with?",
              );
            }, 500);
          }
          return;
        }
      }

      // AI auto-response (only if admin hasn't taken over)
      if (
        senderId !== "system" &&
        senderId !== "admin" &&
        !conversationAdminStatus.get(conversationId)
      ) {
        setTimeout(async () => {
          const aiResponse = await generateAIResponse(
            content,
            conversationId,
            db,
          );
          if (aiResponse) {
            await sendSystemMessage(io, conversationId, aiResponse);
          }
        }, 1000);
      }
    } catch (error) {
      console.error("Error in send_message:", error);
    }
  });

  // Typing indicators - broadcast to EVERYONE
  socket.on("typing_start", (conversationId) => {
    const userData = userSockets.get(socket.id);
    console.log(userData, conversationId);
    console.log("Hello", socket.id);
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

      // Update conversation status
      await db.run(
        "UPDATE conversations SET status = 'closed', closedAt = CURRENT_TIMESTAMP WHERE id = ?",
        [conversationId],
      );

      // Remove admin status
      conversationAdminStatus.delete(conversationId);

      // Send system message about conversation closing
      await sendConversationClosedMessage(io, conversationId);

      // Broadcast to EVERYONE that conversation is closed
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
