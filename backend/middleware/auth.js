import jwt from "jsonwebtoken";
import { logger } from "../utils/logger.js";

const JWT_SECRET = process.env.JWT_SECRET;
const VISITOR_COOKIE = "chat_session";

function getJwtSecret() {
  if (!JWT_SECRET || JWT_SECRET.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters");
  }
  return JWT_SECRET;
}

export function assertAuthConfiguration() {
  getJwtSecret();
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD_HASH) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD_HASH must be configured");
  }
}

export function getDefaultTenantId() {
  return process.env.DEFAULT_TENANT_ID || "portfolio";
}

export function signVisitorSession(user) {
  return jwt.sign(
    { id: user.id, tenantId: user.tenantId, role: "visitor" },
    getJwtSecret(),
    { expiresIn: "7d" },
  );
}

export function verifyToken(token) {
  return jwt.verify(token, getJwtSecret());
}

export function authenticateVisitor(req, res, next) {
  const token = req.cookies?.[VISITOR_COOKIE];
  if (!token) {
    logger.warn("visitor_auth_failed", { requestId: req.requestId, reason: "missing_session" });
    return res.status(401).json({ message: "Unauthorised" });
  }

  try {
    const principal = verifyToken(token);
    if (principal.role !== "visitor" || !principal.id || !principal.tenantId) {
      logger.warn("visitor_permission_denied", { requestId: req.requestId, reason: "invalid_principal" });
      return res.status(403).json({ message: "Forbidden" });
    }
    req.principal = principal;
    next();
  } catch (error) {
    logger.warn("visitor_auth_failed", { requestId: req.requestId, reason: error.name });
    return res.status(401).json({ message: "Invalid session" });
  }
}

export function setVisitorSession(res, token) {
  res.cookie(VISITOR_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export function getSocketPrincipal(socket) {
  const cookieHeader = socket.handshake.headers.cookie || "";
  const token = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${VISITOR_COOKIE}=`))
    ?.slice(`${VISITOR_COOKIE}=`.length);

  if (!token) return null;
  return verifyToken(decodeURIComponent(token));
}
