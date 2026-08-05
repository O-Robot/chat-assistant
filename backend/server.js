import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import cookieParser from "cookie-parser";
import { Server } from "socket.io";
import routes from "./routes/index.js";
import userRoutes from "./routes/users.js";
import adminRoutes from "./routes/admin.js";
import adminAuthRoutes from "./routes/adminAuth.js";
import conversationRoutes from "./routes/conversations.js";
import { handleSocketConnection } from "./controllers/socketController.js";
import { assertAuthConfiguration, getSocketPrincipal, verifyToken } from "./middleware/auth.js";
import { logger } from "./utils/logger.js";
import { randomUUID } from "crypto";
import { closeDatabase, initializeDatabase } from "./db.js";
import { createRateLimiter } from "./middleware/rateLimit.js";
import { isAdminSessionActive } from "./middleware/adminAuth.js";

const allowedOrigins = [
  process.env.FRONTEND_URL,
  ...(process.env.NODE_ENV === "production" ? [] : ["http://localhost:3000"]),
].filter(Boolean);

const app = express();
const server = http.createServer(app);
const socketConnectionWindows = new Map();
const io = new Server(server, {
  cors: { origin: allowedOrigins, methods: ["GET", "POST"], credentials: true },
  path: "/socket.io/",
  transports: ["polling", "websocket"],
});

assertAuthConfiguration();

function assertOperationalConfiguration() {
  const missing = [];
  if (!process.env.GEMINI_API_KEY && !process.env.GROQ_API_KEY) missing.push("GEMINI_API_KEY or GROQ_API_KEY");
  if (!process.env.RESEND_API_KEY) missing.push("RESEND_API_KEY");
  if (process.env.NODE_ENV === "production" && !process.env.FRONTEND_URL) missing.push("FRONTEND_URL");
  if (!missing.length) return;
  if (process.env.NODE_ENV === "production") throw new Error(`Missing required production configuration: ${missing.join(", ")}`);
  logger.warn("configuration_incomplete", { missing });
}

assertOperationalConfiguration();

app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  const requestId = req.headers["x-request-id"] || randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Content-Security-Policy", "default-src 'self'; frame-ancestors 'self'; base-uri 'self'; object-src 'none'");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  if (req.path.startsWith("/admin") || req.path.startsWith("/auth/admin") || req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store");
  }
  const sendJson = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 400 && !(body?.error?.code && body?.error?.message)) {
      const message = typeof body?.error === "string"
        ? body.error
        : typeof body?.message === "string"
          ? body.message
          : "An unexpected error occurred";
      const code = body?.code || (res.statusCode === 400 ? "VALIDATION_ERROR" : res.statusCode === 401 ? "UNAUTHENTICATED" : res.statusCode === 403 ? "FORBIDDEN" : res.statusCode === 404 ? "NOT_FOUND" : res.statusCode === 409 ? "CONFLICT" : "INTERNAL_ERROR");
      return sendJson({ error: { code, message, requestId } });
    }
    return sendJson(body);
  };
  const startedAt = Date.now();
  res.on("finish", () => {
    logger[res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info"](
      "http_request",
      {
        requestId,
        method: req.method,
        path: req.originalUrl,
        statusCode: res.statusCode,
        durationMs: Date.now() - startedAt,
      },
    );
  });
  next();
});

// Express CORS middleware
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed by CORS"));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// Mount routes
app.use("/", routes);
app.use("/api/users", createRateLimiter({ windowMs: 60_000, max: 20, event: "visitor_rate_limited" }), userRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/auth/admin", createRateLimiter({ windowMs: 15 * 60_000, max: 10, event: "login_rate_limited" }), adminAuthRoutes);
app.use("/admin", adminRoutes);

app.use((req, res) => {
  res.status(404).json({
    error: { code: "NOT_FOUND", message: "Resource not found", requestId: req.requestId },
  });
});

app.use((error, req, res, next) => {
  logger.error("http_unhandled_error", {
    requestId: req.requestId,
    method: req.method,
    path: req.originalUrl,
    errorName: error.name,
    errorMessage: error.message,
  });
  if (res.headersSent) return next(error);
  res.status(error.status || 500).json({
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: error.expose ? error.message : "An unexpected error occurred",
      requestId: req.requestId,
    },
  });
});

io.use(async (socket, next) => {
  try {
    const ip = socket.handshake.address || "unknown";
    const now = Date.now();
    const connections = (socketConnectionWindows.get(ip) || []).filter((timestamp) => now - timestamp < 60_000);
    connections.push(now);
    socketConnectionWindows.set(ip, connections);
    if (connections.length > 40) {
      logger.warn("socket_connection_rate_limited", { ip });
      return next(new Error("Too many connection attempts"));
    }
    const principal = getSocketPrincipal(socket);
    const adminToken = socket.handshake.headers.cookie
      ?.split(";")
      .map((cookie) => cookie.trim())
      .find((cookie) => cookie.startsWith("whoami="))
      ?.slice("whoami=".length);
    const admin = adminToken ? verifyToken(decodeURIComponent(adminToken)) : null;
    const requestedRole = socket.handshake.auth?.role;
    const authenticatedPrincipal =
      requestedRole === "admin"
        ? admin
        : requestedRole === "visitor"
          ? principal
          : admin || principal;
    if (!authenticatedPrincipal || !["visitor", "admin"].includes(authenticatedPrincipal.role)) {
      logger.warn("socket_permission_denied", { socketId: socket.id, reason: "missing_principal" });
      return next(new Error("Unauthorised"));
    }
    if (authenticatedPrincipal.role === "admin" && !(await isAdminSessionActive(authenticatedPrincipal))) {
      logger.warn("socket_permission_denied", { socketId: socket.id, reason: "expired_admin_session" });
      return next(new Error("Session expired"));
    }
    socket.data.principal = authenticatedPrincipal;
    next();
  } catch (error) {
    logger.warn("socket_permission_denied", { socketId: socket.id, reason: error.message });
    next(new Error("Unauthorised"));
  }
});

// Initialize socket connection handling
io.on("connection", (socket) => {
  logger.info("socket_connected", {
    socketId: socket.id,
    tenantId: socket.data.principal.tenantId,
    actorId: socket.data.principal.id,
    actorRole: socket.data.principal.role,
  });
  handleSocketConnection(io, socket);
  if (socket.data.principal.role === "admin" && socket.data.principal.exp) {
    const delay = Math.max(0, socket.data.principal.exp * 1000 - Date.now());
    const expiryTimer = setTimeout(() => {
      socket.emit("session_expired");
      socket.disconnect(true);
    }, delay);
    socket.once("disconnect", () => clearTimeout(expiryTimer));
  }
});

const PORT = process.env.PORT || 3001;
initializeDatabase({ migrate: true })
  .then(() => server.listen(PORT, () => logger.info("server_started", { port: PORT })))
  .catch((error) => {
    logger.error("server_start_failed", { errorName: error.name, errorMessage: error.message });
    process.exit(1);
  });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    server.close(async () => {
      await closeDatabase();
      logger.info("server_stopped", { signal });
      process.exit(0);
    });
  });
}
