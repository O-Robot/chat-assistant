import Cookies from "js-cookie";
import { Status, User, UserRole } from "@/types";
import { Console } from "./constants";

const USER_COOKIE_KEY = "chat_user";
const CONVERSATION_COOKIE_KEY = "chat_conversation";

export const setUserCookie = (user: User): void => {
  try {
    const validatedUser: User = {
      id: user.id,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      email: user.email || "",
      phone: user.phone || "",
      country: user.country || "",
      role: user.role || UserRole.VISITOR,
      status: user.status || Status.ONLINE,
      avatarUrl: user.avatarUrl || "",
    };

    Cookies.set(USER_COOKIE_KEY, JSON.stringify(validatedUser), {
      expires: 7,
      sameSite: "Lax",
      secure: process.env.NODE_ENV === "production",
    });

    Console.log("User cookie set with validated data:", validatedUser);
  } catch (error) {
    Console.error("Error setting user cookie:", error);
  }
};

export const getUserCookie = (): User | null => {
  try {
    const cookie = Cookies.get(USER_COOKIE_KEY);
    if (!cookie) return null;

    const user: User = JSON.parse(cookie);

    if (!user.id || !user.email || !user.role) {
      Console.warn("Invalid user cookie data, removing...");
      removeUserCookie();
      return null;
    }

    return {
      ...user,
      firstName: user.firstName || "",
      lastName: user.lastName || "",
      phone: user.phone || "",
      country: user.country || "",
      status: user.status || Status.ONLINE,
      avatarUrl: user.avatarUrl || "",
      role: user.role || UserRole.VISITOR,
    };
  } catch (error) {
    Console.error("Error reading user cookie:", error);
    removeUserCookie();
    return null;
  }
};

export const removeUserCookie = () => {
  Cookies.remove(USER_COOKIE_KEY);
};

export const setConversationCookie = (conversationId: string): void => {
  Cookies.set(CONVERSATION_COOKIE_KEY, conversationId, {
    expires: 7,
    sameSite: "Lax",
    secure: process.env.NODE_ENV === "production",
  });
};

export const getConversationCookie = (): string | null => {
  return Cookies.get(CONVERSATION_COOKIE_KEY) || null;
};

export const removeConversationCookie = () => {
  Cookies.remove(CONVERSATION_COOKIE_KEY);
};
