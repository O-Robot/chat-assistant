"use client";

import { Button } from "@/components/ui/button";
import { AlertTriangle, Info } from "lucide-react";
import { useState } from "react";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: "danger" | "warning" | "info";
  isLoading?: boolean;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  variant = "info",
  isLoading = false,
}: ConfirmationModalProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsConfirming(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setIsConfirming(false);
    }
  };

  const getIcon = () => {
    switch (variant) {
      case "danger":
        return <AlertTriangle className="w-12 h-12 text-red-500" />;
      case "warning":
        return <AlertTriangle className="w-12 h-12 text-yellow-500" />;
      default:
        return <Info className="w-12 h-12 text-blue-500" />;
    }
  };

  const getConfirmButtonClass = () => {
    switch (variant) {
      case "danger":
        return "bg-red-500 hover:bg-red-600 text-white";
      case "warning":
        return "bg-yellow-500 hover:bg-yellow-600 text-white";
      default:
        return "bg-blue-500 hover:bg-blue-600 text-white";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="confirmation-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in dark:bg-slate-800">
        <div className="flex flex-col items-center text-center">
          {/* Icon */}
          <div className="mb-4">{getIcon()}</div>

          {/* Title */}
          <h3 id="confirmation-title" className="mb-2 text-xl font-semibold text-gray-900 dark:text-gray-100">
            {title}
          </h3>

          {/* Message */}
          <p className="text-gray-600 dark:text-gray-400 mb-6">{message}</p>

          {/* Actions */}
          <div className="flex gap-3 w-full">
            <Button
              type="button"
              onClick={onClose}
              variant="outline"
              className="flex-1"
              disabled={isLoading || isConfirming}
            >
              {cancelText}
            </Button>
            <Button
              type="button"
              onClick={handleConfirm}
              className={`flex-1 ${getConfirmButtonClass()}`}
              disabled={isLoading || isConfirming}
            >
              {isLoading || isConfirming ? "Processing..." : confirmText}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
