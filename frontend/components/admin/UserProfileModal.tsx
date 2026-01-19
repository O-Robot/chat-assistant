"use client";

import { useState } from "react";
import { User } from "@/types";
import { X, Mail, Phone, Globe, Calendar, Activity, Edit } from "lucide-react";
import { formatDateTime } from "@/lib/constants";
import { adminApi } from "@/lib/axios";
import { toast } from "@/hooks/use-toast";

interface UserProfileModalProps {
  user: User | null;
  onlineUsers: any;
  onClose: () => void;
  onUpdate?: (updatedUser: User | null) => void;
}

export function UserProfileModal({
  user,
  onlineUsers,
  onClose,
  onUpdate,
}: UserProfileModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formState, setFormState] = useState<Partial<User>>({});

  if (!user) return null;

  const handleChange = (field: keyof User, value: string) => {
    setFormState((prev) => ({ ...prev, [field]: value }));
  };

  const handleUpdate = async () => {
    if (!user) return;
    try {
      const response = await adminApi.put(`/admin/users/${user.id}`, formState);
      onUpdate?.(response.data);
      toast({
        title: "Success",
        description: "User updated successfully",
      });
      setIsEditing(false);
    } catch (error) {
      console.error("Failed to update user", error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/20 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header with gradient */}
        <div className="bg-linear-to-r from-blue-500 to-purple-600 p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-full p-2 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>

          {/* Avatar and basic info */}
          <div className="flex flex-col items-center text-white">
            <div className="relative mb-4">
              <img
                src={
                  user.avatarUrl ||
                  `https://api.dicebear.com/9.x/notionists-neutral/svg?seed=${user.id}`
                }
                alt="avatar"
                className="w-24 h-24 rounded-full border-4 border-white shadow-lg"
              />
              <div
                className={`absolute bottom-2 right-2 w-5 h-5 rounded-full border-2 border-white ${
                  onlineUsers.has(user.id) ? "bg-green-500" : "bg-gray-400"
                }`}
              />
            </div>

            <h2 className="text-2xl font-bold mb-1">
              {user.firstName} {user.lastName}
            </h2>

            <div className="flex items-center gap-2">
              <p className="text-blue-100 text-sm flex items-center gap-1">
                <Activity size={14} />
                {onlineUsers.has(user.id) ? "Online now" : "Offline"}
              </p>

              {/* Edit icon only if offline */}
              {!isEditing && (
                <button
                  onClick={() => {
                    setIsEditing(true);
                    setFormState(user);
                  }}
                >
                  <Edit size={16} className="text-white hover:text-gray-200" />
                </button>
              )}
            </div>

            {/* Created At */}
            <p className="text-blue-100 text-xs mt-1">
              Joined: {user?.createdAt && formatDateTime(user?.createdAt)}
            </p>
          </div>
        </div>

        {/* Details section */}
        <div className="p-6 space-y-4">
          {/* Email */}
          <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <Mail className="w-5 h-5 text-blue-500 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                Email Address
              </p>
              {isEditing ? (
                <input
                  type="email"
                  value={formState.email || ""}
                  onChange={(e) => handleChange("email", e.target.value)}
                  className="w-full p-2 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              ) : (
                <p className="text-gray-900 dark:text-gray-100 font-medium break-all">
                  {user.email}
                </p>
              )}
            </div>
          </div>

          {/* Phone */}
          {user.phone && (
            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <Phone className="w-5 h-5 text-green-500 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Phone Number
                </p>
                {isEditing ? (
                  <input
                    type="text"
                    value={formState.phone || ""}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    className="w-full p-2 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-green-400"
                  />
                ) : (
                  <p className="text-gray-900 dark:text-gray-100 font-medium">
                    +{user.phone}
                  </p>
                )}
              </div>
            </div>
          )}
          {/* Country */}
          {user.country && (
            <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              <Globe className="w-5 h-5 text-purple-500 mt-0.5" />
              <div className="flex-1">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                  Country
                </p>
                {isEditing ? (
                  <input
                    type="text"
                    value={formState.country || ""}
                    onChange={(e) => handleChange("country", e.target.value)}
                    className="w-full p-2 rounded-md text-gray-900 dark:text-white bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-1 focus:ring-purple-400 cursor-pointer"
                  />
                ) : (
                  <p className="text-gray-900 dark:text-gray-100 font-medium">
                    {user.country}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* User ID */}
          <div className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <Calendar className="w-5 h-5 text-orange-500 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                User ID
              </p>
              <p className="text-gray-900 dark:text-gray-100 font-medium font-mono text-xs">
                {user.id}
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 flex gap-2">
          {isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(false)}
                className="flex-1 bg-gray-300 dark:bg-gray-600 hover:bg-gray-400 dark:hover:bg-gray-500 text-gray-800 dark:text-white font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleUpdate}
                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer"
              >
                Update
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
