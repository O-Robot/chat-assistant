"use client";
import { ChatWidget } from "@/components/widget/ChatWidget";
import { useChatStore } from "@/store/chatStore";
import { DarkModeToggle } from "@/components/shared/DarkModeToggle";
import { Status, UserRole } from "@/types";
import { useEffect, useState } from "react";
import { isChatDomain } from "@/lib/isChat";

import Image from "next/image";
import { ChatWindow } from "@/components/widget/ChatWindow";
import { FullChatWindow } from "@/components/chat/FullChatWindow";

export default function VisitorsPage() {
  const [isChatMode, setIsChatMode] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState("");

  const { user } = useChatStore();
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



  // 🔥 Dedicated chat domain → full chat UI
  if (!hideWidget) {
    return <ChatWidget />;
  }
  // 🔥 Dedicated chat domain → full chat UI
  return (
    <div className="flex flex-col h-screen bg-background text-center w-full">
      {!isChatMode && (
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
              Hi there 👋
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
      )}

      {isChatMode && (
        <FullChatWindow
          initialQuestion={pendingQuestion}
          onClose={() => {
            setIsChatMode(false);
            setPendingQuestion("");
          }}
        />
      )}
    </div>
  );
}
