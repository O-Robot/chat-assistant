import { Status, UserRole } from "@/types";

export type User = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country: string;
  role: UserRole;
  status: Status;
  avatarUrl: string;
  createdAt?:string
};

export type Visitor = User & {
  role: UserRole.VISITOR;
  conversationId: string;
  ipAddress?: string;
  lastSeen?: number;
};
