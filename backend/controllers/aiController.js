import { GoogleGenAI } from "@google/genai";
import Groq from "groq-sdk";
import { openDB } from "../db.js";
import { logger } from "../utils/logger.js";
import { sendAIMessage, sendSystemMessage } from "../utils/systemMessages.js";
import { setPendingTransfer } from "./socketController.js";

const aiRespondingState = new Map();
const aiRequestWindows = new Map();
const AI_TIMEOUT_MS = Number(process.env.AI_REQUEST_TIMEOUT_MS || 25_000);

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error("AI request timed out")), timeoutMs),
    ),
  ]);
}

function isAiRateLimited(senderId) {
  const now = Date.now();
  const active = (aiRequestWindows.get(senderId) || []).filter(
    (timestamp) => now - timestamp < 60_000,
  );
  active.push(now);
  aiRequestWindows.set(senderId, active);
  return active.length > 8;
}

let genAI;
let groq;

function getGoogleClient() {
  if (!process.env.GEMINI_API_KEY)
    throw new Error("GEMINI_API_KEY is not configured");
  genAI ||= new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return genAI;
}

function getGroqClient() {
  if (!process.env.GROQ_API_KEY)
    throw new Error("GROQ_API_KEY is not configured");
  groq ||= new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

const MODEL_POOL = [
  {
    name: "openai/gpt-oss-20b",
    provider: "groq",
    maxPerDay: 1000,
    role: "primary",
  },
  {
    name: "openai/gpt-oss-120b",
    provider: "groq",
    maxPerDay: 1000,
    role: "premium",
  },
  {
    name: "meta-llama/llama-4-scout-17b-16e-instruct",
    provider: "groq",
    maxPerDay: 1000,
    role: "smart",
  },
  {
    name: "llama-3.3-70b-versatile",
    provider: "groq",
    maxPerDay: 1000,
    role: "premium",
  },
  {
    name: "moonshotai/kimi-k2-instruct",
    provider: "groq",
    maxPerDay: 1000,
    role: "backup",
  },

  {
    name: "gemini-2.5-flash",
    provider: "google",
    maxPerDay: 20,
    role: "google-primary",
  },
  {
    name: "gemini-3-flash-preview",
    provider: "google",
    maxPerDay: 20,
    role: "google-smart",
  },
  {
    name: "gemma-3-12b-it",
    provider: "google",
    maxPerDay: 14400,
    role: "google-cheap",
  },
  {
    name: "gemma-3n-e4b-it",
    provider: "google",
    maxPerDay: 14400,
    role: "google-cheap-2",
  },
  {
    name: "gemma-3-27b-it",
    provider: "google",
    maxPerDay: 14400,
    role: "google-cheap-2",
  },
];

// Track daily usage per model
const modelUsage = new Map();
let lastResetDay = new Date().toDateString();

function resetDailyUsage() {
  const today = new Date().toDateString();

  if (today !== lastResetDay) {
    modelUsage.clear();
    lastResetDay = today;
  }
}

function canUseModel(modelName, maxPerDay) {
  const used = modelUsage.get(modelName) || 0;
  return used < maxPerDay;
}

function incrementModelUsage(modelName) {
  const used = modelUsage.get(modelName) || 0;
  modelUsage.set(modelName, used + 1);
}

function pickModelCandidates() {
  resetDailyUsage();

  const candidates = [];

  for (const model of MODEL_POOL) {
    if (canUseModel(model.name, model.maxPerDay)) {
      candidates.push(model);
    }
  }

  return candidates;
}

//  *Build system persona
function buildSystemPrompt(userName, country = "") {
  const isNigeria =
    country?.toLowerCase() === "nigeria" || country?.toLowerCase() === "ng";
  const currencySymbol = isNigeria ? "₦" : "$";
  const corporatePrice = isNigeria ? "₦350,000" : "$300";
  const ecommercePrice = isNigeria ? "₦500,000" : "$500";

  return `You are Robot, the AI assistant for Ogooluwani Adewale.

You are an intelligent, calm, and professional assistant. You speak like a helpful human, not like a sales bot.

ABOUT OGOOLUWANI:
- Software Developer with a BSc. in Economics
- Known for technical problem-solving and community-led digital solutions
- Builds scalable web and mobile systems and digital products
- Strong in: React, Next.js, Vue, Angular, Python, Flutter, WordPress/WooCommerce, Shopify, Mobile dev (Flutter/React Native), APIs
- Portfolio site is https://ogooluwaniadewale.com


MEETINGS:
- If and only if the user explicitly asks for a consultation or meeting,
  tell them to visit:
  https://ogooluwaniadewale.com/contact-me
  and book via the Calendly section.

YOUR ROLE:
- Understand what the user wants
- Give clear technical guidance
- Explain services in simple terms
- Only discuss pricing when the user asks

PRICING CONTEXT (only mention when relevant):

**CORPORATE**
${corporatePrice}
• Domain & Hosting (1 Year)
• Business Emails
• Up to 5 Pages
• On Page SEO
• Timeline: 1-2 weeks

**E-COMMERCE**
${ecommercePrice}
• Domain & Hosting (1 Year)
• Business Emails
• On Page SEO
• Up to 100 products
• Payment Gateway
• 1 Month Support
• Analytics Integration
• Timeline: 2-4 weeks

**CUSTOM**
Price: TBD (Requires consultation)
• Domain & Hosting (1 Year)
• User & Admin Dashboard
• Payment Gateway
• Continuous Support
• Analytics Integration
• Social Media Integration
• On Page & Off Page SEO
• Content Management
• Timeline: 4-6 weeks+

MANDATORY RULE:
Every time you mention a price, you MUST add:
"<em><strong>Please note:</strong> This is an estimate based on current market rates. Final pricing is subject to Ogooluwani's review of the project scope and could be higher, lower, or at par.</em>"

POST-LAUNCH SUPPORT:
Ogooluwani provides at least one month of extended support for E-Commerce and Custom plan clients. This includes technical assistance, bug fixes, minor adjustments, and guidance.

TRANSFER TO HUMAN WHEN:
- User asks for final contract
- User wants exact custom pricing
- User has complaints or sensitive issues
- Personal life details


When you need to transfer (final contract, exact custom pricing, complaints, sensitive issues, personal details), respond ONLY with:
"[TRANSFER_REQUEST]"

Do NOT say anything else. Do NOT explain. Just "[TRANSFER_REQUEST]" and nothing more.

HTML FORMATTING:
You can use HTML in your responses for better formatting:
- Use <ul> and <li> for lists
- Use <strong> for emphasis
- Use <br> for line breaks
- Use <a href="URL">text</a> for links
- Keep it simple and clean

Example:
<strong>Services Available:</strong><br>
<ul>
<li>Corporate Websites</li>
<li>E-Commerce Platforms</li>
<li>Custom Applications</li>
</ul>

STYLE RULES:
- Use UK English (Nigerian professional style)
- Sound like a real assistant, not a marketer
- Be concise but helpful
- 2 to 4 sentences per reply
- Emojis: rare and subtle
- Never promise fixed delivery dates
- If you don't know something, say so clearly
- Address user as: ${userName}

User name: ${userName}  
User country: ${country || "Unknown"}  
Currency context: ${currencySymbol}`;
}

export async function generateAssistantText({
  instructions,
  conversationHistory = [],
  maxTokens = 500,
}) {
  const prompt = `${instructions}\n\nUse UK English. Return only the requested text.`;
  return generateWithFallback(
    conversationHistory.slice(-20),
    prompt,
    maxTokens,
  );
}

//  * Generate using Google models
async function generateWithGoogle(
  modelName,
  conversationHistory,
  systemPrompt,
) {
  const contents = [
    {
      role: "user",
      parts: [{ text: systemPrompt }],
    },
    ...conversationHistory.map((msg) => ({
      role: ["system", "ai", "admin"].includes(msg.senderId) ? "model" : "user",
      parts: [{ text: msg.content }],
    })),
  ];

  const response = await getGoogleClient().models.generateContent({
    model: modelName,
    contents: contents,
  });

  const text = response.text || "";

  incrementModelUsage(modelName);

  return text;
}

//  * Generate using Groq models

async function generateWithGroq(modelName, conversationHistory, systemPrompt) {
  const messages = [
    { role: "system", content: systemPrompt },
    ...conversationHistory.map((msg) => ({
      role: ["system", "ai", "admin"].includes(msg.senderId)
        ? "assistant"
        : "user",
      content: msg.content,
    })),
  ];

  const completion = await getGroqClient().chat.completions.create({
    model: modelName,
    messages,
    temperature: 0.7,
    max_tokens: 500,
  });

  const text = completion.choices[0]?.message?.content || "";

  incrementModelUsage(modelName);

  return text;
}

//  * Try models in order with fallback
async function generateWithFallback(
  conversationHistory,
  systemPrompt,
  maxTokens = 500,
) {
  const candidates = pickModelCandidates();

  if (candidates.length === 0) {
    throw new Error("No AI models available today");
  }

  for (const model of candidates) {
    try {
      console.log(`[AI] Trying ${model.provider} -> ${model.name}`);

      let response = "";

      if (model.provider === "google") {
        response = await withTimeout(
          generateWithGoogle(model.name, conversationHistory, systemPrompt),
          AI_TIMEOUT_MS,
        );
      } else {
        response = await withTimeout(
          generateWithGroq(model.name, conversationHistory, systemPrompt),
          AI_TIMEOUT_MS,
        );
      }

      if (response && response.trim()) {
        console.log(`[AI] Success with ${model.name}`);
        return response.trim();
      }
    } catch (error) {
      console.error(`[AI] Failed with ${model.name}:`, error.message);
      continue;
    }
  }

  throw new Error("All AI models failed");
}

//  * Check if AI is already responding
export function isAIResponding(conversationId) {
  return aiRespondingState.get(conversationId) === true;
}

//  * Main handler
export async function handleAIResponse(io, message) {
  const { conversationId, content, senderId } = message;

  if (senderId === "system" || senderId === "admin") {
    return;
  }

  if (isAIResponding(conversationId)) {
    return;
  }

  if (isAiRateLimited(senderId)) {
    logger.warn("ai_request_failed", {
      conversationId,
      senderId,
      state: "AI_FAILED",
      reason: "rate_limited",
    });
    await sendAIMessage(
      io,
      conversationId,
      "I’ve received several messages quickly. Please give me a moment, then send your next message.",
    );
    return;
  }

  aiRespondingState.set(conversationId, true);
  logger.info("ai_request_started", {
    conversationId,
    senderId,
    state: "AI_PENDING",
  });

  try {
    const db = await openDB();

    const conversation = await db.get(
      "SELECT status, aiState, tenantId FROM conversations WHERE id = ?",
      [conversationId],
    );

    if (
      !conversation ||
      conversation.status !== "open" ||
      conversation.aiState !== "active"
    ) {
      console.log(
        `[AI] Conversation ${conversationId} is transferred. Skipping AI.`,
      );
      return;
    }

    // Get user info
    const user = await db.get("SELECT * FROM users WHERE id = ?", [senderId]);
    if (!user) return;

    // Fetch recent messages
    const recentMessages = await db.all(
      `SELECT * FROM messages 
       WHERE conversationId = ? 
       ORDER BY timestamp DESC 
       LIMIT 10`,
      [conversationId],
    );

    const conversationHistory = recentMessages.reverse();

    io.to(`conversation-${conversationId}`).emit("user_typing", {
      id: "system",
      conversationId,
    });

    const journey = await db.get(
      "SELECT currentPage, referrer, visitedPages FROM conversation_journeys WHERE conversationId = ? AND tenantId = ?",
      [conversationId, conversation.tenantId],
    );
    const journeyContext = journey
      ? `\nVISITOR JOURNEY:\nCurrent page: ${journey.currentPage || "Unknown"}\nPreviously visited: ${journey.visitedPages || "[]"}\nReferrer: ${journey.referrer || "Direct"}`
      : "";
    const systemPrompt = `${buildSystemPrompt(user.firstName, user.country)}${journeyContext}`;

    const aiResponse = await generateWithFallback(
      conversationHistory,
      systemPrompt,
    );

    // Stop typing
    io.to(`conversation-${conversationId}`).emit("user_stopped_typing", {
      id: "system",
      conversationId,
    });

    const latestConversation = await db.get(
      "SELECT status, aiState FROM conversations WHERE id = ?",
      [conversationId],
    );

    if (
      !latestConversation ||
      latestConversation.status !== "open" ||
      latestConversation.aiState !== "active"
    ) {
      console.log(
        `[AI] Transfer happened during generation. Dropping response.`,
      );
      return;
    }

    if (aiResponse.includes("[TRANSFER_REQUEST]")) {
      console.log(`[AI] Transfer request for conversation ${conversationId}`);
      setPendingTransfer(conversationId, true);
      await sendSystemMessage(
        io,
        conversationId,
        "I'll need Ogooluwani to handle that personally. Would you like me to transfer you to him? Please reply 'yes' to connect with him.",
      );
      return;
    }
    // Send message
    if (aiResponse) {
      await sendAIMessage(io, conversationId, aiResponse);
      logger.info("ai_request_completed", {
        conversationId,
        senderId,
        state: "AI_COMPLETED",
      });
    }
  } catch (error) {
    logger.error("ai_request_failed", {
      conversationId,
      senderId,
      state: "AI_FAILED",
      errorName: error.name,
      errorMessage: error.message,
    });

    io.to(`conversation-${conversationId}`).emit("user_stopped_typing", {
      id: "system",
      conversationId,
    });

    const latestConversation = await openDB().then((db) =>
      db.get("SELECT status FROM conversations WHERE id = ?", [conversationId]),
    );
    if (latestConversation?.status === "open") {
      await sendAIMessage(
        io,
        conversationId,
        "I’m having a bit of trouble processing that right now. Would you like me to connect you with Ogooluwani directly?",
      );
    }
  } finally {
    aiRespondingState.set(conversationId, false);
  }
}
