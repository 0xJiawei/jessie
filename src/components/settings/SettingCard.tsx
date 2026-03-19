import type { ReactNode } from "react";

interface SettingCardProps {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}

function SettingCard({ title, description, action, children }: SettingCardProps) {
  return (
    <section className="rounded-xl border border-[color:var(--border)] bg-[var(--surface-bg)] p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-[var(--text-primary)]">{title}</h3>
          {description && <p className="mt-1 text-xs text-[var(--text-secondary)]">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export default SettingCard;
