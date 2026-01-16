"use client";
import { ChatWidget } from "@/components/visitor/ChatWidget";
import { useChatStore } from "@/store/chatStore";
import { DarkModeToggle } from "@/components/shared/DarkModeToggle";
import { Status, UserRole } from "@/types";
import { useEffect } from "react";

import Image from "next/image";

export default function VisitorsPage() {
  const { user, setUser } = useChatStore();

  useEffect(() => {
    // Initialize visitor user if not already set
    if (!user) {
      // Try to get existing visitor ID from sessionStorage
      const existingVisitorId = sessionStorage.getItem("visitor-id");
      const visitorId = existingVisitorId || crypto.randomUUID();

      // If this is a new visitor, save the ID
      if (!existingVisitorId) {
        sessionStorage.setItem("visitor-id", visitorId);
      }

      setUser({
        id: visitorId,
        name: `Visitor ${visitorId.slice(0, 4)}`,
        role: UserRole.VISITOR,
        status: Status.ONLINE,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${visitorId}&backgroundColor=b6e3f4`,
      });
    }
  }, [user, setUser]);
  return (
    <div className="flex flex-col h-screen bg-background text-center w-full">
      <div className="text-center mb-16">
        <div className="absolute top-4 right-4">
          <DarkModeToggle />
        </div>
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
          Hi {"there"} 👋
        </h1>
        <p className="text-gray-600 mb-6">How may I help you today?</p>

        <div className="flex flex-wrap justify-center gap-2 max-w-md">
          {[
            "Website pricing",
            "Contract terms",
            "How to start a project",
            "Available services",
          ].map((q, i) => (
            <button
              key={i}
              //   onClick={() => setInput(q)}
              className="cursor-pointer px-4 py-2 glass-morphism text-primary-text shadow-lg rounded-full hover:bg-gray-100 text-sm"
            >
              {q}
            </button>
          ))}
        </div>
      </div>
      <ChatWidget />
    </div>
  );
}
