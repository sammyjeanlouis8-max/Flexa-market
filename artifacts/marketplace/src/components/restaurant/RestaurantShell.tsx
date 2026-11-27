import { useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CalendarClock, Home, LayoutGrid, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  {
    href: "/restaurant",
    labelKey: "restaurant.tabHome",
    fallback: "Home",
    icon: LayoutGrid,
    match: (p: string) =>
      p === "/restaurant"
      || p.startsWith("/restaurant/discover")
      || p.startsWith("/restaurant/search")
      || p.startsWith("/restaurant/map")
      || p.startsWith("/restaurant/restaurants")
      || p.startsWith("/restaurant/food-trucks")
      || p.startsWith("/restaurant/home-kitchens")
      || p.startsWith("/restaurant/bakeries")
      || p.startsWith("/restaurant/catering")
      || /^\/restaurant\/\d+/.test(p),
  },
  {
    href: "/restaurant/my-orders",
    labelKey: "restaurant.tabOrders",
    fallback: "Orders",
    icon: ShoppingBag,
    match: (p: string) => p.startsWith("/restaurant/my-orders"),
  },
  {
    href: "/restaurant/my-reservations",
    labelKey: "restaurant.tabReservations",
    fallback: "Reservations",
    icon: CalendarClock,
    match: (p: string) => p.startsWith("/restaurant/my-reservations"),
  },
  {
    href: "/restaurant/owner",
    labelKey: "restaurant.tabMyRestaurant",
    fallback: "My restaurant",
    icon: UtensilsCrossed,
    match: (p: string) =>
      p.startsWith("/restaurant/owner")
      || p.startsWith("/restaurant/add")
      || p.startsWith("/restaurant/identity")
      || p.startsWith("/restaurant/food-safety"),
  },
] as const;

export function RestaurantShell({
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
  const brand = t("nav.flexaRestaurant", { defaultValue: "Flexa Restaurant" });
  const marketLabel = t("restaurant.toFlexaMarket", { defaultValue: "Flexa Market" });
  const atHome = location === "/restaurant" || location === "/restaurant/";

  useEffect(() => {
    const prev = document.title;
    document.title = title ? `${title} · ${brand}` : brand;
    return () => {
      document.title = prev;
    };
  }, [brand, title]);

  return (
    <div className="min-h-dvh bg-[hsl(152,22%,97%)] dark:bg-[hsl(152,14%,8%)]">
      <header className="sticky top-0 z-30 border-b border-[hsl(152,30%,22%)]/20 bg-[hsl(152,55%,16%)] text-white">
        <div className="mx-auto flex max-w-5xl items-center gap-2 px-3 py-3 sm:gap-3 sm:px-4">
          {!atHome && (
            <Link
              href="/restaurant"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/15"
              aria-label={t("restaurant.backHome", { defaultValue: "Back to Flexa Restaurant" })}
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <Link href="/restaurant" className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[hsl(152,65%,20%)] shadow-sm">
              <UtensilsCrossed className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h1 className="truncate text-[19px] font-extrabold leading-tight tracking-tight sm:text-[21px]">
                {brand}
              </h1>
              <p className="truncate text-[11px] font-medium text-white/70">
                {t("restaurant.brandLine", {
                  defaultValue: "Restaurant · free launch · pay the cook directly",
                })}
              </p>
            </div>
          </Link>
          <Link
            href="/"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white px-2.5 py-2 text-[11px] font-bold text-[hsl(152,65%,18%)] shadow-sm hover:bg-white/95 sm:px-3 sm:text-[12px]"
            data-testid="restaurant-exit-to-market"
          >
            <Home className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[7.5rem] truncate sm:max-w-none">{marketLabel}</span>
          </Link>
          {actions}
        </div>

        <nav className="mx-auto flex max-w-5xl gap-1 overflow-x-auto px-3 pb-2 sm:px-4" aria-label="Flexa Restaurant">
          {TABS.map((tab) => {
            const active = tab.match(location);
            const Icon = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors",
                  active ? "bg-white text-[hsl(152,65%,18%)]" : "text-white/80 hover:bg-white/10",
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
              <h2 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">{title}</h2>
            )}
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}

export function RestaurantEmpty({
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
      <UtensilsCrossed className="mx-auto h-8 w-8 text-[hsl(152,45%,35%)]" />
      <h2 className="mt-3 text-base font-bold text-foreground">{title}</h2>
      <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">{body}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function RestaurantNotice({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-[hsl(152,35%,75%)] bg-[hsl(152,40%,95%)] px-3 py-2 text-xs text-[hsl(152,45%,22%)] dark:border-[hsl(152,25%,30%)] dark:bg-[hsl(152,20%,14%)] dark:text-[hsl(152,40%,80%)]">
      {children}
    </p>
  );
}