import { openDB } from "../db.js";
import { sanitizeHTML } from "../utils/sanitize.js";
import { v4 as uuidv4 } from "uuid";

export async function sendSystemMessage(io, conversationId, content, senderId = "system") {
  try {
    const sanitizedContent = sanitizeHTML(content);

    if (!sanitizedContent) {
      console.error("Empty content after sanitization in system message");
      return;
    }

    const db = await openDB();

    const messageId = uuidv4();
    const timestamp = new Date().toISOString();

    // Save system message to database
    await db.run(
      "INSERT INTO messages (id, conversationId, senderId, content, timestamp) VALUES (?, ?, ?, ?, ?)",
      [messageId, conversationId, senderId, sanitizedContent, timestamp],
    );
    await db.run(
      `UPDATE conversations
       SET lastMessageAt = ?
       WHERE id = ? AND (lastMessageAt IS NULL OR julianday(?) >= julianday(lastMessageAt))`,
      [timestamp, conversationId, timestamp],
    );

    const systemMessage = {
      id: messageId,
      conversationId,
      senderId,
      content: sanitizedContent,
      timestamp: new Date(timestamp).getTime(),
      sender: {
        id: senderId,
        firstName: senderId === "ai" ? "Robot" : "System",
        lastName: "",
        email: senderId === "ai" ? "robot@ogooluwaniadewale.com" : "",
        role: senderId === "ai" ? "ai" : "system",
      },
    };

    // Emit to everyone in the conversation
    io.to(`conversation-${conversationId}`).emit(
      "receive_message",
      systemMessage,
    );

    const { sendTelegramConversationMessage } = await import("../services/telegramService.js");
    await sendTelegramConversationMessage(conversationId, sanitizedContent);

    return systemMessage;
  } catch (error) {
    console.error("Error sending system message:", error);
    throw error;
  }
}

export function sendAIMessage(io, conversationId, content) {
  return sendSystemMessage(io, conversationId, content, "ai");
}

export async function sendWelcomeMessage(io, conversationId, userName) {
  const welcomeText = `Hi ${userName}! 👋 I'm Robot, Ogooluwani's AI assistant. How can I help you today?`;
  return await sendAIMessage(io, conversationId, welcomeText);
}

export async function sendConversationClosedMessage(io, conversationId) {
  const closedText =
    "This conversation has been closed. Feel free to start a new one if you need more help!";
  return await sendSystemMessage(io, conversationId, closedText);
}

export async function sendAdminJoinedMessage(io, conversationId, adminName) {
  const joinedText = `${adminName} has joined the conversation.`;
  return await sendSystemMessage(io, conversationId, joinedText);
}
