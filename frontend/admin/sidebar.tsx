"use client";
import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

export default function Sidebar() {
  const router = useRouter();

  const handleLogout = async () => {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/auth");
  };

  return (
    <div className="w-60 bg-white border-r flex flex-col justify-between">
      <div className="p-6">
        <h1 className="font-semibold text-lg text-primary">Admin Panel</h1>
        <p className="text-xs text-neutral-500 mt-1">Chat Management</p>
      </div>

      <div className="p-6 border-t">
        <button
          onClick={handleLogout}
          className="flex items-center gap-2 text-red-500 text-sm font-medium"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </div>
  );
}
