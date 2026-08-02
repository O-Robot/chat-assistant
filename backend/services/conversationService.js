const MAX_PAGE_SIZE = 100;

export function parseCursor(cursor) {
  if (!cursor || typeof cursor !== "string") return null;
  const separator = cursor.lastIndexOf("|");
  if (separator === -1) return null;
  return {
    timestamp: cursor.slice(0, separator),
    id: cursor.slice(separator + 1),
  };
}

export function createCursor(message) {
  return message ? `${message.timestamp}|${message.id}` : null;
}

export async function getMessagesPage(db, { conversationId, tenantId, before, limit }) {
  const pageSize = Math.min(Math.max(Number(limit) || 50, 1), MAX_PAGE_SIZE);
  const cursor = parseCursor(before);
  const params = [conversationId, tenantId];
  let cursorClause = "";

  if (cursor) {
    cursorClause = "AND (m.timestamp < ? OR (m.timestamp = ? AND m.id < ?))";
    params.push(cursor.timestamp, cursor.timestamp, cursor.id);
  }

  params.push(pageSize + 1);
  const rows = await db.all(
    `SELECT m.id, m.conversationId, m.senderId, m.content, m.timestamp,
            u.firstName, u.lastName, u.email
     FROM messages m
     LEFT JOIN users u ON m.senderId = u.id
     JOIN conversations c ON c.id = m.conversationId
     WHERE m.conversationId = ? AND c.tenantId = ? ${cursorClause}
     ORDER BY m.timestamp DESC, m.id DESC
     LIMIT ?`,
    params,
  );

  const hasMore = rows.length > pageSize;
  const messages = rows.slice(0, pageSize).reverse();
  return {
    messages: messages.map(formatMessage),
    nextCursor: hasMore ? createCursor(messages[0]) : null,
  };
}

export function formatMessage(message) {
  return {
    ...message,
    timestamp: new Date(message.timestamp).getTime(),
    sender:
      message.senderId === "ai"
        ? { id: "ai", firstName: "Robot", lastName: "", email: "robot@ogooluwaniadewale.com", role: "ai" }
        : message.senderId === "system"
          ? { id: "system", firstName: "System", lastName: "", email: "", role: "system" }
        : message.senderId === "admin"
          ? { id: "admin", firstName: "Ogooluwani", lastName: "", email: "", role: "admin" }
          : {
              id: message.senderId,
              firstName: message.firstName,
              lastName: message.lastName,
              email: message.email,
            },
  };
}
