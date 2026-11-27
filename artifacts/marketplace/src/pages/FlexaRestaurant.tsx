import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { CalendarClock, Plus, Search, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantNotice, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import RestaurantDiscover from "@/pages/restaurant/Discover";

const LINKS = [
  { href: "/restaurant/discover", icon: Search, titleKey: "restaurant.discoverTitle", bodyKey: "restaurant.discoverSubtitle" },
  { href: "/restaurant/my-orders", icon: ShoppingBag, titleKey: "restaurant.myOrdersTitle", bodyKey: "restaurant.myOrdersSubtitle" },
  { href: "/restaurant/my-reservations", icon: CalendarClock, titleKey: "restaurant.myReservationsTitle", bodyKey: "restaurant.myReservationsSubtitle" },
  { href: "/restaurant/owner", icon: UtensilsCrossed, titleKey: "restaurant.ownerDashboard", bodyKey: "restaurant.ownerDashboardSubtitle" },
  { href: "/restaurant/add", icon: Plus, titleKey: "restaurant.addRestaurantTitle", bodyKey: "restaurant.addRestaurantSubtitle" },
] as const;

export default function FlexaRestaurant() {
  const { t } = useTranslation();
  return (
    <RestaurantPageGate>
      <RestaurantShell
        title={t("restaurant.hubTitle")}
        subtitle={t("restaurant.hubSubtitle")}
      >
        <div className="mb-4 space-y-2">
          <RestaurantNotice>{t("restaurant.freeLaunchNote")}</RestaurantNotice>
          <RestaurantNotice>{t("restaurant.identityBadgeNote")}</RestaurantNotice>
        </div>
        <div className="mb-6 grid gap-2 sm:grid-cols-2">
          {LINKS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className="flex items-start gap-3 rounded-2xl border border-border/70 bg-white p-4 dark:bg-[hsl(152,16%,12%)]"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[hsl(152,45%,92%)] text-[hsl(152,55%,25%)] dark:bg-[hsl(152,30%,20%)]">
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold">{t(item.titleKey)}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">{t(item.bodyKey)}</p>
                </div>
              </Link>
            );
          })}
        </div>
        <RestaurantDiscover embedded />
      </RestaurantShell>
    </RestaurantPageGate>
  );
}