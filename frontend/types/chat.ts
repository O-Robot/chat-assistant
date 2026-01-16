import { Status } from "@/types";

export type Message = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  timestamp: number;
  formattedTime?: string;
  status?: "sent" | "delivered" | "read";
  sender?: any;
};

export type Conversation = {
  id: string;
  visitorId: string;
  messages: Message[];
  status: "active" | "waiting" | "ended";
  startedAt: number;
  endedAt?: number;
};

export type ChatStatus = Status;
