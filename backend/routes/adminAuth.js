import express from "express";
import { loginAdmin, authenticateAdmin } from "../middleware/adminAuth.js";
import { openDB } from "../db.js";
import { getDefaultTenantId, verifyToken } from "../middleware/auth.js";
import { recordAuditEvent } from "../utils/audit.js";
import { logger } from "../utils/logger.js";

const router = express.Router();
const isProduction = process.env.NODE_ENV === "production";

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password required" });
  }

  try {
    const result = await loginAdmin(email, password);

    if (result.success) {
      res.cookie("whoami", result.token, {
        httpOnly: true,
        secure: isProduction,
        sameSite: isProduction ? "none" : "lax",
        path: "/",
        maxAge: 3 * 24 * 60 * 60 * 1000,
      });

      const db = await openDB();
      await recordAuditEvent(db, {
        tenantId: getDefaultTenantId(),
        actorId: "admin",
        actorRole: "admin",
        action: "admin.login.succeeded",
        resourceType: "session",
      });

      return res.json({
        success: true,
        message: "Login successful",
      });
    }

    logger.warn("admin_login_failed", { requestId: req.requestId, reason: "invalid_credentials" });
    return res.status(401).json({ message: "Invalid credentials" });
  } catch (error) {
    logger.error("admin_login_error", { requestId: req.requestId, errorName: error.name, errorMessage: error.message });
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Logout
router.post("/logout", async (req, res) => {
  try {
    const token = req.cookies?.whoami;
    const session = token ? verifyToken(token) : null;
    if (session?.sessionId) {
      const db = await openDB();
      await db.run("UPDATE admin_sessions SET invalidatedAt = CURRENT_TIMESTAMP WHERE id = ? AND tenantId = ?", [session.sessionId, session.tenantId]);
    }
  } catch {
    // Expired or invalid tokens still receive a clear-cookie response.
  }
  res.clearCookie("whoami", {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  });
  res.json({ success: true, message: "Logged out" });
});

// Verify session
router.get("/verify", authenticateAdmin, (req, res) => {
  res.json({
    success: true,
    admin: req.admin,
  });
});

export default router;
