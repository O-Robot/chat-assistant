// @ts-ignore: no type declarations for 'nextjs-websocket'
import { WebSocketServer } from "nextjs-websocket";
import { Server } from "socket.io";
import db from "@/lib/db";

export const runtime = "nodejs";
const wss = new WebSocketServer();

const clients = new Map();

wss.on("connection", (socket: any) => {
  console.log("🟢 Client connected");

  socket.on("message", (data: any) => {
    try {
      const msg = JSON.parse(data.toString());
      console.log({ msg });
      if (msg.type === "join") {
        socket.sessionId = msg.sessionId;
        clients.set(socket, msg.sessionId);
        console.log(`Client joined session: ${msg.sessionId}`);
      } else if (msg.type === "message") {
        const { sessionId, sender, message } = msg;

        // Save to DB
        db.prepare(
          "INSERT INTO messages (session_id, sender, message) VALUES (?, ?, ?)"
        ).run(sessionId, sender, message);

        // Broadcast to clients in the same session
        for (const [client, sId] of clients.entries()) {
          if (sId === sessionId) {
            client.send(JSON.stringify(msg));
          }
        }
      }
    } catch (err) {
      console.error("WebSocket error:", err);
    }
  });

  socket.on("close", () => {
    console.log("🔴 Client disconnected");
    clients.delete(socket);
  });
});

export const { GET, POST } = wss.getRoutes();
