import { Router } from "express";
import { handleTelegramVisitorUpdate } from "../services/telegramService.js";
import { logger } from "../utils/logger.js";

export function createTelegramRouter(io) {
  const router = Router();
  router.post("/webhook", async (req, res) => {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    const receivedSecret = req.get("x-telegram-bot-api-secret-token");
    if (!expectedSecret || receivedSecret !== expectedSecret) {
      logger.warn("telegram_webhook_rejected", { requestId: req.requestId, reason: expectedSecret ? "invalid_secret" : "secret_not_configured" });
      return res.status(401).json({ error: "Unauthorised" });
    }
    res.status(200).json({ ok: true });
    try { await handleTelegramVisitorUpdate(io, req.body); }
    catch (error) { logger.error("telegram_webhook_processing_failed", { requestId: req.requestId, errorName: error.name, errorMessage: error.message }); }
  });
  return router;
}
