"use client";
import { useEffect, useState, useRef } from "react";

export default function ChatView({ chat }: any) {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const socketRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Load messages for selected session
  useEffect(() => {
    if (!chat) return;
    const fetchMsgs = async () => {
      const res = await fetch(
        `/api/admin/messages?sessionId=${chat.session_id}`
      );
      const data = await res.json();
      setMessages(data);
    };
    fetchMsgs();
  }, [chat]);

  // WebSocket setup
  useEffect(() => {
    if (!chat) return;
    const protocol = window.location.protocol === "https" ? "wss" : "ws";
    const wsUrl = `${protocol}://${window.location.host}/api/ws`;
    const socket = new WebSocket(wsUrl);
    socketRef.current = socket;

    socket.onopen = () => {
      setIsConnected(true);
      socket.send(
        JSON.stringify({
          type: "join",
          sessionId: chat.id,
        })
      );
    };

    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "message" && data.sessionId === chat.id && data.sender !== "admin") {
        setMessages((prev) => [...prev, data]);
      }
    };

    socket.onclose = () => setIsConnected(false);

    return () => {
      socket.close();
    };
  }, [chat]);

  const sendMessage = () => {
    if (!input.trim() || !chat || !socketRef.current) return;

    const msg = {
      type: "message",
      sessionId: chat.id,
      sender: "admin",
      message: input,
    };
    setMessages((prev) => [...prev, msg]);

    socketRef.current.send(JSON.stringify(msg));
    setInput("");
  };

  if (!chat)
    return (
      <div className="flex-1 flex items-center justify-center text-neutral-400">
        Select a chat to view conversation
      </div>
    );

  return (
    <div className="flex flex-col flex-1">
      <div className="p-4 border-b bg-white">
        <h3 className="font-semibold">{chat.name || chat.email}</h3>
        <p className="text-xs text-neutral-500">{chat.email}</p>
      </div>

      <div className="flex-1 overflow-y-auto bg-neutral-50 p-4 space-y-3">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[70%] p-3 rounded-2xl ${
              msg.sender === "admin"
                ? "bg-primary text-white ml-auto"
                : "bg-white border"
            }`}
          >
            <p className="text-sm">{msg.message}</p>
          </div>
        ))}
      </div>

      <div className="p-3 border-t flex gap-2 bg-white">
        <input
          type="text"
          placeholder="Type message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="flex-1 border rounded-lg px-3 py-2 text-sm"
        />
        <button
          onClick={sendMessage}
          disabled={!isConnected}
          className="bg-primary text-white rounded-lg px-4 py-2 text-sm disabled:opacity-60"
        >
          Send
        </button>
      </div>
    </div>
  );
}
