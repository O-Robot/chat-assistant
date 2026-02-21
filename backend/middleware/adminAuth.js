import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@example.com";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH; // Change this!

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

export async function loginAdmin(email, password) {
  if (email !== ADMIN_EMAIL) {
    return { success: false, error: "Invalid credentials" };
  }
  const isMatch = await bcrypt.compareSync(password, ADMIN_PASSWORD_HASH);

  if (isMatch) {
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
  return { success: false, error: "Login Failed, Contact Super Admin" };
}

// node -e "console.log(require('bcrypt').hashSync('admin123', 12))"
