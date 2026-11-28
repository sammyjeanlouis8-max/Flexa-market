import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useTranslation } from "react-i18next";
import {
  BadgeCheck,
  Clock,
  Flag,
  Heart,
  MapPin,
  MessageCircle,
  Phone,
  Scissors,
  Share2,
  Star,
} from "lucide-react";
import { BeautyPageGate } from "@/components/beauty/BeautyPageGate";
import { BeautyEmpty, BeautyShell } from "@/components/beauty/BeautyShell";
import {
  addBeautyFavorite,
  businessTypeLabelKey,
  fetchBeautyBusiness,
  fetchBeautyPortfolio,
  fetchBeautyReviews,
  formatBeautyPrice,
  removeBeautyFavorite,
  reportBeautyEntity,
  startBeautyConversation,
  trackBeautyRecentlyViewed,
  type BeautyBusiness,
  type BeautyPortfolioItem,
  type BeautyReview,
} from "@/lib/beautyApi";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function BeautyBusinessDetail() {
  const { id } = useParams<{ id: string }>();
  return (
    <BeautyPageGate>
      <BeautyShell>
        <BusinessDetailBody id={Number(id)} />
      </BeautyShell>
    </BeautyPageGate>
  );
}

function BusinessDetailBody({ id }: { id: number }) {
  const { t } = useTranslation();
  const [biz, setBiz] = useState<BeautyBusiness | null>(null);
  const [portfolio, setPortfolio] = useState<BeautyPortfolioItem[]>([]);
  const [reviews, setReviews] = useState<BeautyReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [favorited, setFavorited] = useState(false);
  const [tab, setTab] = useState<"services" | "pros" | "portfolio" | "reviews" | "hours">("services");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(id)) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetchBeautyBusiness(id),
      fetchBeautyPortfolio(id).catch(() => []),
      fetchBeautyReviews(id).catch(() => ({ reviews: [], avgRating: 0, ratingCount: 0 })),
    ])
      .then(([business, items, rev]) => {
        if (cancelled) return;
        setBiz(business);
        setPortfolio(items);
        setReviews(rev.reviews);
        setError(false);
        void trackBeautyRecentlyViewed(id);
      })
      .catch(() => {
        if (!cancelled) {
          setBiz(null);
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return <p className="text-sm text-muted-foreground">{t("beauty.loading")}</p>;
  }
  if (error || !biz) {
    return <BeautyEmpty title={t("beauty.loadError")} body={t("beauty.emptyBody")} />;
  }

  const typeLabel = t(`beauty.${businessTypeLabelKey(biz.businessType)}`);
  const open = !!biz.openNow && !biz.temporarilyClosed && !biz.vacationMode;
  const services = biz.services ?? [];
  const pros = biz.professionals ?? [];

  async function toggleFavorite() {
    setBusy("fav");
    try {
      if (favorited) {
        await removeBeautyFavorite(biz!.id);
        setFavorited(false);
      } else {
        await addBeautyFavorite(biz!.id);
        setFavorited(true);
      }
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }

  async function onMessage() {
    setBusy("msg");
    try {
      const conv = await startBeautyConversation({ businessId: biz!.id });
      window.location.assign(`/messages/${conv.id}`);
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }

  async function onShare() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: biz!.name, url });
      else {
        await navigator.clipboard.writeText(url);
        window.alert(t("beauty.shareCopied"));
      }
    } catch {
      /* ignore */
    }
  }

  async function onReport() {
    const reason = window.prompt("Reason:")?.trim();
    if (!reason) return;
    try {
      await reportBeautyEntity({ businessId: biz!.id, reason, entityType: "business" });
      window.alert(t("beauty.reportSubmitted"));
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-[hsl(350,20%,88%)] bg-white shadow-sm">
        <div className="relative h-40 bg-[hsl(350,25%,92%)] sm:h-52">
          {biz.coverUrl ? (
            <img src={biz.coverUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-[hsl(350,35%,50%)]">
              <Scissors className="h-10 w-10 opacity-40" />
            </div>
          )}
        </div>
        <div className="relative px-4 pb-4 pt-0">
          <div className="-mt-8 flex items-end gap-3">
            <div className="h-16 w-16 overflow-hidden rounded-2xl border-2 border-white bg-[hsl(350,30%,94%)] shadow">
              {biz.logoUrl ? (
                <img src={biz.logoUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Scissors className="h-6 w-6 text-[hsl(350,40%,45%)]" />
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex items-center gap-1.5">
                <h1 className="truncate text-xl font-extrabold tracking-tight text-[hsl(350,20%,14%)]">
                  {biz.name}
                </h1>
                {(biz.identityVerifiedBadge || biz.identityStatus === "verified") && (
                  <BadgeCheck className="h-5 w-5 shrink-0 text-sky-500" aria-label={t("beauty.identityVerified")} />
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {typeLabel}
                {(biz.avgRating > 0 || biz.ratingCount > 0) && (
                  <>
                    {" · "}
                    <Star className="inline h-3 w-3 fill-amber-400 text-amber-400" />{" "}
                    {biz.avgRating.toFixed(1)} ({biz.ratingCount})
                  </>
                )}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase",
                open ? "bg-[hsl(350,45%,40%)] text-white" : "bg-neutral-600 text-white",
              )}
            >
              {open ? t("beauty.openNow") : t("beauty.closed")}
            </span>
          </div>

          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 text-[hsl(350,40%,42%)]" />
            {[biz.distanceKm != null ? `${biz.distanceKm.toFixed(1)} km` : null, biz.city, biz.region, biz.country]
              .filter(Boolean)
              .join(" · ")}
          </p>
          {biz.description && (
            <p className="mt-2 text-sm leading-relaxed text-[hsl(350,15%,28%)]">{biz.description}</p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            {biz.phone && (
              <a
                href={`tel:${biz.phone}`}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[hsl(350,20%,88%)] bg-[hsl(350,40%,97%)] px-3 py-2 text-xs font-bold"
              >
                <Phone className="h-3.5 w-3.5" /> {t("beauty.call")}
              </a>
            )}
            <button
              type="button"
              onClick={() => void onMessage()}
              disabled={busy === "msg"}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[hsl(350,20%,88%)] px-3 py-2 text-xs font-bold"
            >
              <MessageCircle className="h-3.5 w-3.5" /> {t("beauty.message")}
            </button>
            <button
              type="button"
              onClick={() => void toggleFavorite()}
              disabled={busy === "fav"}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[hsl(350,20%,88%)] px-3 py-2 text-xs font-bold"
            >
              <Heart className={cn("h-3.5 w-3.5", favorited && "fill-[hsl(350,55%,45%)] text-[hsl(350,55%,45%)]")} />
              {favorited ? t("beauty.unfavorite") : t("beauty.favorite")}
            </button>
            <button
              type="button"
              onClick={() => void onShare()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[hsl(350,20%,88%)] px-3 py-2 text-xs font-bold"
            >
              <Share2 className="h-3.5 w-3.5" /> {t("beauty.share")}
            </button>
            <button
              type="button"
              onClick={() => void onReport()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-[hsl(350,20%,88%)] px-3 py-2 text-xs font-bold text-muted-foreground"
            >
              <Flag className="h-3.5 w-3.5" /> {t("beauty.report")}
            </button>
          </div>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {(["services", "pros", "portfolio", "reviews", "hours"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold",
              tab === key
                ? "bg-[hsl(350,45%,38%)] text-white"
                : "bg-white text-[hsl(350,20%,30%)] border border-[hsl(350,20%,88%)]",
            )}
          >
            {key === "pros"
              ? t("beauty.professionals")
              : key === "hours"
                ? t("beauty.hours")
                : t(`beauty.${key}`)}
          </button>
        ))}
      </div>

      {tab === "services" && (
        <div className="space-y-2">
          {services.length === 0 ? (
            <BeautyEmpty title={t("beauty.emptyServicesTitle")} body="" />
          ) : (
            services.map((s) => (
              <Link
                key={s.id}
                href={`/beauty/service/${s.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{s.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("beauty.durationMin", { min: s.durationMinutes })}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-extrabold text-[hsl(350,45%,35%)]">
                  {formatBeautyPrice(s.price, s.currency)}
                </p>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === "pros" && (
        <div className="space-y-2">
          {pros.length === 0 ? (
            <BeautyEmpty title={t("beauty.emptyStaffTitle")} body="" />
          ) : (
            pros.map((p) => (
              <Link
                key={p.id}
                href={`/beauty/pro/${p.id}`}
                className="flex items-center gap-3 rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-3"
              >
                <div className="h-12 w-12 overflow-hidden rounded-full bg-[hsl(350,30%,94%)]">
                  {p.photoUrl ? (
                    <img src={p.photoUrl} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{p.fullName}</p>
                  <p className="text-xs text-muted-foreground">{p.role}</p>
                </div>
              </Link>
            ))
          )}
        </div>
      )}

      {tab === "portfolio" && (
        portfolio.length === 0 ? (
          <BeautyEmpty title={t("beauty.emptyPortfolioTitle")} body="" />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {portfolio.map((item) => (
              <div key={item.id} className="aspect-square overflow-hidden rounded-xl bg-[hsl(350,25%,92%)]">
                <img src={item.mediaUrl || item.imageUrl || ""} alt={item.title || item.caption || ""} className="h-full w-full object-cover" loading="lazy" />
              </div>
            ))}
          </div>
        )
      )}

      {tab === "reviews" && (
        reviews.length === 0 ? (
          <BeautyEmpty title={t("beauty.emptyReviewsTitle")} body="" />
        ) : (
          <div className="space-y-2">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-3">
                <p className="inline-flex items-center gap-1 text-sm font-bold">
                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                  {r.overallRating}
                </p>
                {r.comment && <p className="mt-1 text-sm text-[hsl(350,15%,30%)]">{r.comment}</p>}
                {r.ownerReply && (
                  <p className="mt-2 rounded-lg bg-[hsl(350,35%,96%)] px-2 py-1.5 text-xs text-muted-foreground">
                    {r.ownerReply}
                  </p>
                )}
              </div>
            ))}
          </div>
        )
      )}

      {tab === "hours" && (
        <div className="rounded-xl border border-[hsl(350,20%,88%)] bg-white px-3 py-2">
          {(biz.hours ?? []).length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">{t("beauty.hours")}</p>
          ) : (
            (biz.hours ?? []).map((h) => (
              <div key={h.weekday} className="flex items-center justify-between border-b border-[hsl(350,20%,94%)] py-2 text-sm last:border-0">
                <span className="font-medium">{WEEKDAYS[h.weekday] ?? h.weekday}</span>
                <span className="inline-flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  {h.isClosed ? t("beauty.closed") : `${h.openTime} – ${h.closeTime}`}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      <div className="sticky bottom-4 z-20">
        <Link
          href={`/beauty/book/${biz.id}`}
          className="flex w-full items-center justify-center rounded-2xl bg-[hsl(350,45%,38%)] py-3.5 text-sm font-extrabold text-white shadow-lg"
          data-testid="beauty-book-cta"
        >
          {t("beauty.bookCta")}
        </Link>
      </div>
    </div>
  );
}
