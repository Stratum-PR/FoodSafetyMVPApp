import { ChevronsUp, ChevronUp, Minus } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ReviewPriority } from "@/domain/evidence";
import { cn } from "@/lib/utils";

const STYLE: Record<ReviewPriority, { className: string; Icon: typeof Minus }> = {
  urgent: { className: "bg-status-missing-bg text-status-missing", Icon: ChevronsUp },
  high: { className: "bg-status-expiring-bg text-status-expiring", Icon: ChevronUp },
  normal: { className: "text-muted-foreground", Icon: Minus },
};

/** Review priority: Urgente / Alta / Normal, by icon and word. */
export function PriorityBadge({ priority }: { priority: ReviewPriority }) {
  const t = useTranslations("priority");
  const { className, Icon } = STYLE[priority];
  return (
    <span
      data-priority={priority}
      className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold", className)}
    >
      <Icon aria-hidden className="size-3.5" />
      {t(priority)}
    </span>
  );
}
