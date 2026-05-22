"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { CheckCircle2, AlertCircle, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type ToastVariant = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  show: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((message: string, variant: ToastVariant = "info") => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, variant }]);
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      setToasts((t) => t.filter((x) => x.id !== id));
    }, 5000);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      {/* Renderer — fixed position, screen-reader live region */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: number) => void;
}) {
  // Mounted check for the slide-in animation to play
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const Icon =
    toast.variant === "success"
      ? CheckCircle2
      : toast.variant === "error"
      ? AlertCircle
      : AlertCircle;

  const tone =
    toast.variant === "success"
      ? "text-[var(--color-success)] bg-green-50 border-green-200"
      : toast.variant === "error"
      ? "text-[var(--color-danger)] bg-[var(--color-danger-soft)] border-red-200"
      : "text-[var(--color-text)] bg-white border-[var(--color-border-strong)]";

  return (
    <div
      role="status"
      className={cn(
        "pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-md border shadow-sm min-w-[260px] max-w-sm text-sm",
        tone,
        mounted ? "animate-slide-in-right" : "opacity-0"
      )}
    >
      <Icon className="h-4 w-4 mt-0.5 shrink-0" />
      <div className="flex-1">{toast.message}</div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="opacity-60 hover:opacity-100"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
