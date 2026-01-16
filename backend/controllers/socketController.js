import { v4 as uuidv4 } from "uuid";
import {
  addUser,
  removeUser,
  getUser,
  getOnlineVisitors,
} from "../services/userService.js";
import { validateUserData, formatMessage } from "../utils/helpers.js";
import { openDB } from "../db.js";

export const handleSocketConnection = (io, socket) => {
  /**
   * USER JOINS SOCKET
   */
  socket.on("user_join", async (userData) => {
    try {
      // Validate incoming user payload
      if (!validateUserData(userData)) {
        socket.emit("error", "Invalid user data");
        return;
      }

      // Store socket <-> user mapping in memory
      addUser(socket.id, userData);

      // Notify admins when a visitor comes online
      if (userData.role === "visitor") {
        io.emit("visitor_online", {
          userId: userData.id,
          conversationId: userData.conversationId,
        });
      }

      // If admin joins, send all currently online visitors
      if (userData.role === "admin") {
        const onlineVisitors = getOnlineVisitors();
        socket.emit("visitors_online", onlineVisitors);
      }
    } catch (err) {
      console.error("user_join error:", err);
    }
  });

  /**
   * SEND MESSAGE
   * Messages are always scoped to conversationId
   */
  socket.on("send_message", async (message) => {
    const user = getUser(socket.id);
    if (!user) return;

    try {
      const db = await openDB();

      // Ensure conversationId exists
      if (!message.conversationId) {
        socket.emit("error", "Conversation ID missing");
        return;
      }

      // Format message consistently
      const formattedMessage = formatMessage(
        {
          ...message,
          id: uuidv4(),
          timestamp: Date.now(),
        },
        user
      );
      console.log(formattedMessage);
      // Persist message to DB
      await db.run(
        `
        INSERT INTO messages (id, conversationId, senderId, content)
        VALUES (?, ?, ?, ?)
      `,
        [
          formattedMessage.id,
          formattedMessage.conversationId,
          formattedMessage.senderId,
          formattedMessage.content,
        ]
      );

      // Broadcast message to all clients
      io.emit("receive_message", formattedMessage);

      /**
       * Optional system / auto-response
       * Can later be replaced with admin reply or AI
       */
      if (user.role === "visitor") {
        io.emit("user_typing", { id: "system" });

        // Wait 5 seconds
        setTimeout(async () => {
          const systemMessage = {
            id: uuidv4(),
            conversationId: formattedMessage.conversationId,
            senderId: "system",
            content: "Support has received your message 👍",
            timestamp: Date.now(),
          };

          // Save to DB
          await db.run(
            `
      INSERT INTO messages (id, conversationId, senderId, content)
      VALUES (?, ?, ?, ?)
      `,
            [
              systemMessage.id,
              systemMessage.conversationId,
              systemMessage.senderId,
              systemMessage.content,
            ]
          );

          // Emit message
          io.emit("receive_message", systemMessage);

          // Stop typing
          io.emit("user_stopped_typing", { id: "system" });
        }, 5000); // 5 seconds
      }
    } catch (err) {
      console.error("send_message error:", err);
    }
  });

  /**
   * TYPING INDICATOR START
   */
  socket.on("typing_start", () => {
    const user = getUser(socket.id);
    if (!user) return;

    socket.broadcast.emit("user_typing", {
      userId: user.id,
      conversationId: user.conversationId,
    });
  });

  /**
   * TYPING INDICATOR STOP
   */
  socket.on("typing_stop", () => {
    const user = getUser(socket.id);
    if (!user) return;

    socket.broadcast.emit("user_stopped_typing", {
      userId: user.id,
      conversationId: user.conversationId,
    });
  });

  /**
   * END CONVERSATION (user or admin)
   */
  socket.on("end_conversation", async ({ conversationId }) => {
    try {
      const db = await openDB();

      await db.run(
        `
        UPDATE conversations
        SET status = 'closed', closedAt = CURRENT_TIMESTAMP
        WHERE id = ? AND status = 'open'
      `,
        [conversationId]
      );

      io.emit("conversation_ended", { conversationId });
    } catch (err) {
      console.error("end_conversation error:", err);
    }
  });

  /**
   * SOCKET DISCONNECT
   */
  socket.on("disconnect", () => {
    const user = removeUser(socket.id);
    if (!user) return;

    // Notify admins when visitor disconnects
    if (user.role === "visitor") {
      io.emit("visitor_offline", {
        userId: user.id,
        conversationId: user.conversationId,
      });
    }
  });
};
