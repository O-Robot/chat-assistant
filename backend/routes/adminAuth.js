import express from "express";
import { loginAdmin, authenticateAdmin } from "../middleware/adminAuth.js";

const router = express.Router();
const isProduction = process.env.NODE_ENV === "production";

router.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: "Email and password required" });
  }

  const result = loginAdmin(email, password);

  if (result.success) {
    console.log("Prod", isProduction);
    res.cookie("whoami", result.token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
    });

    return res.json({
      success: true,
      message: "Login successful",
      token: result.token,
    });
  }

  return res.status(401).json({ message: "Invalid credentials" });
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
