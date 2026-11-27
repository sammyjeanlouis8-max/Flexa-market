import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { BadgeCheck, Clock, Heart, MapPin, Star, UtensilsCrossed } from "lucide-react";
import {
  BUSINESS_TYPES,
  availabilityLabelKey,
  businessTypeLabelKey,
  formatMoney,
  type Restaurant,
} from "@/lib/restaurantApi";
import { cn } from "@/lib/utils";

function todayHoursLabel(
  hours: Restaurant["hours"] | undefined,
  t: (k: string, o?: Record<string, unknown>) => string,
) {
  if (!hours?.length) return null;
  const weekday = new Date().getDay();
  const today = hours.find((h) => h.weekday === weekday);
  if (!today || today.isClosed) return t("restaurant.closedToday", { defaultValue: "Closed today" });
  if (today.openTime && today.closeTime) {
    return t("restaurant.todayHours", {
      defaultValue: "Today: {{from}} – {{until}}",
      from: today.openTime,
      until: today.closeTime,
    });
  }
  return null;
}

export function RestaurantCard({
  restaurant: r,
  compact,
}: {
  restaurant: Restaurant;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const open = r.openNow ?? r.isOpenNow;
  const typeKey = businessTypeLabelKey(r.businessType);
  const typeLabel = t(`restaurant.${typeKey}`, {
    defaultValue: BUSINESS_TYPES.find((b) => b.id === r.businessType)?.id || r.businessType,
  });
  const locationLine =
    r.serviceArea
    || r.publicPickupAddress
    || (r.showPublicAddress ? r.streetAddress : null)
    || `${r.city}${r.country ? `, ${r.country}` : ""}`;
  const hoursLine = todayHoursLabel(r.hours, t);
  const cover = r.coverUrl || r.menuPreview?.[0]?.photos?.[0] || null;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_8px_24px_rgba(15,40,30,0.06)] transition hover:shadow-[0_12px_28px_rgba(15,40,30,0.1)]",
        compact && "shadow-sm",
      )}
      data-testid={`restaurant-card-${r.id}`}
    >
      <Link href={`/restaurant/${r.id}`} className="block">
        <div className="flex gap-3 p-3 sm:gap-4 sm:p-4">
          <div className="relative h-[92px] w-[92px] shrink-0 overflow-hidden rounded-xl bg-[hsl(152,25%,94%)] sm:h-[108px] sm:w-[108px]">
            {cover ? (
              <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[hsl(152,45%,35%)]">
                <UtensilsCrossed className="h-8 w-8 opacity-50" />
              </div>
            )}
            <button
              type="button"
              className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-[hsl(152,20%,35%)] shadow-sm"
              aria-label={t("restaurant.favorite", { defaultValue: "Favorite" })}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <Heart className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {r.logoUrl ? (
                    <img
                      src={r.logoUrl}
                      alt=""
                      className="h-7 w-7 rounded-full border border-black/5 object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[hsl(152,45%,92%)] text-[hsl(152,55%,28%)]">
                      <UtensilsCrossed className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <h3 className="truncate text-[15px] font-extrabold leading-tight text-[hsl(152,30%,12%)] sm:text-base">
                    {r.name}
                  </h3>
                  {r.identityVerifiedBadge || r.identityStatus === "verified" ? (
                    <BadgeCheck className="h-4 w-4 shrink-0 text-[hsl(152,55%,32%)]" aria-label={t("restaurant.identityVerified")} />
                  ) : null}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                  {(r.avgRating > 0 || r.ratingCount > 0) && (
                    <span className="inline-flex items-center gap-1 font-semibold text-[hsl(152,25%,25%)]">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                      {r.avgRating.toFixed(1)}
                      <span className="font-normal text-muted-foreground">({r.ratingCount})</span>
                    </span>
                  )}
                  <span>{typeLabel}</span>
                  {r.cuisineTags?.[0] && <span>· {r.cuisineTags[0]}</span>}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <span
                  className={cn(
                    "inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                    open
                      ? "bg-[hsl(152,50%,90%)] text-[hsl(152,55%,25%)]"
                      : "bg-neutral-100 text-neutral-500",
                  )}
                >
                  {open ? t("restaurant.openNow") : t("restaurant.closed", { defaultValue: "Closed" })}
                </span>
                {r.distanceKm != null && (
                  <p className="mt-1 text-[11px] font-semibold text-[hsl(152,45%,30%)]">
                    {r.distanceKm.toFixed(1)} mi
                  </p>
                )}
              </div>
            </div>

            <p className="mt-1.5 flex items-start gap-1 text-[11px] text-muted-foreground sm:text-xs">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0 text-[hsl(152,45%,35%)]" />
              <span className="line-clamp-1">{locationLine}</span>
            </p>
            {hoursLine && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground sm:text-xs">
                <Clock className="h-3 w-3 shrink-0 text-[hsl(152,45%,35%)]" />
                {hoursLine}
              </p>
            )}
            <p className="mt-1 text-[11px] font-medium text-[hsl(152,40%,32%)]">
              {[
                (r.fulfillment === "pickup" || r.fulfillment === "both") && t("restaurant.pickup"),
                (r.fulfillment === "delivery" || r.fulfillment === "both") && t("restaurant.delivery"),
                r.estimatedPrepMinutes ? `${r.estimatedPrepMinutes} min` : null,
              ].filter(Boolean).join(" · ")}
            </p>
          </div>
        </div>
      </Link>

      {!compact && r.menuPreview && r.menuPreview.length > 0 && (
        <div className="border-t border-black/5 px-3 pb-3 pt-2 sm:px-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wide text-[hsl(152,35%,35%)]">
              {t("restaurant.todayMenu")}
            </p>
            <Link href={`/restaurant/${r.id}`} className="text-[11px] font-bold text-[hsl(152,55%,28%)]">
              {t("restaurant.viewFullMenu", { defaultValue: "View full menu" })}
            </Link>
          </div>
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {r.menuPreview.slice(0, 4).map((item) => (
              <li
                key={item.id}
                className="w-[132px] shrink-0 rounded-xl border border-black/5 bg-[hsl(152,22%,98%)] p-2"
              >
                <div className="mb-1.5 h-16 overflow-hidden rounded-lg bg-[hsl(152,25%,92%)]">
                  {item.photos?.[0] ? (
                    <img src={item.photos[0]} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : null}
                </div>
                <p className="truncate text-[11px] font-bold text-foreground">{item.name}</p>
                <p className="text-[11px] font-extrabold text-[hsl(152,55%,28%)]">
                  {formatMoney(item.price, item.currency)}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {item.availableFrom}–{item.availableUntil}
                </p>
                <p className="truncate text-[10px] font-semibold text-[hsl(152,40%,32%)]">
                  {t(`restaurant.${availabilityLabelKey(item.availability)}`, {
                    defaultValue: item.availability || "",
                  })}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

export function RestaurantCardSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-black/5 bg-white p-4">
      <div className="flex gap-3">
        <div className="h-[108px] w-[108px] rounded-xl bg-neutral-100" />
        <div className="flex-1 space-y-2 py-1">
          <div className="h-4 w-2/3 rounded bg-neutral-100" />
          <div className="h-3 w-1/2 rounded bg-neutral-100" />
          <div className="h-3 w-3/4 rounded bg-neutral-100" />
        </div>
      </div>
    </div>
  );
}
