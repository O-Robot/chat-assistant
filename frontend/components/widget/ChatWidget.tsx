"use client";

import { useState, useEffect } from "react";
import { ChatWindow } from "@/components/widget/ChatWindow";
import { useChatStore } from "@/store/chatStore";
import { Avatar } from "@/components/widget/Avatar";
import { getUserCookie, getConversationCookie } from "@/lib/cookies";
import { Status, UserRole } from "@/types";

export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const {
    user,
    setUser,
    unreadCount,
    resetUnreadCount,
    setIsChatFocused,
    initializeSocketListeners,
    loadMessagesFromLocalStorage,
  } = useChatStore();

  // Initialize user from cookies on mount
  useEffect(() => {
    const initializeUser = () => {
      const storedUser = getUserCookie();
      const conversationId = getConversationCookie();

      if (storedUser?.id) {
        // Set user in store
        setUser({
          ...storedUser,
          role: UserRole.VISITOR,
          status: Status.ONLINE,
        });

        if (conversationId) {
          loadMessagesFromLocalStorage(conversationId);
        }
      }

      setIsInitialized(true);
    };

    initializeUser();
  }, [setUser, loadMessagesFromLocalStorage]);

  // Initialize socket listeners
  useEffect(() => {
    if (isInitialized) {
      initializeSocketListeners();
    }
  }, [isInitialized, initializeSocketListeners]);

  useEffect(() => {
    setIsChatFocused(isOpen);

    if (isOpen) {
      resetUnreadCount();
    }
  }, [isOpen, setIsChatFocused, resetUnreadCount]);

  useEffect(() => {
    if (window.parent !== window) {
      window.parent.postMessage({ type: "CHAT_STATE_CHANGED", isOpen }, "*");
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "THEME_UPDATE") {
        const isDark = event.data.theme === "dark";
        document.documentElement.classList.toggle("dark", isDark);
      }
    };
    window.addEventListener("message", handler);
    window.parent.postMessage({ type: "WIDGET_READY" }, "*");

    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <>
      {isOpen && (
        <div id="portfolio-chat-window" className="fixed inset-0 z-50">
          <ChatWindow onClose={() => setIsOpen(false)} />
        </div>
      )}

      <button
        onClick={() => setIsOpen(true)}
        aria-label="Open chat with Ogooluwani"
        aria-expanded={isOpen}
        aria-controls="portfolio-chat-window"
        className={`fixed bottom-3 right-3 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary shadow-lg shadow-primary/30 transition duration-200 hover:-translate-y-0.5 hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
          isOpen ? "scale-0" : "scale-100"
        }`}
      >
        {user && user.email ? (
          <div className="relative">
            <Avatar user={user} />
            {unreadCount > 0 && (
              <span className="absolute -top-3 -right-2 w-5 h-5 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
        ) : (
          <svg
            className="w-7 h-7 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>
        )}
      </button>

      {!isOpen && unreadCount === 0 && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-20 right-3 z-50 max-w-[17rem] rounded-2xl border border-primary/10 bg-white p-4 text-left shadow-lg shadow-primary/10 motion-safe:animate-fade-in dark:bg-slate-900"
        >
          <p className="text-sm font-medium text-gray-800 dark:text-white">
            Hi {user?.firstName || "there"}! 👋 How can I help you today?
          </p>
          <span className="mt-1 block text-xs text-secondary-text">Usually replies in a moment</span>
          <span className="absolute -bottom-2 right-6 h-4 w-4 rotate-45 border-b border-r border-primary/10 bg-white dark:bg-slate-900" />
        </button>
      )}
    </>
  );
}
