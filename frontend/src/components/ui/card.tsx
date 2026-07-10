import { cn } from "@/lib/utils";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function Card({ children, className, title, subtitle, action }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-zinc-800/60 bg-zinc-950/80 p-5 backdrop-blur-sm",
        "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)]",
        className
      )}
    >
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            {title && <h3 className="text-sm font-medium text-zinc-400">{title}</h3>}
            {subtitle && <p className="mt-0.5 text-xs text-zinc-600">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function MetricValue({
  value,
  unit,
  className,
}: {
  value: string | number;
  unit?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex items-baseline gap-1", className)}>
      <span className="text-3xl font-semibold tabular-nums tracking-tight text-zinc-50">
        {value}
      </span>
      {unit && <span className="text-sm text-zinc-500">{unit}</span>}
    </div>
  );
}
