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

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(cookieParser());

// allowed origni
const allowedOrigins = [
  process.env.FRONTEND_URL,
  "http://localhost:3000",
].filter(Boolean);

// Express CORS middleware
const corsOptions = {
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
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

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  path: "/socket.io/",
  transports: ["polling", "websocket"],
});

// Initialize socket connection handling
io.on("connection", (socket) => {
  handleSocketConnection(io, socket);
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
