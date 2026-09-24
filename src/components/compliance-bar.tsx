import { cn } from "@/lib/utils";

/** ≥ 90% green, ≥ 70% amber, below that red. */
export function complianceTone(percent: number): "current" | "expiring" | "missing" {
  return percent >= 90 ? "current" : percent >= 70 ? "expiring" : "missing";
}

const FILL = {
  current: "bg-status-current",
  expiring: "bg-status-expiring",
  missing: "bg-status-missing",
} as const;

/** A short bar plus the number. The number carries the meaning; the bar is decoration. */
export function ComplianceBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <span aria-hidden className="h-2 w-20 overflow-hidden rounded-full bg-muted">
        <span
          className={cn("block h-full rounded-full", FILL[complianceTone(percent)])}
          style={{ width: `${percent}%` }}
        />
      </span>
      <span className="text-sm font-semibold tabular-nums">{percent}%</span>
    </span>
  );
}
