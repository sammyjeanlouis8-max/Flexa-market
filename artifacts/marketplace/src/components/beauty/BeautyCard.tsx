import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { BadgeCheck, MapPin, Scissors, Star } from "lucide-react";
import { businessTypeLabelKey, type BeautyBusiness } from "@/lib/beautyApi";
import { cn } from "@/lib/utils";

export function BeautyCard({
  business: b,
  compact,
}: {
  business: BeautyBusiness;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const typeKey = businessTypeLabelKey(b.businessType);
  const typeLabel = t(`beauty.${typeKey}`, { defaultValue: b.businessType });
  const cityLine = [b.city, b.region].filter(Boolean).join(", ") || b.country;
  const open = !!b.openNow && !b.temporarilyClosed && !b.vacationMode;
  const distanceLabel =
    b.distanceKm != null
      ? t("beauty.distanceAway", {
          defaultValue: "{{km}} km away",
          km: b.distanceKm.toFixed(1),
        })
      : null;
  const thumb = b.logoUrl || b.coverUrl || null;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border border-[hsl(350,20%,90%)] bg-white shadow-[0_6px_18px_rgba(40,20,30,0.06)] transition hover:shadow-[0_10px_24px_rgba(40,20,30,0.1)]",
        compact && "shadow-sm",
      )}
      data-testid={`beauty-card-${b.id}`}
    >
      <Link href={`/beauty/${b.id}`} className="block">
        <div className="flex gap-3 p-3 sm:gap-3.5 sm:p-3.5">
          <div className="relative h-[88px] w-[88px] shrink-0 overflow-hidden rounded-xl bg-[hsl(350,30%,94%)] sm:h-[100px] sm:w-[100px]">
            {thumb ? (
              <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[hsl(350,40%,45%)]">
                <Scissors className="h-7 w-7 opacity-50" />
              </div>
            )}
            <span
              className={cn(
                "absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow-sm",
                open ? "bg-[hsl(350,45%,40%)] text-white" : "bg-neutral-600/90 text-white",
              )}
            >
              {open
                ? t("beauty.openNow", { defaultValue: "Open now" })
                : t("beauty.closed", { defaultValue: "Closed" })}
            </span>
          </div>

          <div className="min-w-0 flex-1 py-0.5">
            <div className="flex items-start gap-1.5">
              <h3 className="truncate text-[15px] font-extrabold leading-tight text-[hsl(350,20%,14%)] sm:text-[16px]">
                {b.name}
              </h3>
              {b.identityVerifiedBadge || b.identityStatus === "verified" ? (
                <BadgeCheck
                  className="h-4 w-4 shrink-0 text-sky-500"
                  aria-label={t("beauty.identityVerified", { defaultValue: "Verified" })}
                />
              ) : null}
            </div>
            <p className="mt-0.5">
              <span className="inline-flex rounded-md bg-[hsl(350,35%,95%)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[hsl(350,40%,38%)]">
                {typeLabel}
              </span>
            </p>
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground sm:text-xs">
              <MapPin className="h-3 w-3 shrink-0 text-[hsl(350,40%,42%)]" />
              <span className="truncate">{[distanceLabel, cityLine].filter(Boolean).join(" · ")}</span>
            </p>
            {(b.avgRating > 0 || b.ratingCount > 0) && (
              <p className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-[hsl(350,20%,22%)] sm:text-xs">
                <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                {b.avgRating.toFixed(1)}
                <span className="font-normal text-muted-foreground">({b.ratingCount})</span>
              </p>
            )}
          </div>
        </div>
      </Link>
    </article>
  );
}

export function BeautyCardSkeleton() {
  return (
    <div className="flex gap-3 rounded-2xl border border-[hsl(350,20%,90%)] bg-white p-3 shadow-sm animate-pulse">
      <div className="h-[88px] w-[88px] shrink-0 rounded-xl bg-[hsl(350,20%,92%)]" />
      <div className="flex-1 space-y-2 py-1">
        <div className="h-4 w-2/3 rounded bg-[hsl(350,20%,92%)]" />
        <div className="h-3 w-1/3 rounded bg-[hsl(350,20%,94%)]" />
        <div className="h-3 w-3/4 rounded bg-[hsl(350,20%,94%)]" />
        <div className="h-3 w-1/4 rounded bg-[hsl(350,20%,94%)]" />
      </div>
    </div>
  );
}

export default BeautyCard;
