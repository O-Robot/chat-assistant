import { useChatStore } from "@/store/chatStore";
import { WifiOff, Loader2 } from "lucide-react";

export const ReconnectionIndicator = () => {
  const { connectionStatus, isReconnecting, reconnectAttempt, hasConnectedOnce } = useChatStore();
  if (
    !hasConnectedOnce ||
    (connectionStatus === "connected" && !isReconnecting)
  ) {
    return null;
  }

  return (
    <div className="absolute left-1/2 top-3 z-50 -translate-x-1/2" role="status" aria-live="polite">
      <div
        className={`
          flex items-center gap-2 whitespace-nowrap px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm text-xs
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
            <span className="font-medium">
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
