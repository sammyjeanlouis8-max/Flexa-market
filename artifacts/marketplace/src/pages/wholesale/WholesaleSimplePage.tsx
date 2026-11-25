import type { ReactNode } from "react";
import { Link } from "wouter";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleListCard, WholesaleShell, WholesaleStat } from "@/components/wholesale/WholesaleShell";

export type SimpleItem = { title: string; meta: string; href?: string; badge?: string };

export function WholesaleSimplePage({
  title,
  subtitle,
  stats,
  items,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  stats?: Array<{ label: string; value: string | number }>;
  items?: SimpleItem[];
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <WholesalePageGate>
      <WholesaleShell title={title} subtitle={subtitle} actions={actions}>
        {stats && stats.length > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <WholesaleStat key={s.label} label={s.label} value={s.value} />
            ))}
          </div>
        )}
        {children}
        {items && items.length > 0 && (
          <div className="space-y-2">
            {items.map((item) => (
              <WholesaleListCard
                key={`${item.title}-${item.meta}`}
                href={item.href ?? "/wholesale"}
                title={item.title}
                meta={item.meta}
                badge={item.badge}
              />
            ))}
          </div>
        )}
      </WholesaleShell>
    </WholesalePageGate>
  );
}

export function WholesaleFormPage({
  title,
  subtitle,
  fields,
  submitLabel = "Save",
}: {
  title: string;
  subtitle?: string;
  fields: Array<{ label: string; defaultValue?: string; type?: string }>;
  submitLabel?: string;
}) {
  return (
    <WholesalePageGate>
      <WholesaleShell title={title} subtitle={subtitle}>
        <form
          className="space-y-3 rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]"
          onSubmit={(e) => e.preventDefault()}
        >
          {fields.map((f) => (
            <div key={f.label}>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{f.label}</label>
              <input
                type={f.type ?? "text"}
                defaultValue={f.defaultValue}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">Wholesale chat-only · depot in your country · no buy button.</p>
          <button type="submit" className="h-11 w-full rounded-xl bg-[hsl(152,55%,28%)] text-sm font-bold text-white">
            {submitLabel}
          </button>
        </form>
        <Link href="/wholesale/seller/dashboard" className="mt-4 inline-block text-sm font-semibold underline">
          Back to seller dashboard
        </Link>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
