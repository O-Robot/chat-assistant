import { openDB } from "../db.js";
import { sendRemoteAdminMessage } from "./remoteAdminService.js";

const token = process.env.TELEGRAM_BOT_TOKEN;
const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
let offset = 0;

async function telegram(method, body) {
  if (!token) return null;
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return response.json();
}
export async function notifyTelegram(text) { if (token && adminChatId) await telegram("sendMessage", { chat_id: adminChatId, text }); }
export function startTelegramBot(io) {
  if (!token || !adminChatId) return;
  setInterval(async () => {
    try {
      const result = await telegram("getUpdates", { offset, timeout: 0, allowed_updates: ["message"] });
      for (const update of result?.result || []) {
        offset = update.update_id + 1;
        const message = update.message; if (!message || String(message.chat.id) !== String(adminChatId)) continue;
        const [command, conversationId, ...rest] = (message.text || "").trim().split(/\s+/);
        const db = await openDB(); const tenantId = process.env.DEFAULT_TENANT_ID || "portfolio";
        if (command === "/active") { const rows = await db.all("SELECT c.id, u.firstName, u.lastName FROM conversations c JOIN users u ON u.id = c.userId WHERE c.tenantId = ? AND c.status IN ('open','transferred') ORDER BY c.lastMessageAt DESC LIMIT 20", [tenantId]); await notifyTelegram(rows.length ? rows.map((row) => `${row.id} — ${row.firstName} ${row.lastName}`).join("\n") : "No active conversations."); }
        else if (command === "/reply" && conversationId && rest.length) { await sendRemoteAdminMessage(io, { tenantId, conversationId, content: rest.join(" ") }); await notifyTelegram("Reply sent."); }
        else if (["/pause", "/resume", "/close", "/summary"].includes(command) && conversationId) { if (command === "/summary") { const row = await db.get("SELECT summary FROM conversations WHERE id = ? AND tenantId = ?", [conversationId, tenantId]); await notifyTelegram(row?.summary || "No summary available yet."); } else { const field = command === "/close" ? "status = 'closed', closedAt = CURRENT_TIMESTAMP" : `aiState = '${command === "/pause" ? "paused" : "active"}'`; await db.run(`UPDATE conversations SET ${field} WHERE id = ? AND tenantId = ?`, [conversationId, tenantId]); await notifyTelegram(`${command.slice(1)} complete.`); } }
        else await notifyTelegram("Commands: /active, /reply <chat-id> <message>, /pause <chat-id>, /resume <chat-id>, /close <chat-id>, /summary <chat-id>");
      }
    } catch { /* Telegram is optional; retry on the next poll. */ }
  }, 2500).unref();
}
