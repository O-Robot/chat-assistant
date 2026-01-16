"use client";

import { useState, useEffect, useRef } from "react";
import { useChatStore } from "@/store/chatStore";

import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/bootstrap.css";
import { setSessionId, setUserInfo } from "@/lib/storage";
import { ArrowUp } from "lucide-react";
import { Status, UserRole } from "@/types";
import { Input } from "../ui/input";
import { Button } from "../ui/button";

interface FullChatWindowProps {
  initialQuestion: string;
  onClose: () => void;
}

export function FullChatWindow({
  initialQuestion,
  onClose,
}: FullChatWindowProps) {
  const { user, setUser, messages } = useChatStore();
  const [input, setInput] = useState(initialQuestion || "");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    country: "",
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // const { toast } = useToast();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleUserSubmit = async (e: any) => {
    e.preventDefault();
    if (
      !form.firstName ||
      !form.lastName ||
      !form.email ||
      !form.phone ||
      !form.country
    ) {
      return 
      // toast({
      //   title: "Missing fields",
      //   description: "Please fill all required info.",
      //   variant: "destructive",
      // });
    }

    setUserInfo(form);

    const res = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (data.sessionId) setSessionId(data.sessionId);

    setUser({
      id: data.sessionId,
      ...form,
      role: UserRole.VISITOR,
      status: Status.ONLINE,
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.sessionId}&backgroundColor=b6e3f4`,
    });

    // send the pending question once user info is set
    if (input.trim()) {
      await handleSend();
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    setLoading(true);
    // await sendMessageFn(input);
    setInput("");
    setLoading(false);
  };

  if (!user?.firstName) {
    // show user info form
    return (
      <div className="flex flex-col items-center justify-center h-full w-full p-4">
        <form onSubmit={handleUserSubmit} className="space-y-4 w-full max-w-md">
          <div className="flex gap-2">
            <Input
              placeholder="First Name"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            />
            <Input
              placeholder="Last Name"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            />
          </div>
          <Input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <PhoneInput
            country="ng"
            value={form.phone}
            onChange={(phone: string, country: any) =>
              setForm({ ...form, phone, country: country.name })
            }
            containerClass="!rounded-md"
            inputClass="!w-full"
          />
          <Button type="submit" className="w-full">
            Continue
          </Button>
        </form>
      </div>
    );
  }

  // show chat once user info exists
  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex-1 overflow-y-auto p-4">
        {/* {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex max-w-[80%] ${
              msg.sender === "user"
                ? "ml-auto justify-end"
                : "mr-auto justify-start"
            }`}
          >
            <div
              className={`px-4 py-2 rounded-2xl ${
                msg.sender === "user" ? "glass-morphism" : "bg-white/60"
              }`}
            >
              {msg.message}
            </div>
          </div>
        ))} */}
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
