/* eslint-disable @next/next/no-img-element */
"use client";

import { useConfirmationModal } from "@/hooks/use-modal";
import { useToast } from "@/hooks/use-toast";
import { useSocketConnection } from "@/hooks/useSocketConnection";
import { userApi } from "@/lib/axios";
import { sanitizedContent } from "@/lib/constants";
import {
  getConversationCookie,
  getUserCookie,
  removeConversationCookie,
  removeUserCookie,
  setConversationCookie,
  setUserCookie,
} from "@/lib/cookies";
import { getSocket } from "@/lib/socket";
import { useChatStore } from "@/store/chatStore";
import { Message, Status, UserRole, Visitor } from "@/types";
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Transition,
} from "@headlessui/react";
import {
  ArrowUp,
  EllipsisVertical,
  Loader2,
  LogOut,
  Minimize,
  RotateCcw,
  Send,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/bootstrap.css";
import { ConfirmationModal } from "../shared/ConfirmationModal";
import { DarkModeToggle } from "../shared/DarkModeToggle";
import { ReconnectionIndicator } from "../shared/ReconnectionIndicator";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Input } from "../ui/input";

interface FullChatWindowProps {
  initialQuestion?: string;
  onClose: () => void;
}

export function FullChatWindow({
  initialQuestion = "",
  onClose,
}: FullChatWindowProps) {
  useSocketConnection();
  const router = useRouter();
  const { toast } = useToast();

  const {
    user,
    setUser,
    messages,
    receiveMessage,
    clearMessages,
    startTyping,
    stopTyping,
    typingUsers,
    onlineUsers,
    isLoadingMessages,
    isSendingMessage,
    isAIResponding,
    setLoadingMessages,
    loadMessagesFromLocalStorage,
    saveMessagesToLocalStorage,
    sendMessage,
    initializeSocketListeners,
    setHasPlayedNotificationOnLoad,
  } = useChatStore();

  const [input, setInput] = useState(initialQuestion);
  const [isSubmittingForm, setIsSubmittingForm] = useState(false);
  const [isFocus, setFocus] = useState(false);
  const [conversationClosed, setConversationClosed] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    country: "",
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesListRef = useRef<HTMLDivElement>(null);
  const preserveScrollPositionRef = useRef(false);

  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const confirmation = useConfirmationModal();

  //? scroll to bottom
  useEffect(() => {
    if (preserveScrollPositionRef.current) {
      preserveScrollPositionRef.current = false;
      return;
    }
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, typingUsers]);

  // Initialize socket listeners once
  useEffect(() => {
    initializeSocketListeners();

    const socket = getSocket();
    socket.on("conversation_closed", () => {
      setConversationClosed(true);
    });

    return () => {
      socket.off("conversation_closed");
    };
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoadingMessages(true);
      const userCookie = getUserCookie();
      const conversationId = getConversationCookie();

      if (!userCookie?.id) {
        clearMessages();
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
        setLoadingMessages(false);
        return;
      }

      if (!conversationId) {
        clearMessages();
        setUser(userCookie);
        setLoadingMessages(false);
        handleStartNewConversation();
        return;
      }

      // Load from local storage first
      loadMessagesFromLocalStorage(conversationId);
      setUser(userCookie);

      // Then fetch from server and update
      try {
        const response = await userApi.get(
          `/api/conversations/${conversationId}/messages/`,
        );
        const msgs: Message[] = response.data.messages || response.data;

        clearMessages();
        msgs.forEach(receiveMessage);
        setNextCursor(response.data.nextCursor || null);
        setLoadError(null);
        setLoadingMessages(false);
        msgs.forEach((msg) => {
          receiveMessage(msg);
          if (msg.content?.includes("conversation has been closed")) {
            setConversationClosed(true);
          }
        });
        saveMessagesToLocalStorage(conversationId);

        // Mark that we've loaded initial messages
        setTimeout(() => {
          setHasPlayedNotificationOnLoad(true);
        }, 1000);
      } catch (error) {
        console.error("Error loading messages:", error);
        setLoadError(
          "We could not refresh this conversation. Your saved messages are still available.",
        );
      } finally {
        setLoadingMessages(false);
      }
    };

    loadData();
  }, []);

  const loadOlderMessages = async () => {
    const conversationId = getConversationCookie();
    if (!conversationId || !nextCursor || isLoadingOlder) return;

    const list = messagesListRef.current;
    const previousHeight = list?.scrollHeight || 0;
    const previousTop = list?.scrollTop || 0;
    preserveScrollPositionRef.current = true;
    setIsLoadingOlder(true);

    try {
      const response = await userApi.get(
        `/api/conversations/${conversationId}/messages/`,
        {
          params: { before: nextCursor, limit: 50 },
        },
      );
      const olderMessages: Message[] = response.data.messages || [];
      olderMessages.forEach(receiveMessage);
      setNextCursor(response.data.nextCursor || null);
      requestAnimationFrame(() => {
        if (list)
          list.scrollTop = previousTop + (list.scrollHeight - previousHeight);
      });
    } catch (error) {
      console.error("Error loading older messages:", error);
      toast({
        title: "Couldn’t load earlier messages",
        description: "Check your connection and try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoadingOlder(false);
    }
  };

  // Socket listeners for typing
  useEffect(() => {
    if (!user) return;

    const socket = getSocket();
    const conversationId = getConversationCookie();

    const handleTypingStart = (typingUser: {
      id: string;
      conversationId: string;
    }) => {
      if (
        typingUser.id !== user?.id &&
        typingUser.conversationId === conversationId
      ) {
        startTyping(typingUser.id);
      }
    };

    const handleTypingStop = (typingUser: {
      id: string;
      conversationId: string;
    }) => {
      if (
        typingUser.id !== user?.id &&
        typingUser.conversationId === conversationId
      ) {
        stopTyping(typingUser.id);
      }
    };

    socket.on("user_typing", handleTypingStart);
    socket.on("user_stopped_typing", handleTypingStop);

    return () => {
      socket.off("user_typing", handleTypingStart);
      socket.off("user_stopped_typing", handleTypingStop);
    };
  }, [user?.id]);

  //typing
  const startTypingEmit = () => {
    const socket = getSocket();
    const conversationId = getConversationCookie();
    if (!conversationId) return;

    // Send immediately
    socket.emit("typing_start", conversationId);

    // Keep alive while focused
    if (!typingIntervalRef.current) {
      typingIntervalRef.current = setInterval(() => {
        socket.emit("typing_start", conversationId);
      }, 2000);
    }
  };

  const stopTypingEmit = () => {
    const socket = getSocket();
    const conversationId = getConversationCookie();
    if (!conversationId) return;

    socket.emit("typing_stop", conversationId);

    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }
  };

  useEffect(() => {
    if (isFocus) {
      startTypingEmit();
    } else {
      stopTypingEmit();
    }

    return () => {
      stopTypingEmit();
    };
  }, [isFocus]);

  //! Handle user form submission
  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (
      !form.firstName ||
      !form.lastName ||
      !form.email ||
      !form.phone ||
      !form.country
    ) {
      toast({
        title: "Missing fields",
        description: "Please fill all required info.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmittingForm(true);

    try {
      const response = await userApi.post("/api/users", form);
      const data = response.data;
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
        avatarUrl: ``,
      };

      setUser(visitor);
      setUserCookie(visitor);
      setConversationCookie(data.conversationId);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create user. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmittingForm(false);
    }
  };

  //! Send message
  const handleSend = async () => {
    const isAdminMode = onlineUsers.has("admin") && !onlineUsers.has("system");

    if (!isAdminMode && isAIResponding) {
      toast({
        title: "Please wait",
        description: "Robot is thinking... Please wait for the response.",
        variant: "default",
      });
      return;
    }
    if (!input.trim() || !user || isSendingMessage) return;

    const conversationId = getConversationCookie();
    if (!conversationId) return;

    const message: Omit<Message, "id" | "timestamp"> = {
      conversationId,
      senderId: user.id,
      content: input.trim(),
    };

    setInput("");

    // Reset textarea height
    if (textareaRef?.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.overflowY = "hidden";
    }

    await sendMessage(message);
    textareaRef.current?.blur();
  };

  //! Send transcript
  const handleSendTranscript = async () => {
    const conversationId = getConversationCookie();
    if (!conversationId || !user?.email) return;

    confirmation.showConfirmation({
      title: "Send Transcript?",
      message: `We'll send a copy of this conversation to ${user.email}. Continue?`,
      confirmText: "Send",
      cancelText: "Cancel",
      variant: "info",
      onConfirm: async () => {
        try {
          await userApi.post(
            `/api/conversations/${conversationId}/send-transcript`,
            {
              email: user.email,
            },
          );

          toast({
            title: "Success",
            description: "Transcript has been sent to your email!",
          });
        } catch (error) {
          toast({
            title: "Error",
            description: "Failed to send transcript. Please try again.",
            variant: "destructive",
          });
        }
      },
    });
  };

  //! Close conversation
  const handleCloseConversation = () => {
    confirmation.showConfirmation({
      title: "End Chat?",
      message:
        "Are you sure you want to end this conversation? You can start a new one anytime.",
      confirmText: "End Chat",
      cancelText: "Cancel",
      variant: "warning",
      onConfirm: () => {
        const socket = getSocket();
        const conversationId = getConversationCookie();

        if (conversationId) {
          socket.emit("close_conversation", conversationId);
        }

        setConversationClosed(true);
      },
    });
  };

  //! End session
  const handleEndSession = () => {
    confirmation.showConfirmation({
      title: "End Session?",
      message:
        "This will log you out completely and end your session. Are you sure?",
      confirmText: "End Session",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: () => {
        const socket = getSocket();
        const conversationId = getConversationCookie();

        if (conversationId) {
          socket.emit("close_conversation", conversationId);
        }

        removeConversationCookie();
        removeUserCookie();
        clearMessages();
        setConversationClosed(true);

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

        onClose();
      },
    });
  };

  //! Start new conversation
  const handleStartNewConversation = async () => {
    if (!user?.id) return;

    try {
      const response = await userApi.post("/api/conversations/new", {
        userId: user.id,
      });

      const data = response.data;

      // Clear old state
      clearMessages();
      setConversationCookie(data.conversationId);
      setConversationClosed(false);
      setNextCursor(null);
      setLoadError(null);
      setFocus(false);

      // Re-initialise socket listeners for the new conversation
      initializeSocketListeners();

      const socket = getSocket();

      // Explicitly re-join the new conversation room
      socket.emit("user_join", {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role || UserRole.VISITOR,
        status: user.status || Status.ONLINE,
        conversationId: data.conversationId,
      });

      toast({
        title: "New conversation started",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start new conversation.",
        variant: "destructive",
      });
    }
  };

  const handleKeyDown = (e: any) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Check if admin/system is online
  const isAdminOnline = onlineUsers.has("admin");
  const isSystemOnline = onlineUsers.has("system");

  // Form for new user
  if (!user?.email) {
    return (
      <div className="fixed inset-0 bg-background flex items-center justify-center z-50 m-4">
        <Card className="glass-morphism shadow-xl border-white/20">
          <CardHeader>
            <CardTitle className="text-primary-text flex items-center justify-center gap-2">
              Let&apos;s get to know you 👋
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUserSubmit} className="space-y-6">
              <div className="flex gap-4">
                <Input
                  placeholder="First Name"
                  value={form.firstName}
                  onChange={(e) =>
                    setForm({ ...form, firstName: e.target.value })
                  }
                  required
                  disabled={isSubmittingForm}
                  className="glass-morphism border-white/20 text-primary-text/80 placeholder:text-primary-text/50"
                />
                <Input
                  placeholder="Last Name"
                  value={form.lastName}
                  onChange={(e) =>
                    setForm({ ...form, lastName: e.target.value })
                  }
                  required
                  disabled={isSubmittingForm}
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
                  disabled={isSubmittingForm}
                />
              </div>
              <div>
                <PhoneInput
                  country="ng"
                  value={form.phone}
                  onChange={(phone: string, country: any) => {
                    setForm({ ...form, phone, country: country.name });
                  }}
                  disabled={isSubmittingForm}
                  containerClass="!rounded-md"
                  inputClass="glass-morphism !py-3 !border-gray-300 border-none !w-[100%] text-primary-text/80! placeholder:text-primary-text/50"
                  dropdownClass="text-primary-text/80"
                  inputProps={{ required: true }}
                />
              </div>

              <Button
                type="submit"
                className="w-full glass-morphism text-primary-text/80 font-bold hover:text-primary hover:animate-glow hover:shadow-lg"
                size="lg"
                disabled={isSubmittingForm}
              >
                {isSubmittingForm ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Please wait...
                  </>
                ) : (
                  "Continue"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      <ReconnectionIndicator />
      <div className="flex justify-between items-center p-4 border-b border-primary-text/20">
        <button
          type="button"
          aria-label="Return to portfolio"
          className="flex items-center gap-2 rounded-lg p-1 transition hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-primary"
          onClick={() => router.push("https://ogooluwaniadewale.com/home")}
        >
          <Image
            src="/images/logo.png"
            alt="logo"
            className="rounded-full"
            width={32}
            height={32}
          />
        </button>

        {/* Name and status */}
        <div className="flex flex-col items-center">
          <span className="font-medium text-skill-text">
            Ogooluwani&apos;s Chat
          </span>
          <span className="text-xs text-gray-500">
            <span className="text-xs text-gray-500">
              {isSystemOnline ? (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-primary  rounded-full animate-pulse" />
                  Robot Online
                </span>
              ) : isAdminOnline ? (
                <span className="flex items-center gap-1 text-primary">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  Ogooluwani Online
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full" />
                  Offline
                </span>
              )}
            </span>
          </span>
        </div>

        {/* Menu */}
        <div className="flex">
          {process.env.NEXT_PUBLIC_PORTFOLIO_URL && (
            <button
              aria-label="Return to portfolio"
              onClick={() =>
                router.push(
                  process.env.NEXT_PUBLIC_PORTFOLIO_URL + "/home" || "",
                )
              }
              className="p-2 text-primary-text rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
            >
              <Minimize size={18} />
            </button>
          )}
          <DarkModeToggle />
          <Menu as="div" className="relative">
            <MenuButton
              aria-label="Conversation options"
              className="p-2 text-primary-text cursor-pointer rounded-lg focus-visible:outline-2 focus-visible:outline-primary"
            >
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
              <MenuItems className="absolute right-0 mt-2 w-40 origin-top-right bg-background text-primary-text border rounded-lg shadow-lg focus:outline-none z-50">
                <MenuItem>
                  {({ active }: any) => (
                    <button
                      onClick={handleSendTranscript}
                      className={`${
                        active ? "bg-background" : ""
                      } flex items-center gap-2 w-full px-4 py-2 text-sm text-left hover:bg-skill-text hover:text-background rounded-lg cursor-pointer`}
                    >
                      <Send size={16} /> Send Transcript
                    </button>
                  )}
                </MenuItem>
                {!conversationClosed && (
                  <>
                    <MenuItem>
                      {({ active }: any) => (
                        <button
                          onClick={handleCloseConversation}
                          className={`${
                            active ? "bg-background" : ""
                          } flex items-center gap-2 w-full px-4 py-2 text-sm text-left hover:bg-skill-text hover:text-background rounded-lg cursor-pointer`}
                        >
                          <RotateCcw size={16} /> End Chat
                        </button>
                      )}
                    </MenuItem>
                  </>
                )}
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

      <div
        ref={messagesListRef}
        className="flex-1 overflow-y-auto overscroll-contain p-4"
        aria-label="Conversation messages"
      >
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3 text-center text-sm text-secondary-text">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <span>Loading your conversation…</span>
            </div>
          </div>
        ) : (
          <>
            {loadError && (
              <div
                role="status"
                className="mb-4 rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
              >
                {loadError}
              </div>
            )}
            {nextCursor && (
              <div className="mb-5 flex justify-center">
                <button
                  onClick={loadOlderMessages}
                  disabled={isLoadingOlder}
                  className="rounded-full border border-primary/20 bg-white/70 px-3 py-1.5 text-xs font-medium text-primary transition hover:bg-primary/10 disabled:cursor-wait disabled:opacity-60 dark:bg-white/5"
                >
                  {isLoadingOlder
                    ? "Loading earlier messages…"
                    : "Load earlier messages"}
                </button>
              </div>
            )}
            {messages.length === 0 && !loadError && (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <div className="mb-3 rounded-2xl bg-primary/10 p-3 text-primary">
                  <Send size={20} />
                </div>
                <p className="font-medium text-primary-text">
                  Your conversation starts here
                </p>
                <p className="mt-1 text-sm text-secondary-text">
                  Ask about a project, a service, or an idea you’re exploring.
                </p>
              </div>
            )}
            {messages.filter(Boolean).map((msg) => {
              const isUserMessage =
                msg?.sender?.id === user?.id || msg?.senderId === user?.id;
              const isTransferNotice =
                msg?.senderId === "system" &&
                /connected to Ogooluwani|connecting you to Ogooluwani|AI assistant.*resumed|Robot is assisting you again/i.test(msg.content || "");

              if (isTransferNotice) {
                return (
                  <div key={msg.id} className="my-4 flex items-center gap-3" role="status">
                    <span className="h-px flex-1 bg-gray-200" />
                    <span className="max-w-[78%] text-center text-xs text-gray-500" dangerouslySetInnerHTML={{ __html: sanitizedContent(msg.content) }} />
                    <span className="h-px flex-1 bg-gray-200" />
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`flex max-w-[80%] md:max-w-[60%] text-left min-w-20 rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap wrap-break-word text-base items-end gap-3 ${
                    isUserMessage
                      ? "ml-auto  flex-row-reverse"
                      : "mr-auto justify-start  flex-row"
                  }`}
                  style={{
                    wordBreak: "break-word",
                    overflowWrap: "anywhere",
                  }}
                >
                  <img
                    className="w-7! h-7! rounded-full object-cover"
                    src={
                      isUserMessage
                        ? `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${user.id}`
                        : "/images/logo.png"
                    }
                    alt={isUserMessage ? "Your avatar" : "Robot avatar"}
                  />
                  <div
                    className={`relative inline-flex flex-col max-w-[85%] md:max-w-[70%] min-w-12 rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-base shadow-sm ${
                      isUserMessage
                        ? "glass-morphism text-primary-text"
                        : "bg-white/60 text-gray-900 border border-gray-200"
                    }`}
                  >
                    <div
                      className="chat-content"
                      dangerouslySetInnerHTML={{
                        __html: sanitizedContent(msg.content),
                      }}
                    />
                    <span className="mt-1 text-[11px] text-gray-500 self-end">
                      {new Date(msg.timestamp).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      })}
                    </span>
                  </div>
                </div>
              );
            })}

            {/* Typing indicator */}
            {(typingUsers.has("system") || typingUsers.has("admin")) && (
              <div className="flex max-w-[80%] md:max-w-[60%] min-w-20 rounded-2xl px-4 py-10 text-[15px] leading-relaxed whitespace-pre-wrap wrap-break-word text-base items-end gap-5">
                <Image
                  width={28}
                  height={28}
                  className="w-7! h-7! rounded-full object-cover"
                  src="/images/logo.png"
                  alt="avatar"
                />
                <div className="flex items-center gap-2 px-3 py-2 bg-white/60 rounded-2xl shadow-sm backdrop-blur-sm">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-primary-text animate-[typing_1.2s_ease-in-out_infinite]"></span>
                    <span className="w-2 h-2 rounded-full bg-primary-text animate-[typing_1.2s_ease-in-out_infinite] [animation-delay:0.15s]"></span>
                    <span className="w-2 h-2 rounded-full bg-primary-text animate-[typing_1.2s_ease-in-out_infinite] [animation-delay:0.3s]"></span>
                  </div>
                  <span className="text-xs text-gray-900 ml-2">typing</span>
                </div>
              </div>
            )}

            {/* Conversation closed message */}
            {conversationClosed && (
              <div className="flex justify-center my-4">
                <Button
                  onClick={handleStartNewConversation}
                  className="glass-morphism"
                >
                  Start New Conversation
                </Button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input Section */}
      {!conversationClosed && !isLoadingMessages && (
        <div className="px-4 py-5 flex items-center justify-center">
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
                ref={textareaRef}
                rows={1}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                }}
                onFocus={() => setFocus(true)}
                onBlur={() => setFocus(false)}
                onInput={(e) => {
                  const ta = e.currentTarget as HTMLTextAreaElement;
                  const maxHeight = 200;
                  ta.style.height = "auto";
                  const newHeight = Math.min(ta.scrollHeight, maxHeight);
                  ta.style.height = `${newHeight}px`;
                  ta.style.overflowY =
                    ta.scrollHeight > maxHeight ? "auto" : "hidden";
                }}
                onKeyDown={handleKeyDown}
                aria-label="Message"
                placeholder={
                  isAIResponding ? "Robot is thinking…" : "Message Robot"
                }
                disabled={isSendingMessage}
                className="w-full resize-none bg-transparent p-2 pr-3 mb-1 text-base text-skill-text placeholder-primary-text/50 focus:outline-none! focus:ring-0  max-h-50 overflow-hidden disabled:opacity-50"
                style={{
                  minHeight: "10px",
                  paddingBottom: input.trim() ? "8px" : "4px",
                }}
              />
            </div>

            <div
              className={`flex ${
                input.trim() ? "justify-end w-full" : "items-end"
              }`}
            >
              <button
                onClick={async () => await handleSend()}
                aria-label="Send message"
                disabled={
                  !input.trim() ||
                  isSendingMessage ||
                  (isAIResponding && !onlineUsers.has("admin"))
                }
                className={`ml-2 flex items-center justify-center rounded-full p-2 transition-all duration-200 ${
                  input.trim() &&
                  !isSendingMessage &&
                  !(isAIResponding && !onlineUsers.has("admin"))
                    ? "bg-primary text-white shadow-sm hover:bg-primary/90 active:scale-95"
                    : "text-gray-400 cursor-not-allowed"
                }`}
              >
                {isSendingMessage ||
                (isAIResponding && !onlineUsers.has("admin")) ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ArrowUp size={16} />
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      <p className="text-center text-xs text-gray-500 py-2">
        © {new Date().getFullYear()} Ogooluwani Adewale
      </p>
      <ConfirmationModal
        isOpen={confirmation.isOpen}
        onClose={confirmation.hideConfirmation}
        onConfirm={confirmation.config.onConfirm}
        title={confirmation.config.title}
        message={confirmation.config.message}
        confirmText={confirmation.config.confirmText}
        cancelText={confirmation.config.cancelText}
        variant={confirmation.config.variant}
      />
    </div>
  );
}
