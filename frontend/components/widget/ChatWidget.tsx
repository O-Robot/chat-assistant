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

  return (
    <>
      {isOpen && <ChatWindow onClose={() => setIsOpen(false)} />}

      <button
        onClick={() => setIsOpen(true)}
        className={`fixed bottom-0 md:bottom-3 right-3 z-50 flex items-center justify-center w-14 h-14 rounded-full transition-all duration-300 ease-in-out transform hover:scale-90 bg-primary cursor-pointer ${
          isOpen ? "scale-0" : "scale-100"
        }`}
        aria-label="Open chat"
      >
        {user ? (
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
        <div
          onClick={() => setIsOpen(true)}
          className="fixed bottom-18 md:bottom-21 right-3 z-50 max-w-xs bg-white dark:bg-gray-800 rounded-lg shadow-lg p-4 transform transition-all duration-300 ease-in-out animate-fade-in cursor-pointer "
        >
          <p className="text-sm text-gray-800 dark:text-white">
            Hi {user?.firstName || "there"}! 👋 How can I help you today?
          </p>
          <div className="absolute -bottom-2 right-6 w-4 h-4 bg-white dark:bg-gray-800 transform rotate-45" />
        </div>
      )}
    </>
  );
}
