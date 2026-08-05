import { randomUUID } from "crypto";
import { openDB } from "../db.js";
import { sanitizeHTML } from "../utils/sanitize.js";
import { logger } from "../utils/logger.js";
import { handleAIResponse } from "../controllers/aiController.js";

const tenantId = process.env.DEFAULT_TENANT_ID || "portfolio";
const token = process.env.TELEGRAM_BOT_TOKEN;
const apiUrl = token ? `https://api.telegram.org/bot${token}` : null;

async function telegramSend(chatId, text) {
  if (!apiUrl || !chatId) return;
  const response = await fetch(`${apiUrl}/sendMessage`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: chatId, text: String(text).replace(/<[^>]*>/g, ""), disable_web_page_preview: true }) });
  if (!response.ok) logger.warn("telegram_visitor_send_failed", { statusCode: response.status });
}

export async function sendTelegramConversationMessage(conversationId, content) {
  const db = await openDB();
  const row = await db.get(`SELECT u.telegramUserId FROM conversations c JOIN users u ON u.id = c.userId WHERE c.id = ? AND c.tenantId = ? AND c.channel = 'telegram'`, [conversationId, tenantId]);
  if (row?.telegramUserId) await telegramSend(row.telegramUserId, content);
}

export async function handleTelegramVisitorUpdate(io, update) {
  const message = update?.message;
  if (!message?.from?.id || typeof message.text !== "string") return;
  const telegramUserId = String(message.from.id);
  const content = sanitizeHTML(message.text.trim());
  if (!content || content.length > 4000) return;
  const db = await openDB();
  let user = await db.get("SELECT * FROM users WHERE tenantId = ? AND telegramUserId = ?", [tenantId, telegramUserId]);
  if (!user) {
    const id = randomUUID();
    await db.run("INSERT INTO users (id, firstName, lastName, email, country, tenantId, telegramUserId, telegramUsername) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [id, String(message.from.first_name || "Telegram visitor").slice(0, 100), String(message.from.last_name || "").slice(0, 100), `telegram-${telegramUserId}@telegram.invalid`, "Unknown", tenantId, telegramUserId, String(message.from.username || "").slice(0, 100) || null]);
    user = await db.get("SELECT * FROM users WHERE id = ? AND tenantId = ?", [id, tenantId]);
  }
  let conversation = await db.get("SELECT * FROM conversations WHERE userId = ? AND tenantId = ? AND channel = 'telegram' AND status IN ('open', 'transferred') ORDER BY createdAt DESC LIMIT 1", [user.id, tenantId]);
  if (!conversation) {
    const id = randomUUID();
    await db.run("INSERT INTO conversations (id, userId, status, tenantId, channel) VALUES (?, ?, 'open', ?, 'telegram')", [id, user.id, tenantId]);
    conversation = await db.get("SELECT * FROM conversations WHERE id = ?", [id]);
  }
  const messageId = `${update.update_id || randomUUID()}`;
  const timestamp = new Date().toISOString();
  try { await db.run("INSERT INTO messages (id, conversationId, senderId, content, timestamp) VALUES (?, ?, ?, ?, ?)", [messageId, conversation.id, user.id, content, timestamp]); } catch (error) { if (error.code === "SQLITE_CONSTRAINT") return; throw error; }
  await db.run("UPDATE conversations SET lastMessageAt = ? WHERE id = ? AND tenantId = ?", [timestamp, conversation.id, tenantId]);
  const outgoing = { id: messageId, conversationId: conversation.id, senderId: user.id, content, timestamp: new Date(timestamp).getTime(), sender: { id: user.id, firstName: user.firstName, lastName: user.lastName, role: "visitor" }, senderRole: "visitor" };
  io.to(`conversation-${conversation.id}`).emit("receive_message", outgoing);
  logger.info("telegram_visitor_message_received", { tenantId, conversationId: conversation.id, telegramUserId });
  if (message.text.trim() === "/start") {
    await telegramSend(telegramUserId, "👋 Hi, I'm Ogooluwani's AI assistant.\n\nI can help with portfolio projects, experience, technologies, availability, and freelance enquiries.\n\nHow can I help?");
    return;
  }
  await handleAIResponse(io, outgoing);
}
