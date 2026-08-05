import { logger } from "../utils/logger.js";

export function createRateLimiter({ windowMs, max, key = (req) => req.ip, event = "rate_limit_exceeded" }) {
  const entries = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const identity = key(req) || "unknown";
    const entry = entries.get(identity);
    const active = !entry || now - entry.startedAt >= windowMs
      ? { startedAt: now, count: 0 }
      : entry;
    active.count += 1;
    entries.set(identity, active);
    if (active.count <= max) return next();
    const retryAfter = Math.ceil((windowMs - (now - active.startedAt)) / 1000);
    res.setHeader("Retry-After", String(Math.max(1, retryAfter)));
    logger.warn(event, { requestId: req.requestId, path: req.originalUrl, identity });
    return res.status(429).json({ error: { code: "RATE_LIMITED", message: "Too many requests. Please try again shortly.", requestId: req.requestId } });
  };
}
