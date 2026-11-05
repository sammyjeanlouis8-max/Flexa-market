import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2, Expand, Heart, MapPin, Maximize2, Pause, Play, Volume2, VolumeX, Zap,
} from "lucide-react";
import { COUNTRY_FLAGS } from "@/lib/countries";
import { formatPrice } from "@/lib/currency";
import { cn } from "@/lib/utils";
import PromoVideoPoster from "@/components/PromoVideoPoster";
import { extractListingFeatures } from "@/lib/boostedDealFeatures";

export type BoostedDealListing = {
  id: number;
  title: string;
  description?: string | null;
  price: number;
  currency?: string | null;
  images: string[];
  location: string;
  city?: string | null;
  country?: string | null;
  condition?: string;
  isBoosted: boolean;
  boostExpiresAt?: string | null;
  boostVideoUrl?: string | null;
  category?: string | null;
  categorySlug?: string | null;
  categoryIcon?: string | null;
  subcategory?: string | null;
  favoriteCount?: number;
  viewCount?: number;
  sharesCount?: number;
};

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

function DealVideoPanel({
  listing,
  onUnavailable,
}: {
  listing: BoostedDealListing;
  onUnavailable: () => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [progress, setProgress] = useState(0);

  const videoUrl = listing.boostVideoUrl!;

  useEffect(() => {
    setError(false);
    setPlaying(false);
    setProgress(0);
    setDuration(null);
  }, [videoUrl]);

  useEffect(() => {
    if (error) onUnavailable();
  }, [error, onUnavailable]);

  if (error) {
    return (
      <div className="flex h-full min-h-[220px] items-center justify-center rounded-xl bg-muted text-xs text-muted-foreground">
        {t("home.dealVideoUnavailable", { defaultValue: "Video unavailable" })}
      </div>
    );
  }

  const togglePlay = async () => {
    const el = videoRef.current;
    if (!el) return;
    try {
      if (el.paused) {
        await el.play();
        setPlaying(true);
      } else {
        el.pause();
        setPlaying(false);
      }
    } catch {
      setError(true);
    }
  };

  const openFullscreen = () => {
    const el = videoRef.current;
    if (!el) return;
    const anyEl = el as HTMLVideoElement & {
      webkitEnterFullscreen?: () => void;
      requestFullscreen?: () => Promise<void>;
    };
    if (anyEl.requestFullscreen) void anyEl.requestFullscreen().catch(() => {});
    else if (anyEl.webkitEnterFullscreen) anyEl.webkitEnterFullscreen();
  };

  return (
    <div className="relative h-full min-h-[220px] w-full overflow-hidden rounded-xl bg-zinc-950">
      <video
        ref={videoRef}
        src={videoUrl}
        poster={listing.images?.[0] || undefined}
        playsInline
        muted={muted}
        preload="metadata"
        className="absolute inset-0 h-full w-full object-cover"
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => {
          const el = e.currentTarget;
          if (el.duration > 0) setProgress(el.currentTime / el.duration);
        }}
        onEnded={() => setPlaying(false)}
        onError={() => setError(true)}
        onClick={togglePlay}
      />
      {/* Poster fallback while idle */}
      {!playing && (
        <div className="pointer-events-none absolute inset-0">
          <PromoVideoPoster
            videoUrl={videoUrl}
            thumbnailUrl={listing.images?.[0] ?? null}
            title={listing.title}
          />
        </div>
      )}

      {duration != null && duration > 0 && (
        <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
          <Expand className="h-3 w-3 opacity-80" />
          {formatDuration(duration)}
        </span>
      )}

      <button
        type="button"
        onClick={togglePlay}
        className="absolute inset-0 z-10 flex items-center justify-center"
        aria-label={playing ? t("common.pause", { defaultValue: "Pause" }) : t("common.play", { defaultValue: "Play" })}
      >
        {!playing && (
          <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/70 bg-black/30 text-white backdrop-blur-sm shadow-lg">
            <Play className="h-6 w-6 fill-white ml-0.5" />
          </span>
        )}
      </button>

      <div className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2.5 pt-8">
        <div className="mb-2 h-0.5 overflow-hidden rounded-full bg-white/25">
          <div className="h-full bg-white transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setMuted((m) => !m); }}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white"
            aria-label={muted ? t("videoFeed.tapForSound") : t("videoFeed.soundOff")}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); void togglePlay(); }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white"
            >
              {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 fill-white" />}
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); openFullscreen(); }}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white"
              aria-label={t("common.fullscreen", { defaultValue: "Fullscreen" })}
            >
              <Maximize2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DealInfoPanel({ listing }: { listing: BoostedDealListing }) {
  const { t } = useTranslation();
  const features = useMemo(() => extractListingFeatures(listing.description), [listing.description]);
  const blurb = (listing.description ?? "").trim();
  const shortBlurb = blurb
    ? (blurb.length > 160 ? `${blurb.slice(0, 157).trim()}…` : blurb)
    : "";

  return (
    <div className="relative flex h-full min-h-[220px] flex-col overflow-hidden rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50/90 via-white to-emerald-50/40 p-3.5 dark:border-emerald-900/40 dark:from-emerald-950/40 dark:via-card dark:to-emerald-950/20">
      <div className="pointer-events-none absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-emerald-200/40 blur-2xl dark:bg-emerald-800/20" aria-hidden />
      <h3 className="relative text-[15px] font-black leading-snug text-[hsl(152,65%,22%)] dark:text-emerald-300 line-clamp-2">
        {listing.title}
      </h3>
      {shortBlurb ? (
        <p className="relative mt-2 text-[12px] leading-relaxed text-muted-foreground line-clamp-4">
          {shortBlurb}
        </p>
      ) : (
        <p className="relative mt-2 text-[12px] leading-relaxed text-muted-foreground">
          {t("home.dealInfoFallback", { defaultValue: "Open the product page for full details from the seller." })}
        </p>
      )}
      {features.length > 0 && (
        <ul className="relative mt-3 space-y-1.5">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-1.5 text-[11px] font-medium text-foreground/90">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="line-clamp-2">{f}</span>
            </li>
          ))}
        </ul>
      )}
      <Link
        href={`/listings/${listing.id}`}
        className="relative mt-auto inline-flex items-center justify-center rounded-lg bg-[hsl(152,65%,18%)] px-3 py-2 text-[12px] font-bold text-white"
      >
        {t("buttons.viewProduct", { defaultValue: "View product" })}
      </Link>
    </div>
  );
}

export default function BoostedDealCard({
  listing,
  indexLabel,
}: {
  listing: BoostedDealListing;
  indexLabel?: string;
}) {
  const { t } = useTranslation();
  const [forceInfoPanel, setForceInfoPanel] = useState(false);
  const handleVideoUnavailable = useCallback(() => setForceInfoPanel(true), []);
  const hasVideo = !!listing.boostVideoUrl && !forceInfoPanel;
  const place = listing.city || listing.location || "";
  const categoryLabel = listing.subcategory || listing.category || null;
  const flag = listing.country ? COUNTRY_FLAGS[listing.country] : null;
  const image = listing.images?.[0];

  return (
    <article
      className="overflow-hidden rounded-2xl border border-orange-200/80 bg-white shadow-sm dark:border-orange-900/40 dark:bg-card"
      data-testid={`boosted-deal-${listing.id}`}
    >
      <div className="grid grid-cols-1 gap-0 sm:grid-cols-2">
        {/* LEFT — product summary */}
        <div className="flex min-w-0 flex-col p-3">
          <Link href={`/listings/${listing.id}`} className="relative block overflow-hidden rounded-xl bg-muted aspect-[4/3]">
            {image ? (
              <img src={image} alt={listing.title} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground text-sm">No image</div>
            )}
            {indexLabel && (
              <span className="absolute left-2 top-2 rounded-md bg-black/55 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
                {indexLabel}
              </span>
            )}
            <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-orange-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-white shadow">
              {t("home.featuredBadge", { defaultValue: "Featured" })}
              {flag ? <span className="text-[11px] leading-none">{flag}</span> : null}
            </span>
          </Link>

          <Link href={`/listings/${listing.id}`} className="mt-2.5 block min-w-0">
            <h3 className="line-clamp-2 text-[13px] font-bold leading-snug text-foreground">{listing.title}</h3>
          </Link>
          <p className="mt-1 text-[16px] font-black text-foreground">
            {formatPrice(listing.price, listing.country, listing.currency)}
          </p>
          {place && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{place}</span>
            </p>
          )}
          {categoryLabel && (
            <p className="mt-0.5 truncate text-[11px] font-medium text-muted-foreground">
              {listing.categoryIcon ? `${listing.categoryIcon} ` : ""}{categoryLabel}
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-3 text-[11px] text-muted-foreground">
            {(listing.favoriteCount ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 font-semibold">
                <Heart className="h-3 w-3 fill-rose-500 text-rose-500" />
                {listing.favoriteCount}
              </span>
            )}
            {(listing.viewCount ?? 0) > 0 && (
              <span className="tabular-nums">{listing.viewCount} {t("videoFeed.views")}</span>
            )}
          </div>

          <div className="mt-auto pt-3">
            <Link
              href={`/listings/${listing.id}`}
              className={cn(
                "inline-flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-emerald-500/80",
                "bg-emerald-50 px-3 py-2.5 text-[12px] font-black text-emerald-700",
                "dark:bg-emerald-950/40 dark:text-emerald-300",
              )}
            >
              <Zap className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" />
              {t("buttons.boosted", { defaultValue: "Promoted ✓" })}
            </Link>
          </div>
        </div>

        {/* RIGHT — video or info panel */}
        <div className="min-h-[220px] p-3 pt-0 sm:pt-3">
          {hasVideo ? (
            <DealVideoPanel listing={listing} onUnavailable={handleVideoUnavailable} />
          ) : (
            <DealInfoPanel listing={listing} />
          )}
        </div>
      </div>
    </article>
  );
}
