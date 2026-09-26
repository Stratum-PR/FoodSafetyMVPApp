import { Ban, CircleAlert, CircleCheck, CircleDashed, Clock, FileClock, Hourglass, Send, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";

import type { BatchStatus, RequestItemStatus } from "@/domain/requests";
import { cn } from "@/lib/utils";

const PILL = "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

const BATCH: Record<BatchStatus, { className: string; Icon: typeof Send }> = {
  draft: { className: "border text-muted-foreground", Icon: CircleDashed },
  sent: { className: "bg-secondary text-secondary-foreground", Icon: Send },
  partially_received: { className: "bg-secondary text-secondary-foreground", Icon: FileClock },
  awaiting_review: { className: "bg-status-expiring-bg text-status-expiring", Icon: Hourglass },
  rejected_items: { className: "bg-status-missing-bg text-status-missing", Icon: Undo2 },
  complete: { className: "bg-status-current-bg text-status-current", Icon: CircleCheck },
  overdue: { className: "bg-status-missing-bg text-status-missing", Icon: Clock },
  cancelled: { className: "bg-muted text-muted-foreground", Icon: Ban },
};

/** A request's status: color, icon and word, never color alone. */
export function RequestStatusBadge({ status }: { status: BatchStatus }) {
  const t = useTranslations("requests.status");
  const { className, Icon } = BATCH[status];
  return (
    <span data-status={status} className={cn(PILL, className)}>
      <Icon aria-hidden className="size-3.5" />
      {t(status)}
    </span>
  );
}

const ITEM: Record<RequestItemStatus, { className: string; Icon: typeof Send }> = {
  requested: { className: "border text-muted-foreground", Icon: CircleDashed },
  uploaded: { className: "bg-status-expiring-bg text-status-expiring", Icon: Hourglass },
  resubmitted: { className: "bg-status-expiring-bg text-status-expiring", Icon: Hourglass },
  accepted: { className: "bg-status-current-bg text-status-current", Icon: CircleCheck },
  rejected: { className: "bg-status-missing-bg text-status-missing", Icon: CircleAlert },
  waived: { className: "bg-muted text-muted-foreground", Icon: Ban },
};

export function ItemStatusBadge({ status, label }: { status: RequestItemStatus; label?: string }) {
  const t = useTranslations("requests.itemStatus");
  const { className, Icon } = ITEM[status];
  return (
    <span data-status={status} className={cn(PILL, className)}>
      <Icon aria-hidden className="size-3.5" />
      {label ?? t(status)}
    </span>
  );
}
