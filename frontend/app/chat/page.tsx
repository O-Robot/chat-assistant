"use client";
import { ChatWidget } from "@/components/widget/ChatWidget";
import { useChatStore } from "@/store/chatStore";
import { DarkModeToggle } from "@/components/shared/DarkModeToggle";
import { Status, UserRole, Visitor } from "@/types";
import { useEffect, useState } from "react";
import { isChatDomain } from "@/lib/isChat";

import Image from "next/image";
import { ChatWindow } from "@/components/widget/ChatWindow";
import { FullChatWindow } from "@/components/chat/FullChatWindow";
import {
  getConversationCookie,
  getUserCookie,
  removeConversationCookie,
  removeUserCookie,
  setConversationCookie,
  setUserCookie,
} from "@/lib/cookies";
import { Loader } from "lucide-react";

export default function VisitorsPage() {
  const [isChatMode, setIsChatMode] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [loading, setLoading] = useState(true);
  const { user, setUser, messages, receiveMessage } = useChatStore();

  const hideWidget = isChatDomain();

  const suggestedQuestions = [
    "Website pricing",
    "Contract terms",
    "How to start a project",
    "Available services",
  ];

  const handleQuestionClick = (question: string) => {
    setPendingQuestion(question);
    setIsChatMode(true); // switch to chat mode
  };
  useEffect(() => {
    const storedUser = getUserCookie();
    const storedConversation = getConversationCookie();

    if (storedConversation) {
      setIsChatMode(true);
    }

    if (storedUser?.id) {
      (async () => {
        try {
          const res = await fetch(
            `http://localhost:3001/api/users/${storedUser.id}`
          );
          if (!res.ok) throw new Error("User not found");
          const data: {
            user: Visitor;
            conversation: { id: string; status: string } | null;
          } = await res.json();

          setUser({
            ...data.user,
            role: UserRole.VISITOR,
            status: Status.ONLINE,
            avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.user.id}&backgroundColor=b6e3f4`,
          });
          setUserCookie(data.user);

          // If conversation exists and open, use it; else remove
          if (data.conversation?.status === "open") {
            setConversationCookie(data.conversation.id);
          } else {
            removeConversationCookie();
            setIsChatMode(false);
          }
        } catch {
          removeUserCookie();
          removeConversationCookie();
          setIsChatMode(false);
        } finally {
          setLoading(false);
        }
      })();
    } else {
      setLoading(false);
    }
  }, [setUser]);

  // 🔥 Dedicated chat domain → full chat UI
  if (!hideWidget) {
    return <ChatWidget />;
  }

  // 🔥 full chat UI
  return (
    <div className="flex flex-col h-screen bg-background text-center w-full">
      {loading ? (
        <Loader className="animate-spin text-primary" />
      ) : isChatMode ? (
        <FullChatWindow
          initialQuestion={pendingQuestion}
          onClose={() => {
            setIsChatMode(false);
            setPendingQuestion("");
          }}
        />
      ) : !isChatMode ? (
        <>
          <div className="absolute top-4 right-4">
            <DarkModeToggle />
          </div>

          <div className="h-full flex flex-col items-center justify-center text-center px-4">
            <Image
              src="/images/logo.png"
              alt="logo"
              width={80}
              height={80}
              className="mb-4"
            />
            <h1 className="text-2xl text-primary-text font-semibold mb-2">
              Hi {user?.firstName || "there"} 👋
            </h1>
            <p className="text-gray-600 mb-6">How may I help you today?</p>

            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {suggestedQuestions.map((q, i) => (
                <button
                  key={i}
                  onClick={() => handleQuestionClick(q)}
                  className="cursor-pointer px-4 py-2 glass-morphism text-primary-text shadow-lg rounded-full hover:bg-gray-100 text-sm"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : (
        ""
      )}
    </div>
  );
}
