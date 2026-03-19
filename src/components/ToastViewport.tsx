import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useToastStore } from "../store/useToastStore";

function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[320px] flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-2 rounded-lg border px-3 py-2 text-sm shadow-panel ${
            toast.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : toast.type === "error"
                ? "border-red-500/30 bg-red-500/10 text-red-200"
                : "border-[color:var(--border)] bg-[var(--panel-bg)] text-[var(--text-primary)]"
          }`}
        >
          {toast.type === "success" ? (
            <CircleCheck size={15} />
          ) : toast.type === "error" ? (
            <CircleAlert size={15} />
          ) : (
            <Info size={15} />
          )}

          <p className="min-w-0 flex-1 truncate">{toast.message}</p>
          <button
            type="button"
            onClick={() => removeToast(toast.id)}
            className="inline-flex h-5 w-5 items-center justify-center rounded text-current/80 transition hover:bg-white/10"
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

export default ToastViewport;
