import { useEffect, useRef, useState, type ReactNode } from "react";

interface TooltipProps {
  content: string;
  children: ReactNode;
}

function Tooltip({ content, children }: TooltipProps) {
  const [open, setOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => {
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
        }
        timerRef.current = window.setTimeout(() => {
          setOpen(true);
        }, 200);
      }}
      onMouseLeave={() => {
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
        }
        setOpen(false);
      }}
    >
      {children}

      {open && (
        <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-64 -translate-x-1/2 rounded-lg border border-[color:var(--border)] bg-[var(--panel-bg)] px-2.5 py-2 text-xs leading-5 text-[var(--text-primary)] shadow-panel">
          {content}
        </span>
      )}
    </span>
  );
}

export default Tooltip;
