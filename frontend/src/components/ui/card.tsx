import { cn } from "@/lib/utils";

interface SectionProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
}

/** A titled block of the page. Sections sit on paper; use `Panel` for a raised surface. */
export function Section({ children, className, title, subtitle, action }: SectionProps) {
  return (
    <section className={cn("min-w-0", className)}>
      {(title || action) && (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            {title && <h2 className="display-sm text-[1.6rem]">{title}</h2>}
            {subtitle && <p className="mt-1 text-[0.92rem] text-slate">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("rounded-[24px] bg-haze p-6", className)}>{children}</div>;
}

export function Metric({
  label,
  value,
  unit,
  note,
  className,
}: {
  label: string;
  value: React.ReactNode;
  unit?: string;
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-[0.85rem] text-slate">{label}</p>
      <p className="mt-1 flex items-baseline gap-1.5">
        <span className="display num text-[2.4rem]">{value}</span>
        {unit && value !== "—" && <span className="text-[0.95rem] text-slate">{unit}</span>}
      </p>
      {note && <p className="mt-1 text-[0.85rem] text-slate">{note}</p>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn("h-6 w-6 animate-spin rounded-full border-2 border-line border-t-ink", className)}
    />
  );
}
