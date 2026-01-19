import jwt from "jsonwebtoken";

const JWT_SECRET =
  process.env.JWT_SECRET || "your-super-secret-jwt-key-change-in-production";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123"; // Change this!

export function authenticateAdmin(req, res, next) {
  const token =
    req.cookies?.whoami || req.headers.authorization?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Forbidden" });
    }
    req.admin = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
}

export function loginAdmin(email, password) {
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = jwt.sign(
      {
        id: "admin",
        email: ADMIN_EMAIL,
        role: "admin",
        firstName: "Admin",
        lastName: "",
      },
      JWT_SECRET,
      { expiresIn: "7d" },
    );
    return { success: true, token };
  }
  return { success: false };
}
