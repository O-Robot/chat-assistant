"use client";

import { useEffect } from "react";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Route error:", error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-background p-6 text-center">
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-semibold text-primary-text">Something went wrong</h1>
        <p className="text-secondary-text">Please try again. If the problem continues, refresh the page or return later.</p>
        <button type="button" onClick={reset} className="rounded-lg bg-primary px-4 py-2 text-white">
          Try again
        </button>
      </div>
    </main>
  );
}
