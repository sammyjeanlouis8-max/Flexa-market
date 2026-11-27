import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { BadgeCheck, Clock, Heart, MapPin, Star, UtensilsCrossed } from "lucide-react";
import {
  BUSINESS_TYPES,
  businessTypeLabelKey,
  restaurantAvailabilityLabel,
  type Restaurant,
} from "@/lib/restaurantApi";
import { cn } from "@/lib/utils";

export function RestaurantCard({
  restaurant: r,
  compact,
}: {
  restaurant: Restaurant;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const avail = restaurantAvailabilityLabel(r.availabilityStatus, r.openNow ?? r.isOpenNow);
  const typeKey = businessTypeLabelKey(r.businessType);
  const typeLabel = t(`restaurant.${typeKey}`, {
    defaultValue: BUSINESS_TYPES.find((b) => b.id === r.businessType)?.id || r.businessType,
  });
  const cityLine = [r.city, r.region].filter(Boolean).join(", ") || r.country;
  const cover = r.coverUrl || r.menuPreview?.[0]?.photos?.[0] || null;
  const cuisine = (r.cuisineTags || []).slice(0, 3).join(" · ");
  const prep = r.estimatedPrepMinutes;
  const distanceLabel =
    r.distanceKm != null
      ? t("restaurant.distanceAway", {
          defaultValue: "{{km}} km away",
          km: r.distanceKm.toFixed(1),
        })
      : null;

  const badgeClass =
    avail.tone === "open"
      ? "bg-[hsl(152,55%,32%)] text-white"
      : avail.tone === "soon"
        ? "bg-orange-500 text-white"
        : avail.tone === "neutral"
          ? "bg-neutral-500 text-white"
          : "bg-neutral-600/90 text-white";

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border border-black/5 bg-white shadow-[0_8px_24px_rgba(15,40,30,0.07)] transition hover:shadow-[0_12px_28px_rgba(15,40,30,0.12)]",
        compact && "shadow-sm",
      )}
      data-testid={`restaurant-card-${r.id}`}
    >
      <Link href={`/restaurant/${r.id}`} className="block">
        <div className="flex gap-3 p-3 sm:gap-3.5 sm:p-3.5">
          <div className="relative h-[100px] w-[100px] shrink-0 overflow-hidden rounded-xl bg-[hsl(152,25%,94%)] sm:h-[112px] sm:w-[112px]">
            {cover ? (
              <img src={cover} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[hsl(152,45%,35%)]">
                <UtensilsCrossed className="h-8 w-8 opacity-50" />
              </div>
            )}
            <span
              className={cn(
                "absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm",
                badgeClass,
              )}
            >
              {t(avail.key, {
                defaultValue:
                  avail.tone === "open"
                    ? "Open"
                    : avail.tone === "soon"
                      ? "Closing Soon"
                      : avail.tone === "neutral"
                        ? "Unavailable"
                        : "Closed",
              })}
            </span>
          </div>

          <div className="min-w-0 flex-1 py-0.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="truncate text-[15px] font-extrabold leading-tight text-[hsl(152,30%,12%)] sm:text-[16px]">
                    {r.name}
                  </h3>
                  {r.identityVerifiedBadge || r.identityStatus === "verified" ? (
                    <BadgeCheck
                      className="h-4 w-4 shrink-0 text-sky-500"
                      aria-label={t("restaurant.identityVerified", { defaultValue: "Identity verified" })}
                    />
                  ) : null}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {typeLabel}
                  {cuisine ? ` · ${cuisine}` : ""}
                </p>
              </div>
              <button
                type="button"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(152,20%,96%)] text-[hsl(152,20%,40%)]"
                aria-label={t("restaurant.favorite", { defaultValue: "Favorite" })}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <Heart className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground sm:text-xs">
              <MapPin className="h-3 w-3 shrink-0 text-[hsl(152,45%,35%)]" />
              <span className="truncate">
                {[distanceLabel, cityLine].filter(Boolean).join(" · ")}
              </span>
            </p>

            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] sm:text-xs">
              {(r.avgRating > 0 || r.ratingCount > 0) ? (
                <span className="inline-flex items-center gap-1 font-semibold text-[hsl(152,25%,22%)]">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  {r.avgRating.toFixed(1)}
                  <span className="font-normal text-muted-foreground">({r.ratingCount})</span>
                </span>
              ) : null}
              {prep != null && prep > 0 ? (
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {t("restaurant.prepRange", {
                    defaultValue: "{{min}}–{{max}} min",
                    min: Math.max(10, prep - 5),
                    max: prep + 10,
                  })}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </Link>
    </article>
  );
}

export function RestaurantCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-2xl border border-black/5 bg-white p-3 shadow-sm animate-pulse">
      <div className="h-[100px] w-[100px] shrink-0 rounded-xl bg-[hsl(152,20%,92%)]" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-4 w-2/3 rounded bg-[hsl(152,20%,92%)]" />
        <div className="h-3 w-1/2 rounded bg-[hsl(152,20%,94%)]" />
        <div className="h-3 w-3/4 rounded bg-[hsl(152,20%,94%)]" />
        <div className="h-3 w-1/3 rounded bg-[hsl(152,20%,94%)]" />
      </div>
    </div>
  );
}

export default RestaurantCard;
