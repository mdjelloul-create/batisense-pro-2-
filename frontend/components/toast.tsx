import { useState, useCallback, createContext, useContext } from "react";

interface Toast {
  id: number;
  message: string;
  level: "info" | "warning" | "danger";
}

interface ToastCtx {
  toasts: Toast[];
  addToast: (msg: string, level?: Toast["level"]) => void;
  removeToast: (id: number) => void;
}

const ToastContext = createContext<ToastCtx>(null!);

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, level: Toast["level"] = "info") => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, level }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            onClick={() => removeToast(t.id)}
            className={`pointer-events-auto cursor-pointer rounded-xl border px-5 py-4 shadow-2xl backdrop-blur-xl animate-in slide-in-from-right-2 fade-in duration-300 max-w-sm text-sm font-medium
              ${t.level === "danger" ? "bg-red-900/80 border-red-500/50 text-red-100" :
                t.level === "warning" ? "bg-amber-900/80 border-amber-500/50 text-amber-100" :
                "bg-emerald-900/80 border-emerald-500/50 text-emerald-100"}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
