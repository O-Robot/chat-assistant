import { useState } from "react";

export function useConfirmationModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    confirmText?: string;
    cancelText?: string;
    variant?: "danger" | "warning" | "info";
  }>({
    title: "",
    message: "",
    onConfirm: () => {},
  });

  const showConfirmation = (newConfig: typeof config) => {
    setConfig(newConfig);
    setIsOpen(true);
  };

  const hideConfirmation = () => {
    setIsOpen(false);
  };

  return {
    isOpen,
    showConfirmation,
    hideConfirmation,
    config,
  };
}
