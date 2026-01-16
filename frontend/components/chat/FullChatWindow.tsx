"use client";

import { useState, useEffect, useRef } from "react";
import { useChatStore } from "@/store/chatStore";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/bootstrap.css";
import { ArrowUp } from "lucide-react";
import { Status, UserRole } from "@/types";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Visitor, Message } from "@/types";

interface FullChatWindowProps {
  initialQuestion?: string;
  onClose: () => void;
}

export function FullChatWindow({
  initialQuestion = "",
  onClose,
}: FullChatWindowProps) {
  const { user, setUser, messages, addMessage } = useChatStore();
  const [input, setInput] = useState(initialQuestion);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    country: "",
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll chat to bottom whenever messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- Submit visitor info ---
  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !form.firstName ||
      !form.lastName ||
      !form.email ||
      !form.phone ||
      !form.country
    ) {
      // TODO: toast missing fields
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("http://localhost:3001/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data: { userId: string; conversationId: string } = await res.json();

      if (!data.userId || !data.conversationId)
        throw new Error("Failed to create visitor");

      const visitor: Visitor = {
        id: data.userId,
        conversationId: data.conversationId,
        firstName: form.firstName,
        lastName: form.lastName,
        email: form.email,
        phone: form.phone,
        country: form.country,
        role: UserRole.VISITOR,
        status: Status.ONLINE,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.userId}&backgroundColor=b6e3f4`,
        ipAddress: undefined,
        lastSeen: Date.now(),
      };

      setUser(visitor);

      // Send pending question automatically
      if (input.trim()) {
        await handleSend();
      }
    } catch (err) {
      console.error(err);
      // TODO: show error toast
    } finally {
      setLoading(false);
    }
  };

  // --- Send message ---
  const handleSend = async () => {
    if (!input.trim() || !user) return;

    setLoading(true);
    const newMessage: Message = {
      id: crypto.randomUUID(),
      conversationId: (user as Visitor).conversationId,
      senderId: user.id,
      content: input,
      timestamp: Date.now(),
      status: "sent",
    };

    // TODO: send to backend / socket
    addMessage(newMessage);

    setInput("");
    setLoading(false);
  };

  // --- Render: User info form ---
  if (!user || user.role !== UserRole.VISITOR) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full p-4">
        <form onSubmit={handleUserSubmit} className="space-y-4 w-full max-w-md">
          <div className="flex gap-2">
            <Input
              placeholder="First Name"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              required
            />
            <Input
              placeholder="Last Name"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              required
            />
          </div>

          <Input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />

          <PhoneInput
            country="ng"
            value={form.phone}
            onChange={(phone: string, country: any) =>
              setForm({ ...form, phone, country: country.name })
            }
            containerClass="!rounded-md"
            inputClass="!w-full"
            inputProps={{ required: true }}
          />

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Submitting..." : "Continue"}
          </Button>
        </form>
      </div>
    );
  }

  // --- Render: Chat window ---
  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex max-w-[80%] ${
              msg.senderId === user.id
                ? "ml-auto justify-end"
                : "mr-auto justify-start"
            }`}
          >
            <div
              className={`px-4 py-2 rounded-2xl ${
                msg.senderId === user.id ? "glass-morphism" : "bg-white/60"
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 flex items-center border-t border-primary-text/10">
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={async (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              await handleSend();
            }
          }}
          placeholder="Ask me anything..."
          className="flex-1 resize-none p-2 rounded-lg border"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || loading}
          className="ml-2 p-2 rounded-full bg-blue-500 text-white"
        >
          <ArrowUp size={16} />
        </button>
      </div>
    </div>
  );
}
