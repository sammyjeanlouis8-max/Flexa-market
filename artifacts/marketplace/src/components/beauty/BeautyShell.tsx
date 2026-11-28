import { useEffect, type CSSProperties, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CalendarHeart, Heart, Home, LayoutGrid, Scissors, Store } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  {
    href: "/beauty",
    labelKey: "beauty.tabHome",
    fallback: "Home",
    icon: LayoutGrid,
    match: (p: string) =>
      p === "/beauty"
      || p === "/beauty/"
      || p.startsWith("/beauty/discover")
      || p.startsWith("/beauty/studio")
      || p.startsWith("/beauty/barbershop")
      || p.startsWith("/beauty/categories")
      || p.startsWith("/beauty/c/")
      || p.startsWith("/beauty/map")
      || p.startsWith("/beauty/service/")
      || p.startsWith("/beauty/pro/")
      || p.startsWith("/beauty/book")
      || /^\/beauty\/\d+/.test(p),
  },
  {
    href: "/beauty/my-appointments",
    labelKey: "beauty.tabAppointments",
    fallback: "My Appointments",
    icon: CalendarHeart,
    match: (p: string) =>
      p.startsWith("/beauty/my-appointments")
      || p.startsWith("/beauty/booking/"),
  },
  {
    href: "/beauty/center",
    labelKey: "beauty.tabCenter",
    fallback: "Beauty Center",
    icon: Store,
    match: (p: string) =>
      p.startsWith("/beauty/center")
      || p.startsWith("/beauty/onboarding")
      || p.startsWith("/beauty/register"),
  },
  {
    href: "/beauty/favorites",
    labelKey: "beauty.tabFavorites",
    fallback: "Favorites",
    icon: Heart,
    match: (p: string) => p.startsWith("/beauty/favorites"),
  },
] as const;

/** Soft blush / rose charcoal — gender-neutral premium beauty. */
const shellVars = {
  "--beauty-blush": "hsl(350, 42%, 96%)",
  "--beauty-blush-deep": "hsl(350, 28%, 92%)",
  "--beauty-charcoal": "hsl(350, 18%, 14%)",
  "--beauty-charcoal-soft": "hsl(350, 12%, 22%)",
  "--beauty-rose": "hsl(350, 45%, 42%)",
  "--beauty-rose-soft": "hsl(350, 35%, 55%)",
  "--beauty-ink": "hsl(350, 20%, 12%)",
  "--beauty-muted": "hsl(350, 10%, 42%)",
  "--beauty-card": "hsl(0, 0%, 100%)",
  "--beauty-border": "hsl(350, 20%, 88%)",
} as CSSProperties;

export function BeautyShell({
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
  const brand = t("nav.seduireBeauty", { defaultValue: "Séduire Beauty" });
  const marketLabel = t("beauty.toFlexaMarket", { defaultValue: "Flexa Market" });
  const atHome = location === "/beauty" || location === "/beauty/";

  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} · ${brand}` : brand;
    return () => {
      document.title = prev;
    };
  }, [brand, title]);

  return (
    <div
      className="min-h-dvh bg-[var(--beauty-blush)] dark:bg-[hsl(350,14%,8%)]"
      style={shellVars}
      data-testid="beauty-shell"
    >
      <header className="sticky top-0 z-30 border-b border-[var(--beauty-charcoal)]/20 bg-[var(--beauty-charcoal)] text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
          {!atHome && (
            <Link
              href="/beauty"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/15"
              aria-label={t("beauty.backHome", { defaultValue: "Back to Séduire Beauty" })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <Link href="/beauty" className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[var(--beauty-rose)] shadow-sm">
              <Scissors className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[19px] font-extrabold leading-tight tracking-tight sm:text-[21px]">
                {brand}
              </h1>
              <p className="truncate text-[11px] font-medium text-white/70">
                {t("beauty.brandLine", { defaultValue: "Beauty · Studio · Barbershop" })}
              </p>
            </div>
          </Link>
          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 py-2 text-[11px] font-bold text-[var(--beauty-charcoal)] shadow-sm hover:bg-white/95 sm:px-3 sm:text-[12px]"
            data-testid="beauty-exit-to-market"
          >
            <Home className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[7.5rem] truncate sm:max-w-none">{marketLabel}</span>
          </Link>
          {actions}
        </div>

        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2 sm:px-4" aria-label="Séduire Beauty">
          {TABS.map((tab) => {
            const active = tab.match(location);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  active ? "bg-white text-[var(--beauty-charcoal)]" : "text-white/80 hover:bg-white/10",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t(tab.labelKey, { defaultValue: tab.fallback })}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-3 py-4 pb-24 sm:px-4 sm:py-5">
        {(title || subtitle) && (
          <div className="mb-4">
            {title && (
              <h2 className="text-xl font-extrabold tracking-tight text-[var(--beauty-ink)] sm:text-2xl">
                {title}
              </h2>
            )}
            {subtitle && <p className="mt-1 text-sm text-[var(--beauty-muted)]">{subtitle}</p>}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

export function BeautyEmpty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-[var(--beauty-border)] bg-white/70 px-5 py-10 text-center dark:border-[hsl(350,15%,28%)] dark:bg-[hsl(350,14%,12%)]">
      <Scissors className="mx-auto h-8 w-8 text-[var(--beauty-rose)]" />
      <h2 className="mt-3 text-base font-bold text-foreground">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function BeautyNotice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-[hsl(350,30%,82%)] bg-[hsl(350,40%,96%)] px-3 py-2 text-xs text-[hsl(350,35%,28%)] dark:border-[hsl(350,20%,30%)] dark:bg-[hsl(350,16%,14%)] dark:text-[hsl(350,30%,80%)]">
      {children}
    </p>
  );
}
