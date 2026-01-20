"use client";

import { useState, useEffect, useRef } from "react";
import { useChatStore } from "@/store/chatStore";
import { Visitor, Message, UserRole, Status } from "@/types";
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
  Loader2,
  Minimize,
} from "lucide-react";
import {
  setUserCookie,
  setConversationCookie,
  getUserCookie,
  getConversationCookie,
  removeUserCookie,
  removeConversationCookie,
} from "@/lib/cookies";
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
import { getSocket } from "@/lib/socket";
import { userApi } from "@/lib/axios";
import { useConfirmationModal } from "@/hooks/use-modal";
import { ConfirmationModal } from "../shared/ConfirmationModal";

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
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phone: "",
    country: "",
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const confirmation = useConfirmationModal();

  //? scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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

      // Then fetch from server and update
      try {
        const response = await userApi.get(
          `/api/conversations/${conversationId}/messages/`,
        );
        const msgs: Message[] = response.data;

        clearMessages();
        msgs.forEach(receiveMessage);
        setUser(userCookie);
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
    if (!input.trim() || !user || isSendingMessage) return;

    const conversationId = getConversationCookie();
    console.log(conversationId);
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

        console.log("This", conversationId);
        setConversationClosed(true);
        // removeConversationCookie();
        // clearMessages();
        // onClose();
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
              Let's get to know you 👋
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

        {/* Name and status */}
        <div className="flex flex-col items-center">
          <span className="font-medium text-skill-text">Ogooluwani's Chat</span>
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
          <button
            onClick={() =>
              router.push(
                process.env.NEXT_PUBLIC_PORTFOLIO_URL ||
                  "http://localhost:3000/widget",
              )
            }
            className="p-2 text-primary-text rounded-lg hover:bg-white/20 transition-colors cursor-pointer"
          >
            <Minimize size={18} />
          </button>
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

      <div className="flex-1 overflow-y-auto p-4">
        {isLoadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {messages.map((msg, i) => {
              const isUserMessage =
                msg?.sender?.id === user.id || msg?.senderId === user.id;

              return (
                <div
                  key={i}
                  className={`flex max-w-[80%] md:max-w-[60%] min-w-20 rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap wrap-break-word text-base items-end gap-3 ${
                    isUserMessage
                      ? "ml-auto text-right flex-row-reverse"
                      : "mr-auto justify-start text-left flex-row"
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
                    alt="avatar"
                  />
                  <div
                    className={`relative inline-flex flex-col max-w-[85%] md:max-w-[70%] min-w-12 rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-base shadow-sm ${
                      isUserMessage
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
                </div>
              );
            })}

            {/* Typing indicator */}
            {(typingUsers.has("system") || typingUsers.has("admin")) && (
              <div className="flex max-w-[80%] md:max-w-[60%] min-w-20 rounded-2xl px-4 py-10 text-[15px] leading-relaxed whitespace-pre-wrap wrap-break-word text-base items-end gap-5">
                <img
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
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    await handleSend();
                  }
                }}
                placeholder="Ask me anything..."
                disabled={isSendingMessage}
                className="w-full resize-none bg-transparent p-2 pr-3 mb-1 text-base text-skill-text placeholder-primary-text/50 focus:outline-none focus:ring-0 max-h-50 overflow-hidden disabled:opacity-50"
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
                disabled={!input.trim() || isSendingMessage}
                className={`ml-2 flex items-center justify-center rounded-full p-2 transition-all duration-200 ${
                  input.trim() && !isSendingMessage
                    ? "bg-primary/80 text-white hover:opacity-90 cursor-pointer"
                    : "text-gray-400 cursor-not-allowed"
                }`}
              >
                {isSendingMessage ? (
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
