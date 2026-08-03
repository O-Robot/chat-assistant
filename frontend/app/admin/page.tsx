/* eslint-disable @next/next/no-img-element */
"use client";

import { CustomerDetailsDrawer } from "@/components/admin/CustomerDetailsDrawer";
import { ConfirmationModal } from "@/components/shared/ConfirmationModal";
import { DarkModeToggle } from "@/components/shared/DarkModeToggle";
import { useConfirmationModal } from "@/hooks/use-modal";
import { useToast } from "@/hooks/use-toast";
import { adminApi } from "@/lib/axios";
import {
  Console,
  formatDateTime,
  formats,
  modules,
  sanitizedContent,
} from "@/lib/constants";
import { getSocket } from "@/lib/socket";
import { useChatStore } from "@/store/chatStore";
import { Message, Status, User, UserRole } from "@/types";
import {
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
  Transition,
} from "@headlessui/react";
import {
  Archive,
  ArrowUp,
  ChevronDown,
  Download,
  EllipsisVertical,
  Info,
  Loader2,
  LogOut,
  Mail,
  Menu as MenuIcon,
  MessageCircleX,
  MessageSquare,
  Phone,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import "react-quill-new/dist/quill.snow.css";
import { v4 as uuidv4 } from "uuid";

const ReactQuill = dynamic(() => import("react-quill-new"), {
  ssr: false,
});

const getDisplayName = (person?: User) =>
  [person?.firstName, person?.lastName].filter(Boolean).join(" ") || "Visitor";

const formatRelativeTime = (value?: string) => {
  if (!value) return "";
  const difference = Date.now() - new Date(value).getTime();
  const minutes = Math.floor(difference / 60_000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
};

const isSameDay = (first: number, second: number) =>
  new Date(first).toDateString() === new Date(second).toDateString();

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
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<"all" | "unread" | "open">(
    "all",
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});

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
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lastMessageCountRef = useRef(0);
  const isAtBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

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

    socket.on("conversation_deleted", (deletedConvId: string) => {
      setConversations((previous) =>
        previous.filter((conversation) => conversation.id !== deletedConvId),
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
      socket.off("conversation_deleted");
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
        if (response?.data && Array.isArray(response.data)) {
          setUsers(response.data);
        } else {
          setUsers([]);
          toast({
            title: "Warning",
            description: "Unexpected response from server",
            variant: "destructive",
          });
        }
      } catch (error: any) {
        Console.error("Error fetching users:", error);
        toast({
          title: "Error",
          description:
            error?.response?.data?.message ||
            "Failed to fetch users. Please try again later.",
          variant: "destructive",
        });
        setUsers([]);
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
    isAtBottomRef.current = true;
    setShowJumpToLatest(false);
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
        const activeConversation = res.data[res.data.length - 1];
        const lastMessage =
          activeConversation?.messages?.[
            activeConversation.messages.length - 1
          ];
        if (lastMessage) {
          getSocket().timeout(5000).emit("mark_read", {
            conversationId: activeConversation.id,
            messageId: lastMessage.id,
          });
        }
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

  const scrollToLatest = (behaviour: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior: behaviour });
    isAtBottomRef.current = true;
    setShowJumpToLatest(false);
  };

  // Preserve the agent's reading position when new messages arrive.
  useEffect(() => {
    if (isAtBottomRef.current) scrollToLatest("smooth");
  }, [messages, typingUsers]);

  const handleMessageScroll = () => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const distanceFromBottom =
      container.scrollHeight - container.scrollTop - container.clientHeight;
    isAtBottomRef.current = distanceFromBottom < 120;
    setShowJumpToLatest(!isAtBottomRef.current);
  };

  const handleSend = async () => {
    if (isInputEmpty) return;
    const activeConv = conversations[conversations.length - 1];
    if (!activeConv) return;
    const draftUserId = selectedUserId;

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
      socket
        .timeout(10000)
        .emit(
          "send_message",
          message,
          (error: Error | null, result: { ok?: boolean } | undefined) => {
            if (error || !result?.ok) {
              setInput(message.content);
              if (draftUserId) {
                setDrafts((previous) => ({
                  ...previous,
                  [draftUserId]: message.content,
                }));
              }
              toast({
                title: "Message not sent",
                description: "Your message was restored. Please try again.",
                variant: "destructive",
              });
            }
          },
        );
      setInput("");
      stopTypingEmit();
      setDrafts((previous) => {
        if (!draftUserId) return previous;
        const next = { ...previous };
        delete next[draftUserId];
        return next;
      });
      if (textareaRef.current) textareaRef.current.style.height = "auto";
    } catch (err) {
      Console.error(err);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleExport = async () => {
    const activeConversationId = conversations[conversations.length - 1]?.id;
    if (!activeConversationId) return;
    confirmation.showConfirmation({
      title: "Export conversation?",
      message: "We'll send the full conversation history to your admin email.",
      confirmText: "Export",
      cancelText: "Cancel",
      variant: "info",
      onConfirm: async () => {
        setIsExporting(true);
        try {
          await adminApi.post(
            `/admin/conversations/${activeConversationId}/export`,
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

  const handleSendTranscript = async (email?: string) => {
    if (!email) return;
    const activeConversationId = conversations[conversations.length - 1]?.id;
    if (!activeConversationId) return;
    confirmation.showConfirmation({
      title: "Send conversation transcript?",
      message: `We'll send the full conversation history to ${email}.`,
      confirmText: "Send conversation",
      cancelText: "Cancel",
      variant: "info",
      onConfirm: async () => {
        setIsExporting(true);
        try {
          await adminApi.post(
            `/admin/conversations/${activeConversationId}/export/${email}`,
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

  const handleExportChat = (chatId: string) => {
    confirmation.showConfirmation({
      title: "Export this chat?",
      message: "We'll send only this chat session to your admin email.",
      confirmText: "Export chat",
      cancelText: "Cancel",
      variant: "info",
      onConfirm: async () => {
        setIsExporting(true);
        try {
          await adminApi.post(`/admin/chats/${chatId}/export`, {});
          toast({
            title: "Chat exported",
            description: "This chat session was sent to your admin email.",
          });
        } catch {
          toast({
            title: "Unable to export chat",
            description: "Please try again.",
            variant: "destructive",
          });
        } finally {
          setIsExporting(false);
        }
      },
    });
  };

  const handleSendChat = (chatId: string) => {
    if (!currentUser?.email) return;
    confirmation.showConfirmation({
      title: "Send this chat transcript?",
      message: `We'll send only this chat session to ${currentUser.email}.`,
      confirmText: "Send chat",
      cancelText: "Cancel",
      variant: "info",
      onConfirm: async () => {
        setIsExporting(true);
        try {
          await adminApi.post(
            `/admin/chats/${chatId}/export/${currentUser.email}`,
            {},
          );
          toast({
            title: "Chat transcript sent",
            description: `This chat session was sent to ${currentUser.email}.`,
          });
        } catch {
          toast({
            title: "Unable to send chat",
            description: "Please try again.",
            variant: "destructive",
          });
        } finally {
          setIsExporting(false);
        }
      },
    });
  };

  const handleExportAllConversations = () => {
    if (!currentUser) return;
    confirmation.showConfirmation({
      title: "Export all conversations?",
      message:
        "We'll send a single transcript containing every session for this visitor to your admin email.",
      confirmText: "Export all",
      cancelText: "Cancel",
      variant: "info",
      onConfirm: async () => {
        setIsExporting(true);
        try {
          await adminApi.post(`/admin/users/${currentUser.id}/export`, {});
          toast({
            title: "Conversations exported",
            description:
              "The full visitor history was sent to your admin email.",
          });
        } catch {
          toast({
            title: "Unable to export conversations",
            description: "Please try again.",
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
      onConfirm: async () => {
        const result = await emitConversationAction(activeConv.id);
        if (!result.ok) {
          toast({
            title: "Unable to end conversation",
            description: result.error || "Please try again.",
            variant: "destructive",
          });
          return;
        }
        setConversations((previous) =>
          previous.map((conversation) =>
            conversation.id === activeConv.id
              ? { ...conversation, status: "closed" }
              : conversation,
          ),
        );
        toast({
          title: "Conversation ended",
          description: "The visitor has been notified.",
        });
      },
    });
  };

  const emitConversationAction = (
    conversationId: string,
  ): Promise<{ ok: boolean; error?: string }> =>
    new Promise((resolve) => {
      getSocket()
        .timeout(10_000)
        .emit(
          "close_conversation",
          conversationId,
          (error: Error | null, result?: { ok?: boolean; error?: string }) => {
            if (error)
              return resolve({ ok: false, error: "The request timed out" });
            resolve({ ok: Boolean(result?.ok), error: result?.error });
          },
        );
    });

  const handleDeleteConversation = (conversationId?: string) => {
    const targetConversationId =
      conversationId || conversations[conversations.length - 1]?.id;
    if (!targetConversationId) return;
    confirmation.showConfirmation({
      title: "Delete conversation?",
      message:
        "This permanently removes the conversation and its message history. This cannot be undone.",
      confirmText: "Delete conversation",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: async () => {
        try {
          await adminApi.delete(`/admin/chats/${targetConversationId}`);
        } catch (error: any) {
          toast({
            title: "Unable to delete chat",
            description: error?.response?.data?.error || "Please try again.",
            variant: "destructive",
          });
          return;
        }
        setConversations((previous) =>
          previous.filter(
            (conversation) => conversation.id !== targetConversationId,
          ),
        );
        if (
          targetConversationId === conversations[conversations.length - 1]?.id
        ) {
          setSelectedUserId(null);
          setIsChatFocused(false);
        }
        toast({
          title: "Conversation deleted",
          description: "The message history was permanently removed.",
        });
      },
    });
  };

  const handleDeleteUser = () => {
    if (!currentUser) return;
    if (
      conversations.some((conversation) => conversation.status !== "closed")
    ) {
      toast({
        title: "End active chats first",
        description:
          "A visitor cannot be deleted while they have an active chat.",
        variant: "destructive",
      });
      return;
    }
    confirmation.showConfirmation({
      title: "Delete visitor and all history?",
      message: `This permanently deletes ${getDisplayName(currentUser)}, every conversation, and all associated messages. This cannot be undone.`,
      confirmText: "Delete visitor",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: async () => {
        try {
          await adminApi.delete(`/admin/users/${currentUser.id}`);
        } catch (error: any) {
          toast({
            title: "Unable to delete visitor",
            description: error?.response?.data?.error || "Please try again.",
            variant: "destructive",
          });
          return;
        }
        setUsers((previous) =>
          previous.filter((candidate) => candidate.id !== currentUser.id),
        );
        setSelectedUserId(null);
        setIsChatFocused(false);
        toast({
          title: "Visitor deleted",
          description:
            "Their conversations and messages were permanently removed.",
        });
      },
    });
  };

  const handleDeleteAllConversations = () => {
    if (!currentUser) return;
    if (
      conversations.some((conversation) => conversation.status !== "closed")
    ) {
      toast({
        title: "End active chats first",
        description:
          "Conversation history can only be deleted after every chat is closed.",
        variant: "destructive",
      });
      return;
    }
    confirmation.showConfirmation({
      title: "Delete all conversations?",
      message: `This permanently deletes every session and message for ${getDisplayName(currentUser)}. The visitor profile will be kept.`,
      confirmText: "Delete all conversations",
      cancelText: "Cancel",
      variant: "danger",
      onConfirm: async () => {
        try {
          await adminApi.delete(`/admin/users/${currentUser.id}/conversations`);
        } catch (error: any) {
          toast({
            title: "Unable to delete conversations",
            description: error?.response?.data?.error || "Please try again.",
            variant: "destructive",
          });
          return;
        }
        setConversations([]);
        clearMessages();
        toast({
          title: "Conversations deleted",
          description:
            "All sessions for this visitor were permanently removed.",
        });
      },
    });
  };

  const performLogout = async () => {
    try {
      await adminApi.post("/auth/admin/logout");

      router.push("/admin/auth");
    } catch (err) {
      Console.error(err);
      toast({
        title: "Unable to log out",
        description: "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleLogout = () => {
    confirmation.showConfirmation({
      title: "Log out of the inbox?",
      message: "You will need to sign in again to access conversations.",
      confirmText: "Log out",
      cancelText: "Stay signed in",
      variant: "warning",
      onConfirm: performLogout,
    });
  };

  const handleSelectUser = (userId?: string) => {
    if (!userId) {
      if (selectedUserId && input) {
        setDrafts((previous) => ({ ...previous, [selectedUserId]: input }));
      }
      setSelectedUserId(null);
      setIsChatFocused(false);
      return;
    }
    if (selectedUserId && selectedUserId !== userId && input) {
      setDrafts((previous) => ({ ...previous, [selectedUserId]: input }));
    }
    setInput(drafts[userId] || "");
    setSelectedUserId(userId);
    setIsChatFocused(true);
    setSidebarOpen(false);
    setDetailsOpen(false);
  };

  const currentUser = users.find((u) => u.id === selectedUserId);
  const isUserOnline = currentUser && onlineUsers.has(currentUser.id);
  const activeConversation = conversations[conversations.length - 1];
  const hasActiveConversation = conversations.some(
    (conversation) => conversation.status !== "closed",
  );
  const activeMessageCount = conversations.reduce(
    (total, conversation) => total + conversation.messages.length,
    0,
  );
  const openDetails = () => {
    if (!currentUser) return;
    setDetailsOpen(true);
  };
  const visibleUsers = useMemo(
    () =>
      filteredUsers.filter((candidate) => {
        if (activeFilter === "unread") {
          return (conversationUnreadCounts[candidate.id] || 0) > 0;
        }
        if (activeFilter === "open") return onlineUsers.has(candidate.id);
        return true;
      }),
    [activeFilter, conversationUnreadCounts, filteredUsers, onlineUsers],
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100 text-slate-900 [&_button:not(:disabled)]:cursor-pointer [&_button:disabled]:cursor-not-allowed dark:bg-slate-950 dark:text-slate-100">
      {/* Sidebar Overlay for Mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/25 md:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close conversation list"
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed md:relative z-30 top-0 left-0 h-full w-[21rem] max-w-[88vw] border-r border-slate-200/80 bg-white shadow-2xl shadow-slate-950/10 dark:border-slate-800 dark:bg-slate-900 md:shadow-none flex flex-col transition-transform duration-200 motion-reduce:transition-none ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        } overflow-hidden`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 dark:border-slate-800">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
              Support
            </p>
            <h1 className="mt-0.5 text-lg font-semibold tracking-tight">
              Inbox
            </h1>
          </div>
          <div className="flex items-center gap-1">
            <DarkModeToggle />
            <button
              onClick={handleLogout}
              aria-label="Sign out"
              title="Sign out"
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <LogOut size={20} />
            </button>
            <button
              onClick={() => setSidebarOpen(false)}
              aria-label="Close conversation list"
              className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="border-b border-slate-100 p-3 dark:border-slate-800">
          <label className="relative block">
            <span className="sr-only">Search conversations</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search people or email"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-9 pr-3 text-sm outline-none transition focus:border-primary focus:bg-white focus:ring-4 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-800 dark:focus:bg-slate-800"
            />
          </label>
          <div
            className="mt-3 flex items-center gap-1"
            role="group"
            aria-label="Conversation filters"
          >
            {[
              ["all", "All"],
              ["unread", "Unread"],
              ["open", "Online"],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() =>
                  setActiveFilter(value as "all" | "unread" | "open")
                }
                className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${activeFilter === value ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
              >
                {label}
              </button>
            ))}
            <span className="ml-auto text-xs text-slate-400">
              {visibleUsers.length}
            </span>
          </div>
        </div>

        {/* User List */}
        {loadStatus.users ? (
          <div
            className="space-y-3 p-4"
            aria-label="Loading conversations"
            aria-busy="true"
          >
            {[1, 2, 3, 4, 5].map((item) => (
              <div key={item} className="flex animate-pulse items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-slate-200 dark:bg-slate-800" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-2/5 rounded bg-slate-200 dark:bg-slate-800" />
                  <div className="h-3 w-3/4 rounded bg-slate-100 dark:bg-slate-800" />
                </div>
              </div>
            ))}
          </div>
        ) : visibleUsers.length > 0 ? (
          <div
            className="flex-1 overflow-y-auto p-2"
            aria-label="Conversations"
          >
            {visibleUsers.map((u) => (
              <button
                key={u.id}
                onClick={() => {
                  handleSelectUser(u.id);
                }}
                className={`mb-1 flex w-full items-center gap-3 rounded-xl p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 cursor-pointer ${
                  selectedUserId === u.id
                    ? "bg-primary/10 shadow-sm"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800"
                }`}
              >
                <div className="relative shrink-0">
                  <img
                    src={`https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${u.id}`}
                    alt=""
                    className="h-11 w-11 rounded-full bg-slate-100"
                  />
                  {onlineUsers.has(u.id) && (
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <p className="truncate text-sm font-semibold">
                      {getDisplayName(u)}
                    </p>
                    {conversationUnreadCounts[u.id] > 0 && (
                      <span className="ml-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-bold text-white">
                        {conversationUnreadCounts[u.id]}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                    {conversationUnreadCounts[u.id]
                      ? "New visitor message"
                      : u.email}
                  </p>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center px-8 text-center">
            <MessageSquare
              className="mb-3 h-8 w-8 text-slate-300"
              aria-hidden="true"
            />
            <p className="text-sm font-medium">No conversations found</p>
            <p className="mt-1 text-xs text-slate-500">
              Try another search or filter.
            </p>
          </div>
        )}
      </div>

      {/* Main Chat Area */}
      <main className="min-w-0 flex-1 flex flex-col transition-all duration-300">
        {selectedUserId && currentUser ? (
          <>
            {/* Chat Header */}
            <header className="flex min-h-16 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <button
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open conversation list"
                  className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800 md:hidden"
                >
                  <MenuIcon size={24} />
                </button>
                <div className="relative">
                  <img
                    src={`https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${currentUser.id}`}
                    alt=""
                    className="h-10 w-10 rounded-full bg-slate-100"
                  />
                  {onlineUsers.has(currentUser.id) && (
                    <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
                  )}
                </div>
                <div>
                  <h2 className="truncate font-semibold tracking-tight">
                    {getDisplayName(currentUser)}
                  </h2>
                  <p className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${isUserOnline ? "bg-emerald-500" : "bg-slate-400"}`}
                    />
                    {isUserOnline ? "Online now" : "Away"}
                  </p>
                </div>
              </div>

              {/* Menu */}
              <div className="flex items-center gap-1">
                {isExporting && (
                  <span className="text-xs flex items-center gap-1">
                    <Loader2 size={15} className="animate-spin" /> Exporting...
                  </span>
                )}
                <button
                  onClick={openDetails}
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white xl:hidden cursor-pointer"
                  aria-label="Open customer details"
                >
                  <Info size={19} />
                </button>
                <Menu as="div" className="relative">
                  <MenuButton
                    aria-label="Conversation actions"
                    className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                  >
                    <EllipsisVertical size={20} />
                  </MenuButton>
                  <Transition>
                    <MenuItems className="absolute right-0 z-50 mt-2 w-52 origin-top-right rounded-xl border border-slate-200 bg-white p-1 shadow-xl focus:outline-none dark:border-slate-700 dark:bg-slate-900">
                      <MenuItem>
                        {({ active }: any) => (
                          <button
                            onClick={() => handleSelectUser()}
                            className={`${active ? "bg-slate-100 dark:bg-slate-800" : ""} w-full rounded-lg px-3 py-2 text-left text-sm cursor-pointer flex items-center gap-2`}
                          >
                            Close
                          </button>
                        )}
                      </MenuItem>

                      <MenuItem>
                        {({ active }: any) => (
                          <button
                            onClick={() => handleExport()}
                            disabled={isExporting}
                            className={`${active ? "bg-slate-100 dark:bg-slate-800" : ""} w-full rounded-lg px-3 py-2 text-left text-sm flex items-center gap-2 cursor-pointer`}
                          >
                            <Download size={16} /> Export conversation
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
                            className={`${active ? "bg-slate-100 dark:bg-slate-800" : ""} w-full rounded-lg px-3 py-2 text-left text-sm flex items-center gap-2 cursor-pointer`}
                          >
                            <Send size={16} /> Send conversation
                          </button>
                        )}
                      </MenuItem>

                      {conversations[conversations.length - 1]?.status !==
                        "closed" && (
                        <MenuItem>
                          {({ active }: any) => (
                            <button
                              onClick={handleCloseConversation}
                              className={`${active ? "bg-red-50 dark:bg-red-950/30" : ""} w-full rounded-lg px-3 py-2 text-left text-sm text-red-600 cursor-pointer flex items-center gap-2`}
                            >
                              <MessageCircleX size={16} />
                              End Conversation
                            </button>
                          )}
                        </MenuItem>
                      )}
                      <MenuItem>
                        {({ active }: any) => (
                          <button
                            onClick={handleDeleteAllConversations}
                            disabled={hasActiveConversation}
                            title={
                              hasActiveConversation
                                ? "End every active chat before deleting history"
                                : undefined
                            }
                            className={`${active ? "bg-red-50 dark:bg-red-950/30" : ""} flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 disabled:cursor-not-allowed disabled:opacity-45 cursor-pointer`}
                          >
                            <Trash2 size={16} />
                            Delete conversation history
                          </button>
                        )}
                      </MenuItem>
                    </MenuItems>
                  </Transition>
                </Menu>
              </div>
            </header>

            {/* Messages */}
            {loadStatus.chat ? (
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 size={30} className="animate-spin" />
              </div>
            ) : (
              <div
                ref={messagesContainerRef}
                onScroll={handleMessageScroll}
                className="relative flex-1 overflow-y-auto bg-slate-50 px-4 py-5 dark:bg-slate-950 sm:px-6 lg:px-8"
                aria-label="Conversation messages"
              >
                {conversations.map((conv: any, i) => {
                  const isCurrent = i === conversations.length - 1;
                  const isMinimized =
                    !isCurrent && (minimized[conv.id] ?? true);

                  return (
                    <section key={conv.id} className="mx-auto mb-6 max-w-3xl">
                      <div className="mx-auto mb-5 flex w-fit items-center gap-1 rounded-full border border-slate-200 bg-white p-1 text-xs font-medium text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                        <button
                          type="button"
                          className="flex items-center gap-2 rounded-full px-2 py-0.5 transition hover:text-slate-700 dark:hover:text-slate-200"
                          onClick={() => {
                            if (isCurrent) return;
                            setMinimized((prev) => ({
                              ...prev,
                              [conv.id]: !isMinimized,
                            }));
                          }}
                        >
                          <Archive size={13} aria-hidden="true" />
                          {isMinimized
                            ? "Show earlier conversation"
                            : isCurrent
                              ? "Current conversation"
                              : "Hide earlier conversation"}
                          {!isCurrent && (
                            <span className="text-slate-400">
                              · {formatDateTime(conv.createdAt)}
                            </span>
                          )}
                          {!isCurrent && (
                            <ChevronDown
                              className={`h-3 w-3 transition-transform ${isMinimized ? "" : "rotate-180"}`}
                              aria-hidden="true"
                            />
                          )}
                        </button>
                        <span className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
                        <button
                          type="button"
                          onClick={() => handleExportChat(conv.id)}
                          className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-primary dark:hover:bg-slate-800"
                          aria-label="Export this chat"
                          title="Export this chat"
                        >
                          <Download size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSendChat(conv.id)}
                          className="rounded-full p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-primary dark:hover:bg-slate-800"
                          aria-label="Send this chat transcript"
                          title="Send this chat transcript"
                        >
                          <Send size={13} />
                        </button>
                        {conv.status === "closed" && (
                          <button
                            type="button"
                            onClick={() => handleDeleteConversation(conv.id)}
                            className="rounded-full p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
                            aria-label="Delete this closed conversation"
                            title="Delete this closed conversation"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                      {!isMinimized && (
                        <div>
                          {conv.messages.map((msg: any, idx: any) => {
                            const previousMessage = conv.messages[idx - 1];
                            const isAdmin =
                              msg.senderId === "admin" ||
                              msg.senderRole === "admin";
                            const isAI =
                              msg.senderId === "ai" ||
                              msg.sender?.role === "ai" ||
                              msg.senderId === "system";
                            const isGrouped =
                              previousMessage &&
                              previousMessage.senderId === msg.senderId &&
                              new Date(msg.timestamp).getTime() -
                                new Date(previousMessage.timestamp).getTime() <
                                5 * 60_000;
                            return (
                              <div key={msg.id || idx}>
                                {(!previousMessage ||
                                  !isSameDay(
                                    new Date(msg.timestamp).getTime(),
                                    new Date(
                                      previousMessage.timestamp,
                                    ).getTime(),
                                  )) && (
                                  <div className="my-5 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400 before:h-px before:flex-1 before:bg-slate-200 after:h-px after:flex-1 after:bg-slate-200 dark:before:bg-slate-800 dark:after:bg-slate-800">
                                    {new Intl.DateTimeFormat("en-GB", {
                                      weekday: "short",
                                      day: "numeric",
                                      month: "short",
                                    }).format(new Date(msg.timestamp))}
                                  </div>
                                )}
                                <div
                                  className={`flex items-end gap-2 ${isGrouped ? "mt-1" : "mt-4"} ${isAdmin || isAI ? "ml-auto flex-row-reverse" : "mr-auto"}`}
                                >
                                  <div className="w-7 shrink-0">
                                    {!isGrouped && (
                                      <img
                                        className="h-7 w-7 rounded-full bg-white object-cover"
                                        src={
                                          isAdmin
                                            ? "/images/logo.png"
                                            : isAI
                                              ? "https://api.dicebear.com/10.x/bottts-neutral/svg?seed=Nadia"
                                              : `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${currentUser.id}`
                                        }
                                        alt=""
                                      />
                                    )}
                                  </div>
                                  <div
                                    className={`relative inline-flex max-w-[85%] flex-col rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed shadow-sm ${
                                      isAdmin
                                        ? "rounded-br-md bg-primary text-white"
                                        : isAI
                                          ? "rounded-br-md border border-violet-200 bg-violet-50 text-violet-950 dark:border-violet-900/70 dark:bg-violet-950/35 dark:text-violet-100"
                                          : "rounded-bl-md border border-slate-200 bg-white text-slate-800 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100"
                                    }`}
                                    style={{
                                      wordBreak: "break-word",
                                      overflowWrap: "anywhere",
                                    }}
                                  >
                                    {!isGrouped && (
                                      <span
                                        className={`mb-1 text-[10px] font-semibold ${isAdmin ? "text-white/80" : isAI ? "text-violet-700 dark:text-violet-300" : "text-slate-500"}`}
                                      >
                                        {isAdmin
                                          ? "You"
                                          : isAI
                                            ? "Robot"
                                            : getDisplayName(currentUser)}
                                      </span>
                                    )}
                                    <div
                                      className="chat-content"
                                      dangerouslySetInnerHTML={{
                                        __html: sanitizedContent(msg.content),
                                      }}
                                    />

                                    <span
                                      className={`mt-1 self-end text-[10px] ${isAdmin ? "text-white/70" : "text-slate-400"}`}
                                    >
                                      {new Date(
                                        msg.timestamp,
                                      ).toLocaleTimeString("en-GB", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: true,
                                      })}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  );
                })}

                {/* Typing */}
                {selectedUserId && typingUsers.has(selectedUserId) && (
                  <div className="mx-auto mt-4 flex max-w-3xl items-center gap-2 text-sm text-slate-500">
                    <img
                      className="h-7 w-7 rounded-full object-cover"
                      src={`https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${currentUser.id}`}
                      alt=""
                    />
                    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                      <div className="flex gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-[typing_1.2s_ease-in-out_infinite] motion-reduce:animate-none"></span>
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-[typing_1.2s_ease-in-out_infinite] [animation-delay:0.15s] motion-reduce:animate-none"></span>
                        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-[typing_1.2s_ease-in-out_infinite] [animation-delay:0.3s] motion-reduce:animate-none"></span>
                      </div>
                      <span className="text-xs">
                        {getDisplayName(currentUser)} is typing
                      </span>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
                {showJumpToLatest && (
                  <button
                    onClick={() => scrollToLatest()}
                    className="sticky bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-lg transition hover:bg-slate-700 dark:bg-white dark:text-slate-900"
                    aria-label="Jump to latest message"
                  >
                    Jump to latest
                  </button>
                )}
              </div>
            )}

            {/* Input */}
            {conversations.length > 0 &&
              conversations[conversations.length - 1]?.status !== "closed" && (
                <div className="shrink-0 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900 sm:p-4">
                  <div className="mx-auto flex max-w-3xl flex-col items-end gap-2 sm:flex-row">
                    <div className="flex-1 min-w-0 rich-text-wrapper">
                      <ReactQuill
                        theme="snow"
                        value={input}
                        onChange={(content) => {
                          setInput(content);
                          startTypingEmit();
                          if (selectedUserId) {
                            setDrafts((previous) => ({
                              ...previous,
                              [selectedUserId]: content,
                            }));
                          }
                        }}
                        onFocus={() => setFocus(true)}
                        onBlur={() => setFocus(false)}
                        onKeyDown={(e) => {
                          handleKeyDown(e);
                        }}
                        placeholder="Reply to this conversation…"
                        modules={modules}
                        formats={formats}
                      />
                    </div>
                    <button
                      onClick={() => handleSend()}
                      disabled={isInputEmpty || isSendingMessage}
                      aria-label="Send message"
                      title="Send message (Enter)"
                      className={`rounded-xl p-3 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${!isInputEmpty && !isSendingMessage ? "bg-primary text-white shadow-sm hover:-translate-y-0.5 hover:shadow-md cursor-pointer" : "bg-slate-100 text-slate-400 dark:bg-slate-800 cursor-not-allowed"}`}
                    >
                      {isSendingMessage ? (
                        <Loader2 size={20} className="animate-spin" />
                      ) : (
                        <ArrowUp size={20} />
                      )}
                    </button>
                  </div>
                  <p className="mx-auto mt-1.5 max-w-3xl text-xs text-slate-400">
                    Press{" "}
                    <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-sans text-[10px] dark:border-slate-700 dark:bg-slate-800">
                      Enter
                    </kbd>{" "}
                    to send ·{" "}
                    <kbd className="rounded border border-slate-200 bg-slate-50 px-1 py-0.5 font-sans text-[10px] dark:border-slate-700 dark:bg-slate-800">
                      Shift + Enter
                    </kbd>{" "}
                    for a new line
                  </p>
                </div>
              )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center text-slate-500">
            <button
              onClick={() => setSidebarOpen(true)}
              aria-label="Open conversation list"
              className="mb-4 rounded-xl bg-primary p-3 text-white shadow-lg md:hidden"
            >
              <MenuIcon size={24} />
            </button>
            <MessageSquare
              className="mb-4 h-10 w-10 text-slate-300"
              aria-hidden="true"
            />
            <h2 className="text-base font-semibold text-slate-700 dark:text-slate-200">
              Your inbox is ready
            </h2>
            <p className="mt-1 max-w-xs text-sm">
              Choose a conversation to read its history and reply.
            </p>
          </div>
        )}
      </main>

      {currentUser && (
        <>
          <aside
            className="hidden w-80 shrink-0 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 xl:flex"
            aria-label="Customer details"
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
              <h2 className="text-sm font-semibold">Customer details</h2>
              <button
                onClick={openDetails}
                className="text-xs font-medium text-primary hover:underline"
              >
                View profile
              </button>
            </div>
            <div className="space-y-6 overflow-y-auto p-5">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <img
                    src={`https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${currentUser.id}`}
                    alt=""
                    className="h-12 w-12 rounded-full bg-slate-100"
                  />
                  {isUserOnline && (
                    <span className="absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white bg-emerald-500 dark:border-slate-900" />
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold">
                    {getDisplayName(currentUser)}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {isUserOnline ? "Online now" : "Offline"}
                  </p>
                </div>
              </div>
              <section>
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Contact
                </h3>
                <dl className="space-y-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Mail className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div className="min-w-0">
                      <dt className="sr-only">Email</dt>
                      <dd className="break-all text-slate-600 dark:text-slate-300">
                        {currentUser.email || "Not provided"}
                      </dd>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Phone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                    <div>
                      <dt className="sr-only">Phone</dt>
                      <dd className="text-slate-600 dark:text-slate-300">
                        +{currentUser.phone || "Not provided"}
                      </dd>
                    </div>
                  </div>
                </dl>
              </section>
              <section>
                <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Conversation
                </h3>
                <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Status</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${activeConversation?.status === "closed" ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"}`}
                    >
                      {activeConversation?.status === "closed"
                        ? "Closed"
                        : "Open"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Messages</span>
                    <span className="font-medium">{activeMessageCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Joined</span>
                    <span className="font-medium">
                      {formatRelativeTime(currentUser.createdAt)}
                    </span>
                  </div>
                </div>
              </section>
              <section>
                <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                  Workspace
                </h3>
                <p className="rounded-xl bg-slate-50 p-3 text-xs leading-relaxed text-slate-500 dark:bg-slate-800/70">
                  Tags, assignment and activity history can be added here as the
                  support workflow grows.
                </p>
              </section>
            </div>
          </aside>

          <CustomerDetailsDrawer
            user={currentUser}
            isOnline={Boolean(isUserOnline)}
            conversationStatus={activeConversation?.status}
            messageCount={activeMessageCount}
            isOpen={detailsOpen}
            onClose={() => setDetailsOpen(false)}
            onExportAllConversations={handleExportAllConversations}
            onDeleteAllConversations={handleDeleteAllConversations}
            onDeleteUser={handleDeleteUser}
            canDeleteHistory={!hasActiveConversation}
            onUpdate={(updatedUser) =>
              setUsers((previous) =>
                previous.map((candidate) =>
                  candidate.id === updatedUser.id ? updatedUser : candidate,
                ),
              )
            }
          />

          {false && detailsOpen && (
            <>
              {/*
            <div
              className="fixed inset-0 z-50"
              role="dialog"
              aria-modal="true"
              aria-label="Customer details"
            >
              <button
                className="absolute inset-0 cursor-default bg-slate-950/30"
                onClick={() => setDetailsOpen(false)}
                aria-label="Close customer details"
              />
              <aside className="absolute bottom-0 right-0 top-0 flex w-[21rem] max-w-[92vw] flex-col bg-white shadow-2xl dark:bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
                  <h2 className="font-semibold">Customer details</h2>
                  <button
                    onClick={() => setDetailsOpen(false)}
                    className="rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800"
                    aria-label="Close customer details"
                  >
                    <X size={18} />
                  </button>
                </div>
                <div className="space-y-6 overflow-y-auto p-5">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <img
                        src={`https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${currentUser.id}`}
                        alt=""
                        className="h-14 w-14 rounded-full bg-slate-100"
                      />
                      <span
                        className={`absolute bottom-0 right-0 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900 ${isUserOnline ? "bg-emerald-500" : "bg-slate-400"}`}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold">
                        {getDisplayName(currentUser)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {isUserOnline ? "Online now" : "Offline"}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setDetailsForm(currentUser);
                        setIsEditingDetails((value) => !value);
                      }}
                      className="ml-auto rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white"
                      aria-label={
                        isEditingDetails
                          ? "Stop editing profile"
                          : "Edit profile"
                      }
                    >
                      <Edit3 size={17} />
                    </button>
                  </div>

                  <section>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                        Contact details
                      </h3>
                      {isEditingDetails && (
                        <span className="text-[11px] text-slate-400">
                          All fields required
                        </span>
                      )}
                    </div>
                    <div className="space-y-3">
                      {[
                        ["firstName", "First name"],
                        ["lastName", "Last name"],
                        ["email", "Email address"],
                        ["phone", "Phone number"],
                        ["country", "Country"],
                      ].map(([field, label]) => (
                        <label
                          key={field}
                          className="block text-xs font-medium text-slate-500 dark:text-slate-400"
                        >
                          {label}
                          {isEditingDetails ? (
                            <input
                              value={
                                (detailsForm[field as keyof User] as string) ||
                                ""
                              }
                              onChange={(event) =>
                                updateDetailsField(
                                  field as keyof User,
                                  event.target.value,
                                )
                              }
                              type={field === "email" ? "email" : "text"}
                              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                            />
                          ) : (
                            <span className="mt-1 block break-words text-sm font-normal text-slate-700 dark:text-slate-200">
                              {(currentUser[field as keyof User] as string) ||
                                "Not provided"}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                  </section>

                  <section>
                    <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      Conversation
                    </h3>
                    <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Status</span>
                        <span>
                          {activeConversation?.status === "closed"
                            ? "Closed"
                            : "Open"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Messages</span>
                        <span>{activeMessageCount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Joined</span>
                        <span>
                          {currentUser.createdAt
                            ? formatDateTime(currentUser.createdAt)
                            : "Unknown"}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Visitor ID</span>
                        <span
                          className="max-w-32 truncate font-mono text-xs"
                          title={currentUser.id}
                        >
                          {currentUser.id}
                        </span>
                      </div>
                    </div>
                  </section>
                </div>
                {isEditingDetails && (
                  <div className="flex gap-2 border-t border-slate-200 p-4 dark:border-slate-800">
                    <button
                      onClick={() => {
                        setDetailsForm(currentUser);
                        setIsEditingDetails(false);
                      }}
                      disabled={isSavingDetails}
                      className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveDetails}
                      disabled={isSavingDetails}
                      className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
                    >
                      {isSavingDetails ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4" />
                      )}
                      {isSavingDetails ? "Saving…" : "Save changes"}
                    </button>
                  </div>
                )}
              </aside>
            </div>
            */}
            </>
          )}
        </>
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
}
