import { create } from "zustand";
import { Message, User, UserRole } from "@/types";
import { getSocket } from "@/lib/socket";

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
    console.error("Error playing notification sound:", error);
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
  hasPlayedNotificationOnLoad: false,
  conversationClosed: false,
  unreadCount: 0,
  lastReadMessageId: null,

  setLoadingMessages: (loading) => set({ isLoadingMessages: loading }),
  setSendingMessage: (sending) => set({ isSendingMessage: sending }),
  setHasPlayedNotificationOnLoad: (value) =>
    set({ hasPlayedNotificationOnLoad: value }),

  resetUnreadCount: () => {
    const { messages } = get();
    const storage = getStorage();

    // Mark the last message as read
    if (messages.length > 0) {
      const lastMessage = messages[messages.length - 1];
      set({
        unreadCount: 0,
        lastReadMessageId: lastMessage.id,
      });

      // Save to localStorage
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
      console.log("Socket connected");
      // System is always online
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
      // Remove system from online users for this specific conversation
      console.log("System offline for conversation:", conversationId);
      set((state) => {
        const newOnlineUsers = new Set(state.onlineUsers);
        newOnlineUsers.delete("system");
        return { onlineUsers: newOnlineUsers };
      });
    });

    socket.on("receive_message", (message: Message) => {
      get().receiveMessage(message);
    });

    socket.on("conversation_closed", (conversationId: string) => {
      console.log("Conversation closed:", conversationId);
      // Don't clear messages - just mark as closed
      set({ conversationClosed: true });
    });
  },

  setRole: (role) => {
    set({ role });
  },

  sendMessage: async (messageData) => {
    const { user, isSendingMessage } = get();
    if (!user || isSendingMessage) return;

    set({ isSendingMessage: true });

    try {
      const message: Message = {
        id: crypto.randomUUID(),
        ...messageData,
        timestamp: Date.now(),
      };

      // Optimistically add to local state
      set((state) => ({
        messages: [...state.messages, message],
      }));

      // Save to local storage
      get().saveMessagesToLocalStorage(message.conversationId);

      // Emit through socket
      const socket = getSocket();
      socket.emit("send_message", message);
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      set({ isSendingMessage: false });
    }
  },

  receiveMessage: (msg) => {
    const { user, messages, isChatFocused, lastReadMessageId } = get();

    // Check if message already exists
    const exists = messages.some((m) => m.id === msg.id);
    if (exists) return;

    set((state) => ({
      messages: [...state.messages, msg],
    }));

    // Save to local storage
    get().saveMessagesToLocalStorage(msg.conversationId);

    // Handle unread count and notifications for messages from others
    if (msg.senderId !== user?.id) {
      // Increment unread count if chat is not focused
      // Also increment if this message is after the last read message
      if (!isChatFocused) {
        get().incrementUnreadCount();
      }

      // Play notification sound
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
      // System is always online unless explicitly removed
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
    // Reset unread count when chat becomes focused
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
