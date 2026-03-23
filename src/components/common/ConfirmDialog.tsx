import { useEffect } from "react";
import { useTr } from "../../lib/i18n";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { t } = useTr();
  const resolvedTitle = title ?? t("Are you sure?", "确定吗？");
  const resolvedConfirmText = confirmText ?? t("Delete", "删除");
  const resolvedCancelText = cancelText ?? t("Cancel", "取消");

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-xl border border-[color:var(--border)] bg-[var(--panel-bg)] p-4 shadow-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-sm font-medium text-[var(--text-primary)]">{resolvedTitle}</p>
        {description && <p className="mt-2 text-sm text-[var(--text-secondary)]">{description}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="h-8 rounded-lg border border-[color:var(--border)] bg-[var(--surface-muted)] px-3 text-xs text-[var(--text-primary)] transition hover:bg-[var(--surface-bg)]"
          >
            {resolvedCancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-8 rounded-lg border border-red-400/30 px-3 text-xs text-red-300 transition hover:bg-red-500/10"
          >
            {resolvedConfirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
