import { v4 as uuidv4 } from "uuid";
import { logger } from "./logger.js";

export async function recordAuditEvent(db, event) {
  const auditEvent = {
    id: uuidv4(),
    tenantId: event.tenantId,
    actorId: event.actorId || null,
    actorRole: event.actorRole || null,
    action: event.action,
    resourceType: event.resourceType || null,
    resourceId: event.resourceId || null,
    metadata: event.metadata ? JSON.stringify(event.metadata) : null,
  };

  await db.run(
    `INSERT INTO audit_events
     (id, tenantId, actorId, actorRole, action, resourceType, resourceId, metadata)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      auditEvent.id,
      auditEvent.tenantId,
      auditEvent.actorId,
      auditEvent.actorRole,
      auditEvent.action,
      auditEvent.resourceType,
      auditEvent.resourceId,
      auditEvent.metadata,
    ],
  );

  logger.info("audit_event", {
    action: auditEvent.action,
    tenantId: auditEvent.tenantId,
    actorId: auditEvent.actorId,
    actorRole: auditEvent.actorRole,
    resourceType: auditEvent.resourceType,
    resourceId: auditEvent.resourceId,
  });
}

