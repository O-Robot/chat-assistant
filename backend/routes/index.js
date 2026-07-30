import express from "express";
import { openDB } from "../db.js";
const router = express.Router();

router.get("/", (req, res) => {
  res.json({ status: "ok", service: "portfolio-chat-backend" });
});

router.get("/health", (req, res) => {
  res.json({ status: "ok", service: "portfolio-chat-backend", timestamp: new Date().toISOString() });
});

router.get("/ready", async (req, res, next) => {
  try {
    const db = await openDB();
    await db.get("SELECT 1 AS ready");
    res.json({ status: "ready", database: "ok" });
  } catch (error) {
    next(error);
  }
});

export default router;
