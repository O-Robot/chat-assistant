/* eslint-disable @next/next/no-img-element */
import { useConfirmationModal } from "@/hooks/use-modal";
import { toast } from "@/hooks/use-toast";
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
  Maximize,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/bootstrap.css";
import { ConfirmationModal } from "../shared/ConfirmationModal";
import { ReconnectionIndicator } from "../shared/ReconnectionIndicator";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";

export const ChatWindow = ({ onClose }: any) => {
  useSocketConnection();

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
    sendMessage,
    loadMessagesFromLocalStorage,
    saveMessagesToLocalStorage,
    setHasPlayedNotificationOnLoad,
    initializeSocketListeners,
  } = useChatStore();
  const confirmation = useConfirmationModal();
  const router = useRouter();
  const [input, setInput] = useState("");
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const preserveScrollPositionRef = useRef(false);

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

      loadMessagesFromLocalStorage(conversationId);
      setUser(userCookie);

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

      clearMessages();
      setConversationCookie(data.conversationId);
      setConversationClosed(false);
      setNextCursor(null);
      setLoadError(null);
      setFocus(false);

      initializeSocketListeners();

      const socket = getSocket();

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

  const isSystemOnline = onlineUsers.has("system");
  const isAdminOnline = onlineUsers.has("admin");

  // Form for new user
  if (!user?.email) {
    return (
      <div className="h-full w-full bg-background flex flex-col overflow-hidden rounded-2xl">
        <div className="border-b border-white/15 bg-primary px-5 py-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-white/70">
                Welcome
              </p>
              <h2 className="mt-1 text-lg font-semibold">
                Let’s start with the basics
              </h2>
              <p className="mt-1 text-sm leading-5 text-white/80">
                Share your details so we can keep this conversation together.
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close chat"
              className="rounded-lg p-2 text-white transition-colors hover:bg-white/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <Card className="flex-1 overflow-y-auto border-0 bg-transparent px-5 py-6 shadow-none">
          <form onSubmit={handleUserSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Input
                aria-label="First name"
                placeholder="First name"
                value={form.firstName}
                onChange={(e) =>
                  setForm({ ...form, firstName: e.target.value })
                }
                required
                disabled={isSubmittingForm}
                className="glass-morphism border-white/20 text-primary-text/80 placeholder:text-primary-text/50"
              />
              <Input
                aria-label="Last name"
                placeholder="Last name"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                required
                disabled={isSubmittingForm}
                className="glass-morphism border-white/20 text-primary-text/80 placeholder:text-primary-text/50"
              />
            </div>

            <div>
              <Input
                type="email"
                aria-label="Email address"
                placeholder="Email address"
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
                inputProps={{ required: true, "aria-label": "Phone number" }}
              />
            </div>

            <Button
              type="submit"
              className="w-full bg-primary text-white font-semibold shadow-sm transition-transform hover:bg-primary/90 active:scale-[0.98]"
              size="lg"
              disabled={isSubmittingForm}
            >
              {isSubmittingForm ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Starting your chat…
                </>
              ) : (
                "Start chatting"
              )}
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-background text-primary-text flex flex-col overflow-hidden rounded-2xl shadow-2xl shadow-primary/20">
      <ReconnectionIndicator />

      {/* Header */}
      <div className="flex justify-between items-center border-b border-white/10 bg-primary px-4 py-3.5">
        <div className="flex items-center gap-3">
          <Image
            src="/images/logo.png"
            alt="Ogooluwani"
            width={36}
            height={36}
            className="h-9 w-9 rounded-full ring-2 ring-white/20"
          />
          <div>
            <h3 className="font-semibold text-white text-sm leading-tight">
              Ogooluwani&apos;s Chat
            </h3>
            <span className="mt-0.5 text-xs text-white/80" aria-live="polite">
              {isSystemOnline ? (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Robot Online
                </span>
              ) : isAdminOnline ? (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Ogooluwani Online
                </span>
              ) : (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-gray-400 rounded-full" />
                  Offline
                </span>
              )}
            </span>
          </div>
        </div>

        <div className="flex gap-1">
          <button
            onClick={() => {
              const targetUrl =
                process.env.NEXT_PUBLIC_CHAT_URL || "http://localhost:3000";
              if (window.parent !== window) {
                window.parent.location.href = targetUrl;
              } else {
                window.location.href = targetUrl;
              }
            }}
            className="p-2 text-white rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
            aria-label="Open full chat"
            title="Open full chat"
          >
            <Maximize size={18} />
          </button>
          <div className="relative">
            <Menu as="div" className="relative">
              <MenuButton
                aria-label="Conversation options"
                className="p-2 text-white rounded-lg hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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
          <button
            onClick={onClose}
            aria-label="Minimise chat"
            className="p-2 text-white rounded-lg hover:bg-white/20 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div
        ref={messagesListRef}
        className="flex-1 overflow-y-auto overscroll-contain bg-background px-4 py-4"
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
                <p className="font-medium">Your conversation starts here</p>
                <p className="mt-1 text-sm text-secondary-text">
                  Tell Robot what you’d like to build or ask a question.
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
                  <div key={msg.id} className="my-3 flex items-center gap-2" role="status">
                    <span className="h-px flex-1 bg-gray-200 dark:bg-white/15" />
                    <span className="max-w-[78%] text-center text-[11px] text-gray-500 dark:text-gray-400" dangerouslySetInnerHTML={{ __html: sanitizedContent(msg.content) }} />
                    <span className="h-px flex-1 bg-gray-200 dark:bg-white/15" />
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className={`mb-4 flex items-end gap-2 motion-safe:animate-fade-in ${
                    isUserMessage ? "flex-row-reverse" : "flex-row"
                  }`}
                >
                  <img
                    width={20}
                    height={20}
                    className="w-5 h-5 rounded-full object-cover"
                    src={
                      isUserMessage
                        ? `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${user?.id}`
                        : "/images/logo.png"
                    }
                    alt={isUserMessage ? "Your avatar" : "Robot avatar"}
                  />

                  <div
                    className={`max-w-[78%] rounded-2xl px-3.5 py-2.5 shadow-sm ${
                      isUserMessage
                        ? "rounded-br-md bg-primary text-white"
                        : "rounded-bl-md border border-gray-200 bg-white text-gray-900 dark:border-white/10 dark:bg-white/8 dark:text-white"
                    }`}
                  >
                    <div className="text-sm whitespace-pre-wrap wrap-break-word">
                      <div
                        className="chat-content"
                        dangerouslySetInnerHTML={{
                          __html: sanitizedContent(msg.content),
                        }}
                      />
                    </div>
                    <span className="mt-1 block text-[10px] opacity-65">
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
              <div className="flex items-end gap-2 mb-4">
                <Image
                  width={20}
                  height={20}
                  className="w-5 h-5 rounded-full object-cover"
                  src="/images/logo.png"
                  alt="avatar"
                />
                <div className="flex items-center gap-2 px-2 py-2 bg-white dark:bg-gray-700 rounded-2xl border border-gray-200 dark:border-gray-600">
                  <div className="flex gap-1">
                    <span
                      className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
                      style={{ animationDelay: "0s" }}
                    ></span>
                    <span
                      className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
                      style={{ animationDelay: "0.15s" }}
                    ></span>
                    <span
                      className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
                      style={{ animationDelay: "0.3s" }}
                    ></span>
                  </div>
                </div>
              </div>
            )}

            {conversationClosed && (
              <div className="flex justify-center my-4">
                <Button
                  onClick={handleStartNewConversation}
                  className="bg-primary text-white hover:bg-primary/90"
                >
                  Start New Conversation
                </Button>
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      {!conversationClosed && !isLoadingMessages && (
        <div className="border-t border-primary/10 bg-background px-3 py-3">
          <div
            className={`w-full mx-auto relative border border-primary/25 bg-white/70 px-2 py-1.5 flex shadow-sm transition-all duration-200 ease-out focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10 dark:bg-white/5 ${
              input.trim()
                ? "flex-col rounded-xl"
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
                  const maxHeight = 100;
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
                  }
                }}
                aria-label="Message"
                placeholder={
                  isAIResponding ? "Robot is thinking…" : "Message Robot"
                }
                disabled={isSendingMessage}
                className="w-full resize-none bg-transparent p-2 pr-2 text-[15px] text-skill-text placeholder-primary-text/50 focus:outline-none! focus:ring-0 max-h-25 overflow-hidden disabled:opacity-50"
                style={{
                  minHeight: "10px",
                  paddingBottom: input.trim() ? "8px" : "4px",
                }}
              />
            </div>
            <div
              className={`flex items-end ${input.trim() ? "justify-end w-full" : ""}`}
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
};
