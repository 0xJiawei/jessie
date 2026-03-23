import { CircleAlert, CircleCheck, Info, X } from "lucide-react";
import { useToastStore } from "../store/useToastStore";

function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const removeToast = useToastStore((state) => state.removeToast);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-center justify-center bg-black/20 px-4 backdrop-blur-[1px]">
      <div className="flex w-full max-w-[480px] flex-col items-center gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex w-full items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm shadow-panel ${
            toast.type === "success"
              ? "border-emerald-700 bg-emerald-500 text-white"
              : toast.type === "error"
                ? "border-red-700 bg-red-500 text-white"
                : "border-slate-700 bg-slate-800 text-white"
          }`}
        >
          {toast.type === "success" ? (
            <CircleCheck size={15} />
          ) : toast.type === "error" ? (
            <CircleAlert size={15} />
          ) : (
            <Info size={15} />
          )}

          <p className="min-w-0 flex-1 break-words leading-5">{toast.message}</p>
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
    </div>
  );
}

export default ToastViewport;
