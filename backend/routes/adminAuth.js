import express from "express";
import { loginAdmin, authenticateAdmin } from "../middleware/adminAuth.js";

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
        sameSite: isProduction ? "strict" : "lax",
        path: "/",
        domain: isProduction ? ".ogooluwaniadewale.com" : undefined,
        maxAge: 2 * 24 * 60 * 60 * 1000,
      });

      return res.json({
        success: true,
        message: "Login successful",
        token: result.token,
      });
    }

    return res.status(401).json({ message: "Invalid credentials" });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// Logout
router.post("/logout", (req, res) => {
  res.clearCookie("whoami");
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
