import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Premium, consistent page header used across the app: a gradient icon chip,
 * a serif title and an optional subtitle + right-aligned action slot.
 */
export function PageHeader({
  icon: Icon,
  title,
  subtitle,
  action,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`flex items-start gap-3.5 ${className}`}>
      <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-accent/25 to-accent/5 border border-accent/20 flex items-center justify-center shrink-0 shadow-sm">
        <Icon className="w-5 h-5 text-accent" />
      </div>
      <div className="flex-1 min-w-0">
        <h1 className="text-xl md:text-2xl font-serif font-semibold text-foreground leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5 leading-relaxed">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
