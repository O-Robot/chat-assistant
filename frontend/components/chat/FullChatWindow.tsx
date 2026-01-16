"use client";

import { useState, useEffect, useRef } from "react";
import { useChatStore } from "@/store/chatStore";
import { Visitor, Message, UserRole, Status, User } from "@/types";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/bootstrap.css";
import {
  ArrowUp,
  EllipsisVertical,
  LogOut,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import {
  setUserCookie,
  setConversationCookie,
  getUserCookie,
  getConversationCookie,
  removeUserCookie,
  removeConversationCookie,
} from "@/lib/cookies";
import { v4 as uuidv4 } from "uuid";
import { DarkModeToggle } from "../shared/DarkModeToggle";
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Transition,
} from "@headlessui/react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { useToast } from "@/hooks/use-toast";

interface FullChatWindowProps {
  initialQuestion?: string;
  onClose: () => void;
}

export function FullChatWindow({
  initialQuestion = "",
  onClose,
}: FullChatWindowProps) {
  const router = useRouter();
  const { toast } = useToast();

  const { user, setUser, messages, receiveMessage } = useChatStore();
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

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const [textareaEl, setTextareaEl] = useState<HTMLTextAreaElement | null>();

  // Submit user form
  const handleUserSubmit = async (e: any) => {
    e.preventDefault();
    if (
      !form.firstName ||
      !form.lastName ||
      !form.email ||
      !form.phone ||
      !form.country
    )
      return toast({
        title: "Missing fields",
        description: "Please fill all required info.",
        variant: "destructive",
      });

    const res = await fetch("http://localhost:3001/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    const visitor: Visitor = {
      id: data.userId,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      phone: form.phone,
      country: form.country,
      conversationId: data.conversationId,
      role: UserRole.VISITOR,
      status: Status.ONLINE,
      avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.userId}&backgroundColor=b6e3f4`,
    };

    setUser(visitor);
    setUserCookie(visitor);
    setConversationCookie(data.conversationId);

    if (input.trim()) await handleSend();
  };

  // Send message
  const handleSend = async () => {
    if (!input.trim() || !user) return;
    setLoading(true);

    const message: Omit<Message, "id" | "timestamp"> = {
      conversationId: getConversationCookie()!,
      senderId: user.id,
      content: input,
    };

    const socket = (await import("@/lib/socket")).getSocket();
    socket.emit("send_message", {
      ...message,
      id: uuidv4(),
      timestamp: Date.now(),
    });

    setInput("");
    setLoading(false);
  };

  // Close conversation button
  const handleCloseConversation = () => {
    removeConversationCookie();
    onClose();
    // optionally emit socket to notify admin
  };

  // End session button
  const handleEndSession = () => {
    removeConversationCookie();
    removeUserCookie();
    setUser({
      id: "",
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      country: "",
      role: UserRole.VISITOR,
      status: Status.OFFLINE,
      avatarUrl: "",
    });
  };

  // Form for new user
  if (!user?.email) {
    return (
      <div className="fixed inset-0 bg-background  flex items-center justify-center z-50">
        <Card className="glass-morphism shadow-xl border-white/20">
          <CardHeader>
            <CardTitle className="text-primary-text flex items-center justify-center gap-2">
              Let’s get to know you 👋
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={(e) => handleUserSubmit(e)} className="space-y-6 ">
              <div className="flex gap-4">
                <Input
                  placeholder="First Name"
                  value={form.firstName}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      firstName: e.target.value,
                    })
                  }
                  required
                  className="glass-morphism border-white/20 text-primary-text/80 placeholder:text-primary-text/50"
                />
                <Input
                  placeholder="Last Name"
                  value={form.lastName}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      lastName: e.target.value,
                    })
                  }
                  required
                  className="glass-morphism border-white/20 text-primary-text/80 placeholder:text-primary-text/50"
                />
              </div>

              <div>
                <Input
                  type="email"
                  placeholder="Your Email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="glass-morphism border-white/20 text-primary-text/80 placeholder:text-primary-text/50"
                  required
                />
              </div>
              <div>
                <PhoneInput
                  country="ng"
                  value={form.phone}
                  onChange={(phone: string, country: any) => {
                    setForm({ ...form, phone, country: country.name });
                  }}
                  containerClass="!rounded-md"
                  inputClass="glass-morphism !py-3 !border-gray-300 border-none !w-[100%]"
                  dropdownClass="text-primary-text/80
                  "
                  inputProps={{ required: true }}
                />
              </div>

              <Button
                type="submit"
                className="w-full glass-morphism  text-primary-text/80 font-bold hover:text-primary hover:animate-glow hover:shadow-lg"
                size="lg"
              >
                Continue
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  console.log({ messages });

  // Chat window
  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex justify-between items-center p-4 border-b border-primary-text/20">
        <div
          className="flex items-center gap-2 cursor-pointer"
          onClick={() => router.push("https://ogooluwaniadewale.com/home")}
        >
          <Image
            src="/images/logo.png"
            alt="logo"
            className="rounded-full"
            width={32}
            height={32}
          />
        </div>
        {/* name */}
        <span className="font-medium text-skill-text">
          Ogooluwani's Assistant
        </span>

        {/* Menu  */}
        <div className="flex">
          <DarkModeToggle />
          <Menu as="div" className="relative">
            <MenuButton className="p-2 text-primary-text cursor-pointer rounded-lg">
              <EllipsisVertical size={20} />
            </MenuButton>
            <Transition
              enter="transition duration-100 ease-out"
              enterFrom="transform scale-95 opacity-0"
              enterTo="transform scale-100 opacity-100"
              leave="transition duration-75 ease-out"
              leaveFrom="transform scale-100 opacity-100"
              leaveTo="transform scale-95 opacity-0"
            >
              <MenuItems className="absolute right-0 mt-2 w-40 origin-top-right bg-background text-primary-text border rounded-lg shadow-lg focus:outline-none z-50 ">
                <MenuItem>
                  {({ active }: any) => (
                    <button
                      // onClick={() => handleSendChat()}
                      className={`${
                        active ? "bg-background" : ""
                      } flex items-center gap-2 w-full px-4 py-2 text-sm text-left hover:bg-skill-text hover:text-background rounded-lg cursor-pointer`}
                    >
                      <Send size={16} /> Send Chat
                    </button>
                  )}
                </MenuItem>
                <MenuItem>
                  {({ active }: any) => (
                    <button
                      onClick={handleCloseConversation}
                      className={`${
                        active ? "bg-background" : ""
                      } flex items-center gap-2 w-full px-4 py-2 text-sm text-left  hover:bg-skill-text hover:text-background rounded-lg cursor-pointer`}
                    >
                      <RotateCcw size={16} /> End Chat
                    </button>
                  )}
                </MenuItem>
                <MenuItem>
                  {({ active }: any) => (
                    <button
                      onClick={handleEndSession}
                      className={`${
                        active ? "bg-background" : ""
                      } flex items-center gap-2 w-full px-4 py-2 text-sm text-left hover:bg-skill-text hover:text-background text-red-600 rounded-lg cursor-pointer`}
                    >
                      <LogOut size={16} /> End Session
                    </button>
                  )}
                </MenuItem>
              </MenuItems>
            </Transition>
          </Menu>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex max-w-[80%] md:max-w-[60%] min-w-20 rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap wrap-break-word text-base items-end gap-3 ${
              msg.senderId === user.id
                ? "ml-auto justify-end text-right"
                : "mr-auto justify-start text-left flex-row-reverse"
            }`}
            style={{
              wordBreak: "break-word",
              overflowWrap: "anywhere",
            }}
          >
            {/* bubble box */}
            <div
              className={`relative inline-flex flex-col max-w-[85%] md:max-w-[70%] min-w-12 rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-base shadow-sm 
       ${
         msg.senderId === user.id
           ? "glass-morphism text-primary-text"
           : "bg-white/60 text-gray-900 border border-gray-200"
       }`}
            >
              {msg.content}
              <span className="mt-1 text-[11px] text-gray-500 self-end">
                {new Date(msg.timestamp).toLocaleTimeString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                })}
              </span>
            </div>
            <img
              className="w-7! h-7! rounded-full object-cover"
              src={
                msg.senderId === user.id ? user.avatarUrl : "/images/logo.png"
              }
              alt="avatar"
            />
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Section */}
      <div className={`px-4 py-5 flex items-center justify-center `}>
        <div
          className={`max-w-4xl w-full mx-auto relative shadow-xl border border-primary px-3 py-2 flex transition-all duration-300 rounded-2xl ease-in-out ${
            input.trim()
              ? "flex-col rounded-2xl"
              : "flex-row items-center rounded-4xl"
          }`}
          style={{
            transitionProperty:
              "border-radius, background-color, box-shadow, transform",
          }}
        >
          <div className="flex items-center w-full pr-3">
            <textarea
              ref={setTextareaEl as any}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onInput={(e) => {
                const ta = e.currentTarget as HTMLTextAreaElement;
                const maxHeight = 200;
                ta.style.height = "auto";
                const newHeight = Math.min(ta.scrollHeight, maxHeight);
                ta.style.height = `${newHeight}px`;
                ta.style.overflowY =
                  ta.scrollHeight > maxHeight ? "auto" : "hidden";
              }}
              onKeyDown={async (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  await handleSend();
                  if (textareaEl) {
                    textareaEl.style.height = "auto";
                    textareaEl.style.overflowY = "hidden";
                  }
                }
              }}
              placeholder="Ask me anything..."
              className="w-full resize-none bg-transparent p-2 pr-3 mb-1 text-base text-skill-text placeholder-primary-text/50 focus:outline-none focus:ring-0 max-h-50 overflow-hidden"
              style={{
                minHeight: "10px",
                paddingBottom: input.trim() ? "8px" : "4px",
              }}
            />
          </div>

          <div
            className={`flex ${
              input.trim() ? "justify-end w-full " : "items-end"
            }`}
          >
            <button
              onClick={async () => await handleSend()}
              aria-label="Send message"
              disabled={!input.trim()}
              className={`ml-2 flex items-center justify-center rounded-full p-2 transition-all duration-200 ${
                input.trim()
                  ? "bg-primary/80 text-white hover:opacity-90 cursor-pointer"
                  : "text-gray-400 cursor-not-allowed"
              }`}
            >
              <ArrowUp size={16} />
            </button>
          </div>
        </div>
      </div>
      <p className="text-center text-xs text-gray-500 py-2">
        © {new Date().getFullYear()} Ogooluwani Adewale
      </p>
    </div>
  );
}
