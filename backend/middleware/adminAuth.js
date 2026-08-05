import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { getDefaultTenantId, verifyToken } from "./auth.js";
import { logger } from "../utils/logger.js";
import { openDB } from "../db.js";
import { randomUUID } from "crypto";

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH; // Change this!

export async function isAdminSessionActive(principal) {
  if (!principal?.sessionId) return false;
  const db = await openDB();
  const session = await db.get(
    "SELECT id FROM admin_sessions WHERE id = ? AND tenantId = ? AND invalidatedAt IS NULL AND datetime(expiresAt) > datetime('now')",
    [principal.sessionId, principal.tenantId],
  );
  return Boolean(session);
}

export async function authenticateAdmin(req, res, next) {
  const token = req.cookies?.whoami;

  if (!token) {
    logger.warn("admin_auth_failed", { requestId: req.requestId, reason: "missing_session" });
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = verifyToken(token);
    if (decoded.role !== "admin" || !decoded.tenantId) {
      logger.warn("admin_permission_denied", { requestId: req.requestId, reason: "invalid_principal" });
      return res.status(403).json({ message: "Forbidden" });
    }
    if (!(await isAdminSessionActive(decoded))) {
      res.clearCookie("whoami", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: process.env.NODE_ENV === "production" ? "none" : "lax", path: "/" });
      return res.status(401).json({ message: "Session expired" });
    }
    req.admin = decoded;
    next();
  } catch (error) {
    logger.warn("admin_auth_failed", { requestId: req.requestId, reason: error.name });
    return res.status(401).json({ message: "Invalid token" });
  }
}

export async function loginAdmin(email, password) {
  if (!JWT_SECRET || JWT_SECRET.length < 32 || !ADMIN_EMAIL || !ADMIN_PASSWORD_HASH) {
    throw new Error("Admin authentication is not configured securely");
  }
  if (email !== ADMIN_EMAIL) {
    return { success: false, error: "Invalid credentials" };
  }
  const isMatch = await bcrypt.compare(password, ADMIN_PASSWORD_HASH);

  if (isMatch) {
    const db = await openDB();
    const tenantId = getDefaultTenantId();
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    await db.exec("BEGIN IMMEDIATE");
    try {
      await db.run("UPDATE admin_sessions SET invalidatedAt = CURRENT_TIMESTAMP WHERE tenantId = ? AND invalidatedAt IS NULL", [tenantId]);
      await db.run("INSERT INTO admin_sessions (id, tenantId, expiresAt) VALUES (?, ?, ?)", [sessionId, tenantId, expiresAt]);
      await db.exec("COMMIT");
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
    const token = jwt.sign(
      {
        id: "admin",
        email: ADMIN_EMAIL,
        role: "admin",
        tenantId,
        sessionId,
        firstName: "Admin",
        lastName: "",
      },
      JWT_SECRET,
      { expiresIn: "3d" },
    );
    return { success: true, token };
  }
  return { success: false, error: "Login Failed, Contact Super Admin" };
}

// node -e "console.log(require('bcrypt').hashSync('admin123', 12))"
