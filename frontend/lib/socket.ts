import { io, Socket } from "socket.io-client";
import { useChatStore } from "@/store/chatStore";
import { create } from "zustand";
import { Console } from "./constants";

interface ErrorState {
  error: string | null;
  setError: (error: string | null) => void;
}

interface SocketConfig {
  onReconnecting?: (attempt: number) => void;
  onReconnected?: () => void;
  onReconnectFailed?: () => void;
  onDisconnect?: (reason: string) => void;
}

export const useErrorStore = create<ErrorState>((set) => ({
  error: null,
  setError: (error) => set({ error }),
}));

const SOCKET_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

let socket: Socket;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

let socketConfig: SocketConfig = {};

export const initializeSocket = (config?: SocketConfig) => {
  if (config) {
    socketConfig = config;
  }

  if (socket?.connected) {
    Console.log("Socket already connected");
    return socket;
  }

  if (!socket) {
    socket = io(SOCKET_URL, {
      path: "/socket.io/",
      transports: ["polling", "websocket"],
      withCredentials: false,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: RECONNECT_DELAY,
      reconnectionDelayMax: MAX_RECONNECT_DELAY,
      timeout: 20000,
      autoConnect: true,
      forceNew: false,
    });

    socket.on("connect_error", (error) => {
      const errorMessage =
        error.message === "xhr poll error"
          ? "Unable to connect to chat server. Please check your internet connection."
          : `Chat server connection error: ${error.message}`;
      useErrorStore.getState().setError(errorMessage);
      Console.error("Connection error:", error.message);

      reconnectAttempts++;
      if (socketConfig.onReconnecting) {
        socketConfig.onReconnecting(reconnectAttempts);
      }

      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        Console.error("Max reconnection attempts reached");
        if (socketConfig.onReconnectFailed) {
          socketConfig.onReconnectFailed();
        }
      }
    });

    socket.on("error", (error) => {
      console.error("Socket error:", error);
      useErrorStore
        .getState()
        .setError("An error occurred with the chat connection.");
    });

    socket.on("disconnect", (reason) => {
      Console.warn("❌ Socket disconnected:", reason);

      if (socketConfig.onDisconnect) {
        socketConfig.onDisconnect(reason);
      }
      if (reason === "io server disconnect") {
        useErrorStore
          .getState()
          .setError("Disconnected from chat server. Trying to reconnect...");
        socket?.connect();
      } else if (reason === "transport close") {
        useErrorStore
          .getState()
          .setError(
            "Lost connection to chat server. Check your internet connection.",
          );
      }
    });

    socket.on("reconnect_attempt", (attempt) => {
      Console.log(`🔄 Reconnection attempt ${attempt}`);

      if (socketConfig.onReconnecting) {
        socketConfig.onReconnecting(attempt);
      }
    });

    socket.on("reconnect", (attemptNumber) => {
      Console.log(`✅ Reconnected after ${attemptNumber} attempts`);
      reconnectAttempts = 0;

      if (socketConfig.onReconnected) {
        socketConfig.onReconnected();
      }
    });

    socket.on("reconnect_failed", () => {
      Console.error("❌ Reconnection failed");

      if (socketConfig.onReconnectFailed) {
        socketConfig.onReconnectFailed();
      }
    });

    // Listen for incoming messages
    socket.on("receive_message", (message) => {
      useChatStore.getState().receiveMessage(message);
    });
  }
  return socket;
};

export const getSocket = (): Socket => {
  if (!socket) {
    return initializeSocket();
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    Console.log("Socket disconnected and cleaned up");
  }
};

export const isSocketConnected = (): boolean => {
  return socket?.connected ?? false;
};

export const reconnectSocket = () => {
  if (socket && !socket.connected) {
    Console.log("Manually reconnecting socket...");
    socket.connect();
  }
};
