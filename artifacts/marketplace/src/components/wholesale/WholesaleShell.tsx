import type { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowLeft, LayoutGrid, PackagePlus, Warehouse } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/wholesale", labelKey: "wholesale.tabCatalog", fallback: "Catalog", icon: LayoutGrid, exact: true },
  { href: "/wholesale/seller", labelKey: "wholesale.tabSeller", fallback: "My wholesale", icon: PackagePlus, exact: false },
] as const;

export function WholesaleShell({
  children,
  title,
  subtitle,
  actions,
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const { t } = useTranslation();
  const [location] = useLocation();

  return (
    <div className="min-h-[calc(100dvh-3.5rem)] bg-[hsl(152,22%,97%)] dark:bg-[hsl(152,14%,8%)]">
      <header className="sticky top-0 z-30 border-b border-[hsl(152,30%,22%)]/20 bg-[hsl(152,55%,16%)] text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-3 py-3 sm:px-4">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/15"
            aria-label={t("common.back", { defaultValue: "Back" })}
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[hsl(152,65%,20%)]">
              <Warehouse className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold uppercase tracking-[0.12em] text-white/70">
                Flexa Market
              </p>
              <h1 className="truncate text-[17px] font-extrabold leading-tight">
                {title ?? t("nav.flexaWholesale", { defaultValue: "Flexa Wholesale" })}
              </h1>
              {subtitle && <p className="truncate text-[11px] text-white/75">{subtitle}</p>}
            </div>
          </div>
          {actions}
        </div>

        <nav className="mx-auto flex max-w-5xl gap-1 px-3 pb-2 sm:px-4" aria-label="Wholesale">
          {TABS.map((tab) => {
            const active = tab.exact
              ? location === tab.href
              : location === tab.href || location.startsWith(`${tab.href}/`);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  active ? "bg-white text-[hsl(152,65%,18%)]" : "text-white/80 hover:bg-white/10",
                )}
                data-testid={`wholesale-tab-${tab.href.replace(/\//g, "-")}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(tab.labelKey, { defaultValue: tab.fallback })}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-3 py-4 pb-24 sm:px-4 sm:py-5">
        {children}
      </main>
    </div>
  );
}

export function WholesaleEmpty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[hsl(152,30%,70%)] bg-white/70 px-5 py-10 text-center dark:border-[hsl(152,20%,28%)] dark:bg-[hsl(152,18%,12%)]">
      <Warehouse className="mx-auto h-8 w-8 text-[hsl(152,45%,35%)]" />
      <h2 className="mt-3 text-base font-bold text-foreground">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}
