import { useChatStore } from "@/store/chatStore";
import { WifiOff, Loader2 } from "lucide-react";

export const ReconnectionIndicator = () => {
  const { connectionStatus, isReconnecting, reconnectAttempt } = useChatStore();
  if (connectionStatus === "connected" && !isReconnecting) {
    return null;
  }

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50">
      <div
        className={`
          flex items-center gap-2 px-4 py-2 rounded-full shadow-lg backdrop-blur-sm
          ${
            connectionStatus === "reconnecting"
              ? "bg-yellow-500/90 text-white"
              : "bg-red-500/90 text-white"
          }
        `}
      >
        {connectionStatus === "reconnecting" ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm font-medium">
              Reconnecting{reconnectAttempt > 0 ? ` (${reconnectAttempt})` : ""}
              ...
            </span>
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4" />
            <span className="text-sm font-medium">Connection lost</span>
          </>
        )}
      </div>
    </div>
  );
};
