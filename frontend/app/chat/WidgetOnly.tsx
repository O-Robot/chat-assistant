"use client";

import { useEffect } from "react";
import { ChatWidget } from "@/components/widget/ChatWidget";
import { useChatStore } from "@/store/chatStore";
import { Status, UserRole } from "@/types";

export default function WidgetOnly() {
  const { user, setUser } = useChatStore();

  useEffect(() => {
    if (!user) {
      const existingVisitorId = sessionStorage.getItem("visitor-id");
      const visitorId = existingVisitorId || crypto.randomUUID();

      if (!existingVisitorId) {
        sessionStorage.setItem("visitor-id", visitorId);
      }

      setUser({
        id: visitorId,
        email: "",
        phone: "",
        country: "",
        firstName: `Visitor ${visitorId.slice(0, 4)}`,
        lastName: `Visitor ${visitorId.slice(0, 4)}`,
        role: UserRole.VISITOR,
        status: Status.ONLINE,
        avatarUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${visitorId}`,
      });
    }
  }, [user, setUser]);

  return <ChatWidget />;
}
