import { openDB } from "../db.js";

/**
 * Send a system message to a conversation
 * @param {object} io - Socket.io instance
 * @param {string} conversationId - Conversation ID
 * @param {string} content - Message content
 */
export async function sendSystemMessage(io, conversationId, content) {
  try {
    const db = await openDB();
    const messageId = crypto.randomUUID();
    const timestamp = new Date().toISOString();

    // Save system message to database
    await db.run(
      "INSERT INTO messages (id, conversationId, senderId, content, timestamp) VALUES (?, ?, ?, ?, ?)",
      [messageId, conversationId, "system", content, timestamp]
    );

    const systemMessage = {
      id: messageId,
      conversationId,
      senderId: "system",
      content,
      timestamp: new Date(timestamp).getTime(),
      sender: {
        id: "system",
        firstName: "System",
        lastName: "",
        email: "system@assistant.com",
      },
    };

    // Emit to everyone in the conversation
    io.to(`conversation-${conversationId}`).emit(
      "receive_message",
      systemMessage
    );

    return systemMessage;
  } catch (error) {
    console.error("Error sending system message:", error);
    throw error;
  }
}

/**
 * Send a welcome message when a new conversation starts
 */
export async function sendWelcomeMessage(io, conversationId, userName) {
  const welcomeText = `Hi ${userName}! 👋 Welcome to Ogooluwani's support. How can I help you today?`;
  return await sendSystemMessage(io, conversationId, welcomeText);
}

/**
 * Send a conversation closed message
 */
export async function sendConversationClosedMessage(io, conversationId) {
  const closedText =
    "This conversation has been closed. Feel free to start a new one if you need more help!";
  return await sendSystemMessage(io, conversationId, closedText);
}

/**
 * Send an admin joined message
 */
export async function sendAdminJoinedMessage(io, conversationId, adminName) {
  const joinedText = `${adminName} has joined the conversation.`;
  return await sendSystemMessage(io, conversationId, joinedText);
}

/**
 * Send a transfer message
 */
export async function sendTransferMessage(
  io,
  conversationId,
  fromAdmin,
  toAdmin
) {
  const transferText = `Conversation transferred from ${fromAdmin} to ${toAdmin}.`;
  return await sendSystemMessage(io, conversationId, transferText);
}
