// app/chat/page.tsx
"use client";
import { useChatStore } from "@/store/chatStore";
import { DarkModeToggle } from "@/components/shared/DarkModeToggle";
import { Status, UserRole, Visitor } from "@/types";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  getConversationCookie,
  getUserCookie,
  removeConversationCookie,
  removeUserCookie,
  setUserCookie,
} from "@/lib/cookies";
import { Loader2 } from "lucide-react";
import { FullChatWindow } from "@/components/chat/FullChatWindow";

export default function VisitorsPage() {
  const [isChatMode, setIsChatMode] = useState(false);
  const [pendingQuestion, setPendingQuestion] = useState("");
  const [loading, setLoading] = useState(true);
  const { user, setUser } = useChatStore();

  const suggestedQuestions = [
    "Hi, I’ll like to develop a website",
    "What technologies do you use?",
    "What does a typical project budget look like?",
    "How to start a project?",
    "How long does it take to develop a website?",
  ];

  const handleQuestionClick = (question: string) => {
    setPendingQuestion(question);
    setIsChatMode(true);
  };

  useEffect(() => {
    const initializeUser = async () => {
      setLoading(true);

      const storedUser = getUserCookie();
      const storedConversation = getConversationCookie();

      // If no user cookie, we're done loading
      if (!storedUser?.id) {
        setLoading(false);
        return;
      }

      if (storedUser && storedConversation) {
        setIsChatMode(true);
      }

      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/users/${storedUser.id}`,
        );

        if (!res.ok) {
          throw new Error("User not found");
        }

        const data: {
          user: Visitor;
          conversation: { id: string; status: string } | null;
        } = await res.json();

        // Set user in store
        setUser({
          ...data.user,
          role: UserRole.VISITOR,
          status: Status.ONLINE,
        });

        setUserCookie(data.user);
      } catch (error) {
        console.error("Error initializing user:", error);
        removeUserCookie();
        removeConversationCookie();
        setIsChatMode(false);
      } finally {
        setLoading(false);
      }
    };

    initializeUser();
  }, [setUser]);

  //? Show loading state
  if (loading) {
    return (
      <div className="flex flex-col h-screen bg-background items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  //? Show full chat UI
  return (
    <div className="flex flex-col h-screen bg-background text-center w-full">
      {isChatMode ? (
        <FullChatWindow
          initialQuestion={pendingQuestion}
          onClose={() => {
            setIsChatMode(false);
            setPendingQuestion("");
          }}
        />
      ) : (
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
                  className="cursor-pointer px-4 py-2 glass-morphism text-primary-text shadow-lg rounded-full hover:bg-gray-100 text-sm transition-all duration-200 hover:scale-105"
                >
                  {q}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setIsChatMode(true);
              }}
              className="cursor-pointer my-3 px-4 py-2 glass-morphism text-primary-text shadow-lg rounded-full hover:bg-gray-100 text-sm transition-all duration-200 hover:scale-105"
            >
              Have a Chat
            </button>
          </div>
        </>
      )}
    </div>
  );
}
