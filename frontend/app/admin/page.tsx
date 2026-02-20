"use client";

import { useEffect, useState, useRef } from "react";
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Transition,
} from "@headlessui/react";
import {
  EllipsisVertical,
  ArrowUp,
  Loader2,
  Search,
  Menu as MenuIcon,
  X,
  LogOut,
  Download,
  Send,
  LogOutIcon,
  UserIcon,
  Ban,
  MessageCircleX,
} from "lucide-react";
import { useChatStore } from "@/store/chatStore";
import { User, UserRole, Message, Status } from "@/types";
import {
  Console,
  formatDateTime,
  formats,
  modules,
  sanitizedContent,
} from "@/lib/constants";
import { adminApi } from "@/lib/axios";
import { getSocket } from "@/lib/socket";
import { UserProfileModal } from "@/components/admin/UserProfileModal";
import { useConfirmationModal } from "@/hooks/use-modal";
import { ConfirmationModal } from "@/components/shared/ConfirmationModal";
import { useToast } from "@/hooks/use-toast";
import { useRouter } from "next/navigation";
import { DarkModeToggle } from "@/components/shared/DarkModeToggle";
import { v4 as uuidv4 } from "uuid";

const ReactQuill = dynamic(() => import("react-quill-new"), {
  ssr: false,
});
import "react-quill-new/dist/quill.snow.css";
import dynamic from "next/dynamic";

export default function AdminPage() {
  const router = useRouter();
  const { toast } = useToast();

  const {
    user,
    setUser,
    messages,
    receiveMessage,
    clearMessages,
    onlineUsers,
    typingUsers,
    initializeSocketListeners,
    startTyping,
    stopTyping,
    setIsChatFocused,
  } = useChatStore();

  const [users, setUsers] = useState<User[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<
    { id: string; messages: Message[]; createdAt: string; status: string }[]
  >([]);
  const [conversationUnreadCounts, setConversationUnreadCounts] = useState<
    Record<string, number>
  >({});

  const [minimized, setMinimized] = useState<Record<string, boolean>>({});
  const [profileUser, setProfileUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [input, setInput] = useState("");
  const [isFocus, setFocus] = useState(false);

  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [hasPlayedSound, setHasPlayedSound] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [loadStatus, setLoadStatus] = useState({
    users: true,
    chat: false,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMessageCountRef = useRef(0);

  const confirmation = useConfirmationModal();
  const isInputEmpty =
    input
      .replace(/<(.|\n)*?>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim().length === 0;

  const handleKeyDown = (e: any) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const startTypingEmit = () => {
    const activeConv = conversations[conversations.length - 1];
    if (!activeConv) return;
    const socket = getSocket();
    socket.emit("typing_start", activeConv.id);
  };

  const stopTypingEmit = () => {
    const activeConv = conversations[conversations.length - 1];
    if (!activeConv) return;
    const socket = getSocket();
    socket.emit("typing_stop", activeConv.id);
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

  const playNotificationSound = () => {
    try {
      const audioContext = new (
        window.AudioContext || (window as any).webkitAudioContext
      )();
      const playTone = (
        frequency: number,
        startTime: number,
        duration: number,
      ) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.frequency.value = frequency;
        oscillator.type = "sine";
        gainNode.gain.setValueAtTime(0.3, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };
      const now = audioContext.currentTime;
      playTone(800, now, 0.1);
      playTone(600, now + 0.12, 0.15);
    } catch (error) {
      Console.error("Error playing sound:", error);
    }
  };

  // Initialize admin user
  useEffect(() => {
    if (!user) {
      setUser({
        id: "admin",
        firstName: "Ogooluwani",
        lastName: "",
        email: "hey@ogooluwaniadewale.com",
        phone: "",
        country: "",
        role: UserRole.ADMIN,
        status: Status.ONLINE,
        avatarUrl: `/images/logo.png`,
      });
    }
  }, [user, setUser]);

  // Socket listeners
  useEffect(() => {
    initializeSocketListeners();
    const socket = getSocket();

    socket.on("user_typing", ({ id }: any) => {
      if (id !== "admin" && id !== "system") startTyping(id);
    });

    socket.on("user_stopped_typing", ({ id }: any) => {
      if (id !== "admin" && id !== "system") stopTyping(id);
    });

    socket.on("conversation_closed", (closedConvId: string) => {
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === closedConvId ? { ...conv, status: "closed" } : conv,
        ),
      );
    });

    socket.on("receive_message", (message: Message) => {
      const currentActiveId = selectedUserId;

      if (message.senderId !== "admin" && message.senderId !== "system") {
        if (message.senderId !== currentActiveId) {
          setConversationUnreadCounts((prev) => ({
            ...prev,
            [message.senderId]: (prev[message.senderId] || 0) + 1,
          }));
        } else {
          setConversationUnreadCounts((prev) => ({
            ...prev,
            [message.senderId]: 0,
          }));
        }
      }
      setConversations((prev) => {
        return prev.map((conv) => {
          if (conv.id === message.conversationId) {
            const messageExists = conv.messages.some(
              (m) => m.id === message.id,
            );
            if (messageExists) return conv;

            return {
              ...conv,
              messages: [...conv.messages, message],
            };
          }
          return conv;
        });
      });
    });

    return () => {
      socket.off("user_typing");
      socket.off("user_stopped_typing");
      socket.off("conversation_closed");
    };
  }, []);

  // Play sound on new messages
  useEffect(() => {
    if (hasPlayedSound && messages.length > lastMessageCountRef.current) {
      const latestMessage = messages[messages.length - 1];
      if (
        latestMessage &&
        latestMessage.senderId !== "admin" &&
        latestMessage.senderId !== "system"
      ) {
        playNotificationSound();
      }
    }
    lastMessageCountRef.current = messages.length;
  }, [messages, hasPlayedSound]);

  // Fetch users
  useEffect(() => {
    async function fetchUsers() {
      try {
        const response = await adminApi.get("/admin/users");
        setUsers(response.data);
        setFilteredUsers(response.data);
      } catch (error) {
        Console.error(error);
      } finally {
        setLoadStatus((prev) => ({ ...prev, users: false }));
      }
    }
    fetchUsers();
    const interval = setInterval(fetchUsers, 10000);
    return () => clearInterval(interval);
  }, []);

  // Filter users
  useEffect(() => {
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      setFilteredUsers(
        users?.filter(
          (u) =>
            `${u.firstName} ${u.lastName}`.toLowerCase().includes(query) ||
            u.email.toLowerCase().includes(query),
        ),
      );
    } else setFilteredUsers(users);
  }, [searchQuery, users]);

  // Fetch conversations
  useEffect(() => {
    if (!selectedUserId) {
      setConversations([]);
      clearMessages();
      return;
    }
    setLoadStatus((prev) => ({ ...prev, chat: true }));
    setConversationUnreadCounts((prev) => ({
      ...prev,
      [selectedUserId]: 0,
    }));

    async function fetchConversations() {
      try {
        const res = await adminApi.get(
          `/admin/conversations/${selectedUserId}`,
        );
        setConversations(res.data);
        clearMessages();
        res.data.forEach((conv: any) =>
          conv.messages.forEach((msg: Message) => receiveMessage(msg)),
        );
        if (user) {
          setUser(user);
        }
        setTimeout(() => setHasPlayedSound(true), 500);
      } catch (error) {
        Console.error(error);
      } finally {
        setLoadStatus((prev) => ({ ...prev, chat: false }));
      }
    }
    fetchConversations();
  }, [selectedUserId]);

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  const handleSend = async () => {
    if (isInputEmpty) return;
    const activeConv = conversations[conversations.length - 1];
    if (!activeConv) return;

    setIsSendingMessage(true);
    try {
      const socket = getSocket();
      const message: Message = {
        id: uuidv4(),
        conversationId: activeConv.id,
        senderId: "admin",
        content: input.trim(),
        timestamp: Date.now(),
      };
      receiveMessage(message);
      socket.emit("send_message", message);
      setInput("");
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch (err) {
      Console.error(err);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleExport = async () => {
    const activeConv = conversations[conversations.length - 1];
    if (!activeConv) return;
    confirmation.showConfirmation({
      title: "Export Conversation?",
      message: "We'll send the conversation transcript to your email.",
      confirmText: "Export",
      cancelText: "Cancel",
      variant: "info",
      onConfirm: async () => {
        setIsExporting(true);
        try {
          await adminApi.post(
            `/admin/conversations/${activeConv.id}/export`,
            {},
          );
          toast({
            title: "Success",
            description: "Conversation exported to your email!",
          });
        } catch {
          toast({
            title: "Error",
            description: "Failed to export conversation",
            variant: "destructive",
          });
        } finally {
          setIsExporting(false);
        }
      },
    });
  };

  const handleSendTranscript = async (email?: any) => {
    if (!email) return;
    const activeConv = conversations[conversations.length - 1];
    if (!activeConv) return;
    confirmation.showConfirmation({
      title: "Export Conversation?",
      message: `We'll send the conversation transcript to ${email}.`,
      confirmText: "Export",
      cancelText: "Cancel",
      variant: "info",
      onConfirm: async () => {
        setIsExporting(true);
        try {
          await adminApi.post(
            `/admin/conversations/${activeConv.id}/export/${email}`,
            {},
          );
          toast({
            title: "Success",
            description: `Conversation exported to ${email}`,
          });
        } catch (error) {
          Console.error(error);
          toast({
            title: "Error",
            description: "Failed to export conversation",
            variant: "destructive",
          });
        } finally {
          setIsExporting(false);
        }
      },
    });
  };

  const handleCloseConversation = () => {
    const activeConv = conversations[conversations.length - 1];
    if (!activeConv) return;
    confirmation.showConfirmation({
      title: "End Chat?",
      message: "Are you sure you want to end this conversation?",
      confirmText: "End Chat",
      cancelText: "Cancel",
      variant: "warning",
      onConfirm: () => getSocket().emit("close_conversation", activeConv.id),
    });
  };

  const handleLogout = async () => {
    try {
      await adminApi.post("/auth/admin/logout");

      router.push("/admin/auth");
    } catch (err) {
      Console.error(err);
    }
  };

  const handleSelectUser = (userId?: string) => {
    if (!userId) {
      setSelectedUserId(null);
      setIsChatFocused(false);
      return;
    }
    setSelectedUserId(userId);
    setIsChatFocused(true);
    setSidebarOpen(false);
  };

  const currentUser = users.find((u) => u.id === selectedUserId);
  const isUserOnline = currentUser && onlineUsers.has(currentUser.id);

  return (
    <div className="flex h-screen bg-gray-100 dark:bg-gray-900 overflow-hidden">
      {/* Sidebar Overlay for Mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/25 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed md:relative z-30 top-0 left-0 h-full bg-white  border-r border-primary/20 flex flex-col transition-all duration-300 ${
          sidebarOpen ? "w-72" : "w-0 md:w-82"
        } overflow-y-auto`}
      >
        {/* Header */}
        <div className="p-4 bg-background flex items-center justify-between text-primary-text border-b border-primary/20">
          <h1 className="text-xl font-bold text-primary-text">Chats</h1>
          <div className="flex gap-2">
            <DarkModeToggle />
            <button
              onClick={handleLogout}
              className="text-primary-text hover:text-primary-text/80 cursor-pointer p-2 rounded-full hover:bg-white/10"
            >
              <LogOut size={20} />
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              className="md:hidden text-primary-text p-2"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="p-3 relative bg-background ">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 border border-primary/20 pr-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary dark:bg-gray-700 dark:text-white"
          />
        </div>

        {/* User List */}
        {loadStatus.users ? (
          <div className="w-full h-full flex items-center justify-center">
            <Loader2 size={20} className="animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto bg-background ">
            {filteredUsers?.map((u) => (
              <div
                key={u.id}
                onClick={() => {
                  handleSelectUser(u.id);
                }}
                className={`p-4 border-b border-primary/20 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  selectedUserId === u.id ? "bg-gray-50 dark:bg-gray-700" : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <img
                      src={`https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${u.id}`}
                      alt="avatar"
                      className="w-12 h-12 rounded-full"
                    />
                    {onlineUsers.has(u.id) && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-gray-900 dark:text-white truncate">
                        {u.firstName} {u.lastName}
                      </p>
                      {conversationUnreadCounts[u.id] > 0 && (
                        <span className="ml-2 flex items-center justify-center min-w-5 h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full">
                          {conversationUnreadCounts[u.id]}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {u.email}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col  transition-all duration-300">
        {selectedUserId && currentUser ? (
          <>
            {/* Chat Header */}
            <div className="p-4 bg-background animate-glow! flex items-center justify-between">
              <div className="flex items-center gap-3 text-primary-text">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="md:hidden "
                >
                  <MenuIcon size={24} />
                </button>
                <div className="relative">
                  <img
                    src={`https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${currentUser.id}`}
                    alt="avatar"
                    className="w-10 h-10 rounded-full"
                  />
                  {onlineUsers.has(currentUser.id) && (
                    <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-white animate-pulse" />
                  )}
                </div>
                <div>
                  <h2 className="font-semibold ">
                    {currentUser.firstName} {currentUser.lastName}
                  </h2>
                  <p className="text-sm text-link-inactive/80">
                    {isUserOnline ? "Online" : "Offline"}
                  </p>
                </div>
              </div>

              {/* Menu */}
              <div className="flex gap-2 items-center">
                {isExporting && (
                  <span className="text-xs flex items-center gap-1">
                    <Loader2 size={15} className="animate-spin" /> Exporting...
                  </span>
                )}
                <Menu as="div" className="relative">
                  <MenuButton className="p-2 rounded-lg cursor-pointer text-primary-text hover:bg-white/10">
                    <EllipsisVertical size={20} />
                  </MenuButton>
                  <Transition>
                    <MenuItems className="absolute right-0 mt-2 w-48 bg-white  border rounded-lg shadow-lg z-50">
                      <MenuItem>
                        {({ active }: any) => (
                          <button
                            onClick={() => handleSelectUser()}
                            className={`${active ? "bg-gray-100 " : ""} w-full px-4 py-2 text-left text-sm rounded-lg cursor-pointer flex items-center gap-2 `}
                          >
                            Close
                          </button>
                        )}
                      </MenuItem>
                      <MenuItem>
                        {({ active }: any) => (
                          <button
                            onClick={() => setProfileUser(currentUser)}
                            className={`${active ? "bg-gray-100 " : ""} w-full px-4 py-2 text-left text-sm rounded-lg cursor-pointer flex items-center gap-2 `}
                          >
                            <UserIcon />
                            View Profile
                          </button>
                        )}
                      </MenuItem>

                      <MenuItem>
                        {({ active }: any) => (
                          <button
                            onClick={handleExport}
                            disabled={isExporting}
                            className={`${active ? "bg-gray-100 " : ""} w-full px-4 py-2 text-left text-sm flex items-center gap-2 rounded-lg cursor-pointer`}
                          >
                            <Download size={16} /> Export
                          </button>
                        )}
                      </MenuItem>
                      <MenuItem>
                        {({ active }: any) => (
                          <button
                            onClick={() =>
                              handleSendTranscript(currentUser?.email)
                            }
                            disabled={isExporting}
                            className={`${active ? "bg-gray-100 " : ""} w-full px-4 py-2 text-left text-sm flex items-center gap-2 rounded-lg cursor-pointer`}
                          >
                            <Send size={16} /> Send Transcript
                          </button>
                        )}
                      </MenuItem>

                      {conversations[conversations.length - 1]?.status !==
                        "closed" && (
                        <MenuItem>
                          {({ active }: any) => (
                            <button
                              onClick={handleCloseConversation}
                              className={`${active ? "bg-gray-100 " : ""} w-full px-4 py-2 text-left text-sm text-red-600 rounded-lg cursor-pointer flex items-center gap-2 `}
                            >
                              <MessageCircleX size={16} />
                              End Conversation
                            </button>
                          )}
                        </MenuItem>
                      )}
                    </MenuItems>
                  </Transition>
                </Menu>
              </div>
            </div>

            {/* Messages */}
            {loadStatus.chat ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 size={30} className="animate-spin" />
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto p-4 bg-slate-200 dark:bg-gray-900">
                {conversations.map((conv: any, i) => {
                  const isCurrent = i === conversations.length - 1;
                  const isMinimized =
                    !isCurrent && (minimized[conv.id] ?? true);

                  return (
                    <div key={conv.id} className="mb-4">
                      <div
                        className="text-center text-sm text-gray-500 mb-2 cursor-pointer bg-white/50 dark:bg-gray-800/50 rounded-lg py-1"
                        onClick={() => {
                          if (isCurrent) return;
                          setMinimized((prev) => ({
                            ...prev,
                            [conv.id]: !isMinimized,
                          }));
                        }}
                      >
                        {isMinimized
                          ? `Show conversation - ${formatDateTime(
                              conv.createdAt,
                            )}`
                          : isCurrent
                            ? "Current conversation"
                            : `Hide conversation - ${formatDateTime(
                                conv.createdAt,
                              )}`}
                      </div>
                      {!isMinimized && (
                        <div>
                          {conv.messages.map((msg: any, idx: any) => {
                            const isAdmin =
                              msg.senderId === "admin" ||
                              msg.senderId === "system";
                            return (
                              <div
                                key={idx}
                                className={`flex max-w-[80%] md:max-w-[60%] min-w-20 rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap wrap-break-word text-base items-end gap-3 ${
                                  isAdmin
                                    ? "ml-auto  flex-row-reverse"
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
                                    isAdmin
                                      ? user?.avatarUrl
                                      : `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${currentUser.id}`
                                  }
                                  alt="avatar"
                                />
                                <div
                                  className={`relative inline-flex flex-col max-w-[85%] md:max-w-[70%] min-w-12 rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap text-base shadow-sm ${
                                    isAdmin
                                      ? "bg-white/60 text-gray-900 border border-gray-200"
                                      : "glass-morphism text-primary-text"
                                  }`}
                                >
                                  <div
                                    className="chat-content"
                                    dangerouslySetInnerHTML={{
                                      __html: sanitizedContent(msg.content),
                                    }}
                                  />

                                  <span className="mt-1 text-[11px] text-gray-500 self-end">
                                    {new Date(msg.timestamp).toLocaleTimeString(
                                      "en-GB",
                                      {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: true,
                                      },
                                    )}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Typing */}
                {selectedUserId && typingUsers.has(selectedUserId) && (
                  <div className="flex max-w-[80%] md:max-w-[60%] min-w-20 rounded-xl px-4 py-10 text-[15px] leading-relaxed mr-auto text-right  whitespace-pre-wrap wrap-break-word text-base items-end gap-5">
                    <img
                      className="w-7! h-7! rounded-full object-cover"
                      src={`https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${currentUser.id}`}
                      alt="avatar"
                    />
                    <div className="flex items-center gap-2 px-3 py-2 glass-morphism rounded-xl shadow-sm backdrop-blur-sm">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 rounded-full bg-primary-text animate-[typing_1.2s_ease-in-out_infinite]"></span>
                        <span className="w-2 h-2 rounded-full bg-primary-text animate-[typing_1.2s_ease-in-out_infinite] [animation-delay:0.15s]"></span>
                        <span className="w-2 h-2 rounded-full bg-primary-text animate-[typing_1.2s_ease-in-out_infinite] [animation-delay:0.3s]"></span>
                      </div>
                      <span className="text-xs  text-primary-text ml-1">
                        typing
                      </span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            )}

            {/* Input */}
            {conversations.length > 0 &&
              conversations[conversations.length - 1]?.status !== "closed" && (
                <div className="p-4 bg-white dark:bg-gray-800 border-t shrink-0">
                  <div className="flex flex-col sm:flex-row items-end gap-2">
                    <div className="flex-1 min-w-0 rich-text-wrapper">
                      <ReactQuill
                        theme="snow"
                        value={input}
                        onChange={(content) => {
                          setInput(content);
                        }}
                        onFocus={() => setFocus(true)}
                        onBlur={() => setFocus(false)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSend();
                          }
                        }}
                        placeholder="Type a message..."
                        modules={modules}
                        formats={formats}
                      />
                    </div>
                    <button
                      onClick={() => handleSend()}
                      disabled={isInputEmpty || isSendingMessage}
                      className={`p-3 rounded-full ${!isInputEmpty && !isSendingMessage ? "bg-primary text-white hover:opacity-90 cursor-pointer" : "bg-gray-300 text-gray-500 cursor-not-allowed"}`}
                    >
                      {isSendingMessage ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <ArrowUp size={20} />
                      )}
                    </button>
                  </div>
                </div>
              )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-500">
            <button
              onClick={() => setSidebarOpen(true)}
              className="md:hidden mb-4 p-3 bg-primary text-white rounded-full"
            >
              <MenuIcon size={24} />
            </button>
            <p>Select a conversation to start chatting</p>
          </div>
        )}
      </div>

      {/* Modals */}
      <UserProfileModal
        user={profileUser}
        onClose={() => setProfileUser(null)}
        onlineUsers={onlineUsers}
        onUpdate={setProfileUser}
      />

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
