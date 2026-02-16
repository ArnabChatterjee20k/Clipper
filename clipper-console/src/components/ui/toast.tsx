import * as React from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { X, AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";

export type ToastVariant = "default" | "success" | "error" | "warning" | "info";

export interface Toast {
  id: string;
  title?: string;
  description: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const addToast = React.useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).substring(2, 9);
    const newToast: Toast = {
      id,
      variant: "default",
      duration: 5000,
      ...toast,
    };
    setToasts((prev) => [...prev, newToast]);

    if (newToast.duration && newToast.duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, newToast.duration);
    }
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

function ToastContainer({
  toasts,
  onRemove,
}: {
  toasts: Toast[];
  onRemove: (id: string) => void;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-full max-w-sm">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
      ))}
    </div>,
    document.body
  );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const variant = toast.variant ?? "default";

  const variantStyles: Record<ToastVariant, string> = {
    default: "bg-card border-border text-foreground",
    success: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800 text-green-900 dark:text-green-100",
    error: "bg-destructive/10 border-destructive/20 text-destructive dark:text-destructive",
    warning: "bg-yellow-50 dark:bg-yellow-950 border-yellow-200 dark:border-yellow-800 text-yellow-900 dark:text-yellow-100",
    info: "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800 text-blue-900 dark:text-blue-100",
  };

  const icons: Record<ToastVariant, React.ReactNode> = {
    default: null,
    success: <CheckCircle2 className="size-4" />,
    error: <AlertCircle className="size-4" />,
    warning: <AlertTriangle className="size-4" />,
    info: <Info className="size-4" />,
  };

  return (
    <div
      className={cn(
        "rounded-lg border shadow-lg p-4 flex items-start gap-3 animate-in slide-in-from-top-5",
        variantStyles[variant]
      )}
    >
      {icons[variant] && <div className="shrink-0 mt-0.5">{icons[variant]}</div>}
      <div className="flex-1 min-w-0">
        {toast.title && (
          <p className="font-medium text-sm mb-1">{toast.title}</p>
        )}
        <p className="text-sm">{toast.description}</p>
      </div>
      <button
        onClick={() => onRemove(toast.id)}
        className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Close"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
