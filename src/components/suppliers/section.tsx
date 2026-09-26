import type { ReactNode } from "react";

/** A titled block on the supplier page. `id` makes it a link target (e.g. #riesgo). */
export function Section({
  id,
  title,
  hint,
  children,
}: {
  id?: string;
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  const titleId = id ? `${id}-title` : undefined;
  return (
    <section id={id} className="grid scroll-mt-20 grid-cols-1 gap-3" aria-labelledby={titleId}>
      <div>
        <h2 id={titleId} className="text-lg font-semibold">
          {title}
        </h2>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="font-medium break-words">{children}</dd>
    </div>
  );
}
