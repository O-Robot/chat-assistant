"use client";

import { useEffect, useState } from "react";

export function PwaRegistration() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const updateStatus = () => setOffline(!navigator.onLine);
    updateStatus();
    window.addEventListener("online", updateStatus);
    window.addEventListener("offline", updateStatus);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/admin" }).catch(() => {});
    return () => {
      window.removeEventListener("online", updateStatus);
      window.removeEventListener("offline", updateStatus);
    };
  }, []);
  if (!offline) return null;
  return <div role="status" className="fixed inset-x-0 top-0 z-[100] bg-amber-500 px-3 py-2 text-center text-xs font-semibold text-amber-950">You’re offline. Messages cannot be sent until the connection is restored.</div>;
}
