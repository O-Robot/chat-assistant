import { useEffect, useCallback } from "react";
import { useChatStore } from "@/store/chatStore";
import { getSocket, reconnectSocket, isSocketConnected } from "@/lib/socket";
import { Console } from "@/lib/constants";

export const useSocketConnection = () => {
  const { setConnectionStatus } = useChatStore();

  const checkAndReconnect = useCallback(() => {
    if (!isSocketConnected()) {
      Console.log("Connection check: Socket disconnected, reconnecting...");
      reconnectSocket();
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        Console.log("Page became visible");
        checkAndReconnect();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [checkAndReconnect]);

  useEffect(() => {
    const handleFocus = () => {
      Console.log("Window focused");
      checkAndReconnect();
    };

    window.addEventListener("focus", handleFocus);
    return () => window.removeEventListener("focus", handleFocus);
  }, [checkAndReconnect]);

  useEffect(() => {
    const handleOnline = () => {
      Console.log("Network online");
      setConnectionStatus("reconnecting");
      checkAndReconnect();
    };

    const handleOffline = () => {
      Console.log("Network offline");
      setConnectionStatus("disconnected");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [checkAndReconnect, setConnectionStatus]);

  useEffect(() => {
    const intervalId = setInterval(() => {
      checkAndReconnect();
    }, 30000);

    return () => clearInterval(intervalId);
  }, [checkAndReconnect]);

  useEffect(() => {
    checkAndReconnect();
  }, [checkAndReconnect]);

  return {
    checkAndReconnect,
    isConnected: isSocketConnected(),
  };
};
