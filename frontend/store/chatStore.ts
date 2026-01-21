import { create } from "zustand";
import { Message, User, UserRole } from "@/types";
import { getSocket } from "@/lib/socket";
import { Console } from "@/lib/constants";

interface ChatState {
  messages: Message[];
  user: User | null;
  conversations: Record<string, Message[]>;
  onlineUsers: Set<string>;
  isChatFocused: boolean;
  selectedVisitorId: string | null;
  role: UserRole | null;
  typingUsers: Set<string>;
  isLoadingMessages: boolean;
  isSendingMessage: boolean;
  isAIResponding: boolean;
  hasPlayedNotificationOnLoad: boolean;
  conversationClosed: boolean;
  unreadCount: number;
  lastReadMessageId: string | null;

  startTyping: (userId: string) => void;
  stopTyping: (userId: string) => void;
  setUser: (user: User) => void;
  addMessage: (message: Message) => void;
  clearMessages: () => void;
  sendMessage: (message: Omit<Message, "id" | "timestamp">) => Promise<void>;
  receiveMessage: (message: Message) => void;
  setSelectedVisitorId: (visitorId: string | null) => void;
  setIsChatFocused: (focused: boolean) => void;
  updateOnlineStatus: (userId: string, isOnline: boolean) => void;
  setOnlineUsers: (userIds: string[]) => void;
  setRole: (role: UserRole) => void;
  clearChat: () => void;
  setLoadingMessages: (loading: boolean) => void;
  setSendingMessage: (sending: boolean) => void;
  setAIResponding: (responding: boolean) => void;
  loadMessagesFromLocalStorage: (conversationId: string) => void;
  saveMessagesToLocalStorage: (conversationId: string) => void;
  playNotificationSound: () => void;
  initializeSocketListeners: () => void;
  setHasPlayedNotificationOnLoad: (value: boolean) => void;
  resetUnreadCount: () => void;
  incrementUnreadCount: () => void;
}

const STORAGE_PREFIX = "chat-messages-";
const LAST_SYNC_PREFIX = "chat-last-sync-";
const LAST_READ_PREFIX = "chat-last-read-";

const getStorage = () => {
  if (typeof window === "undefined") return null;
  return localStorage;
};

const parseStorageData = (data: string | null): Message[] => {
  try {
    return data ? JSON.parse(data).filter(Boolean) : [];
  } catch {
    return [];
  }
};

const stringifyData = (data: Message[]): string => {
  try {
    return JSON.stringify(data);
  } catch {
    return "[]";
  }
};

// Simple notification sound
const playSound = () => {
  if (typeof window === "undefined") return;

  try {
    const audioContext = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(
      0.01,
      audioContext.currentTime + 0.5,
    );

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
  } catch (error) {
    Console.error("Error playing notification sound:", error);
  }
};

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  user: null,
  conversations: {},
  onlineUsers: new Set(["system"]), // System is always online
  isChatFocused: true,
  selectedVisitorId: null,
  role: null,
  typingUsers: new Set(),
  isLoadingMessages: false,
  isSendingMessage: false,
  isAIResponding: false,
  hasPlayedNotificationOnLoad: false,
  conversationClosed: false,
  unreadCount: 0,
  lastReadMessageId: null,

  setLoadingMessages: (loading) => set({ isLoadingMessages: loading }),
  setSendingMessage: (sending) => set({ isSendingMessage: sending }),
  setAIResponding: (responding) => set({ isAIResponding: responding }),
  setHasPlayedNotificationOnLoad: (value) =>
    set({ hasPlayedNotificationOnLoad: value }),

  resetUnreadCount: () => {
    const { messages } = get();
    const storage = getStorage();

    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      set({
        unreadCount: 0,
        lastReadMessageId: lastMessage.id,
      });

      if (storage && lastMessage.conversationId) {
        const key = LAST_READ_PREFIX + lastMessage.conversationId;
        storage.setItem(key, lastMessage.id);
      }
    } else {
      set({ unreadCount: 0 });
    }
  },

  incrementUnreadCount: () => {
    set((state) => ({ unreadCount: state.unreadCount + 1 }));
  },

  loadMessagesFromLocalStorage: (conversationId) => {
    const storage = getStorage();
    if (!storage) return;

    const key = STORAGE_PREFIX + conversationId;
    const lastReadKey = LAST_READ_PREFIX + conversationId;

    const storedData = storage.getItem(key);
    const storedMessages = parseStorageData(storedData);
    const lastReadMessageId = storage.getItem(lastReadKey);

    // Calculate unread count
    let unreadCount = 0;
    const { user } = get();

    if (lastReadMessageId && storedMessages.length > 0) {
      const lastReadIndex = storedMessages.findIndex(
        (m) => m.id === lastReadMessageId,
      );
      if (lastReadIndex !== -1) {
        unreadCount = storedMessages
          .slice(lastReadIndex + 1)
          .filter(
            (m) => m.senderId !== user?.id && m.senderId !== undefined,
          ).length;
      } else {
        unreadCount = storedMessages.filter(
          (m) => m.senderId !== user?.id && m.senderId !== undefined,
        ).length;
      }
    } else if (storedMessages.length > 0) {
      unreadCount = storedMessages.filter(
        (m) => m.senderId !== user?.id && m.senderId !== undefined,
      ).length;
    }

    set({
      messages: storedMessages,
      lastReadMessageId,
      unreadCount,
    });
  },

  saveMessagesToLocalStorage: (conversationId) => {
    const storage = getStorage();
    if (!storage) return;

    const { messages } = get();
    const key = STORAGE_PREFIX + conversationId;
    const lastSyncKey = LAST_SYNC_PREFIX + conversationId;

    storage.setItem(key, stringifyData(messages));
    storage.setItem(lastSyncKey, Date.now().toString());
  },

  playNotificationSound: () => {
    const { hasPlayedNotificationOnLoad } = get();
    if (hasPlayedNotificationOnLoad) {
      playSound();
    }
  },

  setUser: (user) => {
    set({ user });
    const socket = getSocket();

    if (user?.id && user?.firstName && user?.email && user?.role) {
      socket.emit("user_join", {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      });
    }
  },

  initializeSocketListeners: () => {
    const socket = getSocket();

    socket.on("connect", () => {
      Console.log("Socket reconnected");
      // System is always online
      const { user } = get();
      if (user?.id) {
        socket.emit("user_join", {
          id: user.id,
          firstName: user.firstName,
          lastName: user?.lastName,
          email: user.email,
          role: user.role,
        });
      }
      get().updateOnlineStatus("system", true);
    });

    socket.on("visitor_online", (visitorId: string) => {
      get().updateOnlineStatus(visitorId, true);
    });

    socket.on("visitor_offline", (visitorId: string) => {
      get().updateOnlineStatus(visitorId, false);
    });

    socket.on("visitors_online", (visitorIds: string[]) => {
      const allUsers = new Set([...visitorIds, "system"]);
      set({ onlineUsers: allUsers });
    });

    socket.on("users_online", (userIds: string[]) => {
      const allUsers = new Set([...userIds, "system"]);
      set({ onlineUsers: allUsers });
    });

    socket.on("user_online", (userId: string) => {
      get().updateOnlineStatus(userId, true);
    });

    socket.on("user_offline", (userId: string) => {
      get().updateOnlineStatus(userId, false);
    });

    socket.on("system_offline_for_conversation", (conversationId: string) => {
      Console.log("System offline for conversation:", conversationId);
      set((state) => {
        const newOnlineUsers = new Set(state.onlineUsers);
        newOnlineUsers.delete("system");
        return { onlineUsers: newOnlineUsers };
      });
    });

    socket.on("user_typing", (data: { id: string; conversationId: string }) => {
      if (data.id === "system") {
        get().setAIResponding(true);
        get().startTyping("system");
      } else {
        get().startTyping(data.id);
      }
    });

    socket.on(
      "user_stopped_typing",
      (data: { id: string; conversationId: string }) => {
        if (data.id === "system") {
          get().setAIResponding(false);
          get().stopTyping("system");
        } else {
          get().stopTyping(data.id);
        }
      },
    );

    socket.on("receive_message", (message: Message) => {
      get().receiveMessage(message);

      // If message is from system, AI is done responding
      if (message.senderId === "system") {
        get().setAIResponding(false);
      }
    });

    socket.on("conversation_closed", (conversationId: string) => {
      Console.log("Conversation closed:", conversationId);
      set({ conversationClosed: true, isAIResponding: false });
    });
  },

  setRole: (role) => {
    set({ role });
  },

  sendMessage: async (messageData) => {
    const { user, isSendingMessage, isAIResponding, onlineUsers } = get();

    const isAdminMode = onlineUsers.has("admin") && !onlineUsers.has("system");
    if (!isAdminMode && isAIResponding) {
      Console.log("AI is responding, message blocked");
      return;
    }

    if (!user || isSendingMessage) return;

    set({ isSendingMessage: true });

    try {
      const message: Message = {
        id: crypto.randomUUID(),
        ...messageData,
        timestamp: Date.now(),
      };

      set((state) => ({
        messages: [...state.messages, message],
      }));

      get().saveMessagesToLocalStorage(message.conversationId);

      const socket = getSocket();
      socket.emit("send_message", message);
    } catch (error) {
      Console.error("Error sending message:", error);
    } finally {
      set({ isSendingMessage: false });
    }
  },

  receiveMessage: (msg) => {
    const { user, messages, isChatFocused } = get();

    // Check if message already exists
    const exists = messages.some((m) => m.id === msg.id);
    if (exists) return;

    set((state) => ({
      messages: [...state.messages, msg],
    }));

    get().saveMessagesToLocalStorage(msg.conversationId);

    if (msg.senderId !== user?.id) {
      if (!isChatFocused) {
        get().incrementUnreadCount();
      }

      get().playNotificationSound();
    }
  },

  updateOnlineStatus: (userId, isOnline) => {
    set((state) => {
      const newOnlineUsers = new Set(state.onlineUsers);
      if (isOnline) {
        newOnlineUsers.add(userId);
      } else {
        newOnlineUsers.delete(userId);
      }
      if (userId !== "system") {
        newOnlineUsers.add("system");
      }
      return { onlineUsers: newOnlineUsers };
    });
  },

  setOnlineUsers: (userIds) => {
    const allUsers = new Set([...userIds, "system"]);
    set({ onlineUsers: allUsers });
  },

  setSelectedVisitorId: (visitorId) => set({ selectedVisitorId: visitorId }),

  setIsChatFocused: (focused) => {
    set({ isChatFocused: focused });
    if (focused) {
      get().resetUnreadCount();
    }
  },

  clearChat: () => {
    set({ messages: [] });
  },

  addMessage: (message) =>
    set((state) => ({
      messages: [...state.messages, message],
    })),

  clearMessages: () => {
    set({
      messages: [],
      hasPlayedNotificationOnLoad: false,
      unreadCount: 0,
      lastReadMessageId: null,
      isAIResponding: false,
    });
  },

  startTyping: (userId) =>
    set((state) => {
      const newSet = new Set(state.typingUsers);
      newSet.add(userId);
      return { typingUsers: newSet };
    }),

  stopTyping: (userId) =>
    set((state) => {
      const newSet = new Set(state.typingUsers);
      newSet.delete(userId);
      return { typingUsers: newSet };
    }),
}));
