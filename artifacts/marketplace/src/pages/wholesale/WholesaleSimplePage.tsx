import type { ReactNode } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { WholesalePageGate } from "@/components/wholesale/WholesalePageGate";
import { WholesaleListCard, WholesaleShell, WholesaleStat } from "@/components/wholesale/WholesaleShell";

export type SimpleItem = { title: string; meta: string; href?: string; badge?: string };

export function WholesaleSimplePage({
  title,
  titleKey,
  subtitle,
  subtitleKey,
  stats,
  items,
  actions,
  children,
}: {
  title?: string;
  titleKey?: string;
  subtitle?: string;
  subtitleKey?: string;
  stats?: Array<{ label: string; labelKey?: string; value: string | number }>;
  items?: SimpleItem[];
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const resolvedTitle = titleKey ? t(titleKey, { defaultValue: title || titleKey }) : title || "";
  const resolvedSubtitle = subtitleKey
    ? t(subtitleKey, { defaultValue: subtitle || "" })
    : subtitle;

  return (
    <WholesalePageGate>
      <WholesaleShell title={resolvedTitle} subtitle={resolvedSubtitle} actions={actions}>
        {stats && stats.length > 0 && (
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <WholesaleStat
                key={s.labelKey || s.label}
                label={s.labelKey ? t(s.labelKey, { defaultValue: s.label }) : s.label}
                value={s.value}
              />
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
  titleKey,
  subtitle,
  subtitleKey,
  fields,
  submitLabel,
  submitLabelKey,
}: {
  title?: string;
  titleKey?: string;
  subtitle?: string;
  subtitleKey?: string;
  fields: Array<{ label: string; labelKey?: string; defaultValue?: string; type?: string }>;
  submitLabel?: string;
  submitLabelKey?: string;
}) {
  const { t } = useTranslation();
  const resolvedTitle = titleKey ? t(titleKey, { defaultValue: title || titleKey }) : title || "";
  const resolvedSubtitle = subtitleKey
    ? t(subtitleKey, { defaultValue: subtitle || "" })
    : subtitle;
  const resolvedSubmit = submitLabelKey
    ? t(submitLabelKey, { defaultValue: submitLabel || "Save" })
    : submitLabel || t("wholesale.save", { defaultValue: "Save" });

  return (
    <WholesalePageGate requireAuth>
      <WholesaleShell title={resolvedTitle} subtitle={resolvedSubtitle}>
        <form
          className="space-y-3 rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]"
          onSubmit={(e) => e.preventDefault()}
        >
          {fields.map((f) => (
            <div key={f.labelKey || f.label}>
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {f.labelKey ? t(f.labelKey, { defaultValue: f.label }) : f.label}
              </label>
              <input
                type={f.type ?? "text"}
                defaultValue={f.defaultValue}
                className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm"
              />
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            {t("wholesale.chatOnlyFooter", {
              defaultValue: "Wholesale chat-only · depot in your country · no buy button.",
            })}
          </p>
          <button type="submit" className="h-11 w-full rounded-xl bg-[hsl(152,55%,28%)] text-sm font-bold text-white">
            {resolvedSubmit}
          </button>
        </form>
        <Link href="/wholesale/seller/dashboard" className="mt-4 inline-block text-sm font-semibold underline">
          {t("wholesale.backSellerDash", { defaultValue: "Back to seller dashboard" })}
        </Link>
      </WholesaleShell>
    </WholesalePageGate>
  );
}
