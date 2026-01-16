import Cookies from "js-cookie";
import { Visitor } from "@/types";

const USER_KEY = "chat_user";
const CONVO_KEY = "chat_conversation";

export const setUserCookie = (user: Visitor, days = 7) => {
  Cookies.set(USER_KEY, JSON.stringify(user), {
    expires: days,
    sameSite: "Lax",
  });
};

export const getUserCookie = (): Visitor | null => {
  const cookie = Cookies.get(USER_KEY);
  return cookie ? JSON.parse(cookie) : null;
};

export const removeUserCookie = () => {
  Cookies.remove(USER_KEY);
};

export const setConversationCookie = (conversationId: string, days = 7) => {
  Cookies.set(CONVO_KEY, conversationId, { expires: days, sameSite: "Lax" });
};

export const getConversationCookie = (): string | null => {
  return Cookies.get(CONVO_KEY) || null;
};

export const removeConversationCookie = () => {
  Cookies.remove(CONVO_KEY);
};
