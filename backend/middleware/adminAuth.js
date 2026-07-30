import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { getDefaultTenantId, verifyToken } from "./auth.js";
import { logger } from "../utils/logger.js";

const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH; // Change this!

export function authenticateAdmin(req, res, next) {
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
    const token = jwt.sign(
      {
        id: "admin",
        email: ADMIN_EMAIL,
        role: "admin",
        tenantId: getDefaultTenantId(),
        firstName: "Admin",
        lastName: "",
      },
      JWT_SECRET,
      { expiresIn: "2d" },
    );
    return { success: true, token };
  }
  return { success: false, error: "Login Failed, Contact Super Admin" };
}

// node -e "console.log(require('bcrypt').hashSync('admin123', 12))"
