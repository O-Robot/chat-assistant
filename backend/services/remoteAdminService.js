import { randomUUID } from "crypto";
import { openDB } from "../db.js";
import { sanitizeHTML } from "../utils/sanitize.js";

// Channel-neutral delivery for remote admin adapters. The persisted sender remains
// `admin`, so visitors receive the same identity as dashboard replies.
export async function sendRemoteAdminMessage(io, { tenantId, conversationId, content }) {
  const db = await openDB();
  const conversation = await db.get("SELECT id, status FROM conversations WHERE id = ? AND tenantId = ?", [conversationId, tenantId]);
  if (!conversation || conversation.status === "closed") throw new Error("Conversation is unavailable");
  const sanitized = sanitizeHTML(content);
  if (!sanitized) throw new Error("Message is empty");
  const id = randomUUID(); const timestamp = new Date().toISOString();
  await db.run("INSERT INTO messages (id, conversationId, senderId, content, timestamp) VALUES (?, ?, 'admin', ?, ?)", [id, conversationId, sanitized, timestamp]);
  await db.run("UPDATE conversations SET status = 'transferred', aiState = 'paused', lastMessageAt = ? WHERE id = ? AND tenantId = ?", [timestamp, conversationId, tenantId]);
  const message = { id, conversationId, senderId: "admin", content: sanitized, timestamp: new Date(timestamp).getTime(), sender: { id: "admin", firstName: "Ogooluwani", lastName: "", email: "", role: "admin" }, senderRole: "admin" };
  io.to(`conversation-${conversationId}`).emit("receive_message", message);
  io.to(`conversation-${conversationId}`).emit("system_offline_for_conversation", conversationId);
  return message;
}
