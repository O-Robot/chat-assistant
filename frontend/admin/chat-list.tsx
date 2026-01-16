"use client";
import { useEffect, useState } from "react";

export default function ChatList({ onSelect }: any) {
  const [chats, setChats] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/admin/sessions");
      const data = await res.json();
      setChats(data);
    };
    load();

    // Auto-refresh every 10s for new sessions
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="w-80 border-r bg-white overflow-y-auto">
      <h2 className="px-4 py-3 font-medium border-b">Active Sessions</h2>
      {chats.length === 0 && (
        <p className="text-sm text-neutral-500 p-4">No chats yet</p>
      )}
      {chats?.map((chat) => (
        <div
          key={chat.id}
          onClick={() => onSelect(chat)}
          className="px-4 py-3 border-b hover:bg-neutral-100 cursor-pointer transition"
        >
          <p className="font-medium text-sm">
            {chat.name || chat.email || "Unnamed"}
          </p>
          <p className="text-xs text-neutral-500 truncate">
            {chat.last_message || "No messages yet"}
          </p>
        </div>
      ))}
    </div>
  );
}
