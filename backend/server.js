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

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: [process.env.FRONTEND_URL, "http://localhost:3000"].filter(Boolean), methods: ["GET", "POST"], credentials: true },
  path: "/socket.io/",
  transports: ["polling", "websocket"],
});

assertAuthConfiguration();

app.use(express.json({ limit: "64kb" }));
app.use(cookieParser());
app.use((req, res, next) => {
  const requestId = req.headers["x-request-id"] || randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
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

// allowed origni
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:3000",
].filter(Boolean);

// Express CORS middleware
const corsOptions = {
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// Mount routes
app.use("/", routes);
app.use("/api/users", userRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/auth/admin", adminAuthRoutes);
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

io.use((socket, next) => {
  try {
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
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  logger.info("server_started", { port: PORT });
});
