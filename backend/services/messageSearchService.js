const MAX_RESULTS = 50;

function buildFtsQuery(query) {
  const terms = query
    .trim()
    .split(/\s+/)
    .map((term) => term.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter(Boolean)
    .slice(0, 10);

  if (!terms.length) return null;
  return terms.map((term) => `"${term.replace(/"/g, "")}"*`).join(" AND ");
}

// This is deliberately a data-layer primitive. Expose it only through an
// authorised, tenant-scoped endpoint when the product search experience exists.
export async function searchMessages(db, { tenantId, query, limit = 20 }) {
  const ftsQuery = typeof query === "string" ? buildFtsQuery(query) : null;
  if (!tenantId || !ftsQuery) return [];

  const pageSize = Math.min(Math.max(Number(limit) || 20, 1), MAX_RESULTS);
  return db.all(
    `SELECT s.messageId AS id, s.conversationId, c.userId, m.senderId, m.timestamp,
            snippet(message_search, 3, '<mark>', '</mark>', '…', 16) AS snippet
     FROM message_search s
     JOIN messages m ON m.id = s.messageId
     JOIN conversations c ON c.id = m.conversationId
     WHERE message_search MATCH ? AND s.tenantId = ? AND c.tenantId = ?
     ORDER BY m.timestamp DESC, m.id DESC
     LIMIT ?`,
    [ftsQuery, tenantId, tenantId, pageSize],
  );
}
