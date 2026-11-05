import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Activity, Check, Eye, Heart, Leaf, MapPin, Maximize2, Pause, Play,
  RefreshCw, Video, Zap,
} from "lucide-react";
import { COUNTRY_FLAGS } from "@/lib/countries";
import { formatPrice } from "@/lib/currency";
import { cn } from "@/lib/utils";
import PromoVideoPoster from "@/components/PromoVideoPoster";
import { extractListingFeatures } from "@/lib/boostedDealFeatures";
import {
  isValidProductVideoUrl,
  resolveValidProductVideoUrl,
} from "@/lib/boostedDealVideo";

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
  /** Boost campaign promo video (preferred). */
  boostVideoUrl?: string | null;
  /** Seller-uploaded product video (fallback when boost video missing). */
  listingVideoUrl?: string | null;
  category?: string | null;
  categorySlug?: string | null;
  categoryIcon?: string | null;
  subcategory?: string | null;
  favoriteCount?: number;
  viewCount?: number;
  sharesCount?: number;
};

export { isValidProductVideoUrl, resolveValidProductVideoUrl };

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

const FEATURE_ICONS = [Activity, RefreshCw, Zap, Leaf] as const;

function DealVideoPanel({
  videoUrl,
  listing,
  onUnavailable,
}: {
  videoUrl: string;
  listing: BoostedDealListing;
  onUnavailable: () => void;
}) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setError(false);
    setPlaying(false);
    setProgress(0);
    setDuration(null);
  }, [videoUrl]);

  useEffect(() => {
    if (error) onUnavailable();
  }, [error, onUnavailable]);

  if (error) return null;

  const togglePlay = async () => {
    const el = videoRef.current;
    if (!el) return;
    try {
      if (el.paused) {
        el.muted = true;
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
    <div
      className="relative h-full min-h-0 w-full overflow-hidden rounded-xl bg-zinc-950"
      data-testid="boosted-deal-video-panel"
    >
      <video
        ref={videoRef}
        src={videoUrl}
        poster={listing.images?.[0] || undefined}
        playsInline
        muted
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
        onClick={(e) => { e.preventDefault(); void togglePlay(); }}
      />

      {!playing && (
        <div className="pointer-events-none absolute inset-0">
          <PromoVideoPoster
            videoUrl={videoUrl}
            thumbnailUrl={listing.images?.[0] ?? null}
            title={listing.title}
          />
        </div>
      )}

      {(duration != null && duration > 0) && (
        <span className="absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
          <Video className="h-3 w-3 opacity-90" />
          {formatDuration(duration)}
        </span>
      )}

      <button
        type="button"
        onClick={(e) => { e.preventDefault(); void togglePlay(); }}
        className="absolute inset-0 z-10 flex items-center justify-center"
        aria-label={playing ? t("common.pause", { defaultValue: "Pause" }) : t("common.play", { defaultValue: "Play" })}
        data-testid="boosted-deal-video-play"
      >
        {!playing ? (
          <span className="flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-full border-[2px] border-white/80 bg-white/25 text-white backdrop-blur-[2px] shadow-lg">
            <Play className="h-5 w-5 sm:h-6 sm:w-6 fill-white ml-0.5" />
          </span>
        ) : (
          <span className="opacity-0 hover:opacity-100 focus:opacity-100 flex h-10 w-10 items-center justify-center rounded-full bg-black/40 text-white transition-opacity">
            <Pause className="h-4 w-4" />
          </span>
        )}
      </button>

      <div className="absolute inset-x-0 bottom-0 z-20 flex items-end gap-2 px-2 pb-2 pt-10 bg-gradient-to-t from-black/55 to-transparent">
        <div className="mb-1.5 h-1 flex-1 overflow-hidden rounded-full bg-white/30">
          <div
            className="h-full rounded-full bg-[hsl(152,65%,42%)] transition-[width]"
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); openFullscreen(); }}
          className="mb-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/95"
          aria-label={t("common.fullscreen", { defaultValue: "Fullscreen" })}
          data-testid="boosted-deal-video-fullscreen"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function DealImageAndDescriptionPanel({ listing }: { listing: BoostedDealListing }) {
  const { t } = useTranslation();
  const features = useMemo(() => extractListingFeatures(listing.description), [listing.description]);
  const images = listing.images ?? [];
  const main = images[0] ?? null;
  const secondary = images[1] ?? main;
  const blurb = (listing.description ?? "").trim();
  const shortBlurb = blurb
    ? (blurb.length > 110 ? `${blurb.slice(0, 107).trim()}…` : blurb)
    : "";

  return (
    <div
      className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl bg-[hsl(152,40%,96%)] dark:bg-emerald-950/30"
      data-testid="boosted-deal-info-panel"
    >
      <Link
        href={`/listings/${listing.id}`}
        className="relative block shrink-0 overflow-hidden bg-muted aspect-[5/4] max-h-[46%]"
      >
        {secondary ? (
          <img
            src={secondary}
            alt=""
            className={cn(
              "h-full w-full object-cover",
              !images[1] && main ? "object-[center_30%] scale-110" : "",
            )}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
            {t("home.noImage", { defaultValue: "No image" })}
          </div>
        )}
      </Link>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5 px-2.5 py-2">
        <Link href={`/listings/${listing.id}`} className="min-w-0">
          <h3 className="line-clamp-2 text-[12px] sm:text-[13px] font-bold leading-snug text-[hsl(152,65%,22%)] dark:text-emerald-300">
            {listing.title}
          </h3>
        </Link>
        {shortBlurb ? (
          <p className="text-[10px] sm:text-[11px] leading-snug text-muted-foreground line-clamp-2">
            {shortBlurb}
          </p>
        ) : null}
        {features.length > 0 && (
          <ul className="mt-0.5 space-y-1">
            {features.map((f, i) => {
              const Icon = FEATURE_ICONS[i % FEATURE_ICONS.length];
              return (
                <li key={f} className="flex items-center gap-1.5 min-w-0">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[hsl(152,55%,32%)] text-white">
                    <Icon className="h-2.5 w-2.5" strokeWidth={2.5} />
                  </span>
                  <span className="truncate text-[10px] sm:text-[11px] font-medium text-foreground/90">{f}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default function BoostedDealCard({
  listing,
}: {
  listing: BoostedDealListing;
  /** @deprecated Image counter is derived from listing.images length. */
  indexLabel?: string;
}) {
  const { t } = useTranslation();
  const [forceInfoPanel, setForceInfoPanel] = useState(false);
  const handleVideoUnavailable = useCallback(() => setForceInfoPanel(true), []);

  const videoUrl = useMemo(() => resolveValidProductVideoUrl(listing), [listing]);
  const hasValidProductVideo = !!videoUrl && !forceInfoPanel;

  const place = listing.city || listing.location || "";
  const categoryLabel = listing.subcategory || listing.category || null;
  const flag = listing.country ? COUNTRY_FLAGS[listing.country] : null;
  const images = listing.images ?? [];
  const image = images[0];
  const imageCount = Math.max(images.length, image ? 1 : 0);
  const views = listing.viewCount ?? 0;
  const likes = listing.favoriteCount ?? 0;

  let rightPanel: ReactNode;
  if (hasValidProductVideo && videoUrl) {
    rightPanel = (
      <DealVideoPanel
        videoUrl={videoUrl}
        listing={listing}
        onUnavailable={handleVideoUnavailable}
      />
    );
  } else {
    rightPanel = <DealImageAndDescriptionPanel listing={listing} />;
  }

  return (
    <article
      className="overflow-hidden rounded-2xl border border-orange-300/90 bg-white shadow-sm dark:border-orange-900/50 dark:bg-card"
      data-testid={`boosted-deal-${listing.id}`}
    >
      {/* Always side-by-side — including narrow phones (≈48% / 52%). */}
      <div className="grid grid-cols-[minmax(0,48fr)_minmax(0,52fr)] gap-0 items-stretch">
        {/* LEFT — product summary */}
        <div className="flex min-w-0 flex-col p-2 sm:p-2.5">
          <Link
            href={`/listings/${listing.id}`}
            className="relative block overflow-hidden rounded-xl bg-muted aspect-square sm:aspect-[4/3]"
          >
            {image ? (
              <img src={image} alt={listing.title} className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="flex h-full items-center justify-center text-muted-foreground text-[11px]">
                {t("home.noImage", { defaultValue: "No image" })}
              </div>
            )}
            <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-orange-500 px-1.5 py-0.5 text-[8px] sm:text-[9px] font-black uppercase tracking-wide text-white shadow">
              {t("home.featuredBadge", { defaultValue: "Featured" })}
              {flag ? <span className="text-[10px] leading-none">{flag}</span> : null}
            </span>
            {imageCount > 0 && (
              <span className="absolute bottom-1.5 left-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[9px] font-bold text-white tabular-nums">
                1/{imageCount}
              </span>
            )}
          </Link>

          <Link href={`/listings/${listing.id}`} className="mt-1.5 block min-w-0">
            <h3 className="line-clamp-2 text-[11px] sm:text-[13px] font-bold leading-snug text-foreground">
              {listing.title}
            </h3>
          </Link>
          <p className="mt-0.5 text-[14px] sm:text-[16px] font-black text-foreground tabular-nums">
            {formatPrice(listing.price, listing.country, listing.currency)}
          </p>
          {place && (
            <p className="mt-0.5 flex items-center gap-0.5 text-[10px] sm:text-[11px] text-muted-foreground">
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">{place}</span>
            </p>
          )}
          {categoryLabel && (
            <span className="mt-1 inline-flex max-w-full self-start truncate rounded-md bg-muted px-1.5 py-0.5 text-[9px] sm:text-[10px] font-medium text-muted-foreground">
              {categoryLabel}
            </span>
          )}
          <div className="mt-1 flex items-center gap-2.5 text-[10px] sm:text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-0.5 tabular-nums font-medium">
              <Eye className="h-3 w-3 shrink-0" />
              {views}
            </span>
            <span className="inline-flex items-center gap-0.5 tabular-nums font-semibold">
              <Heart className="h-3 w-3 shrink-0 fill-rose-500 text-rose-500" />
              {likes}
            </span>
          </div>

          <div className="mt-auto pt-2">
            <Link
              href={`/listings/${listing.id}`}
              className={cn(
                "inline-flex w-full items-center justify-center gap-1 rounded-full border border-emerald-500/70",
                "bg-emerald-50 px-2 py-1.5 text-[10px] sm:text-[11px] font-bold text-emerald-700",
                "dark:bg-emerald-950/40 dark:text-emerald-300",
              )}
              data-testid="boosted-deal-promoted"
            >
              <Zap className="h-3 w-3 fill-emerald-500 text-emerald-500" />
              {t("buttons.boosted", { defaultValue: "Promoted" })}
              <Check className="h-3 w-3" strokeWidth={3} />
            </Link>
          </div>
        </div>

        {/* RIGHT — video XOR image+description */}
        <div className="min-h-0 min-w-0 p-2 pl-1 sm:p-2.5 sm:pl-1.5">
          <div className="h-full min-h-[200px] sm:min-h-[220px]">
            {rightPanel}
          </div>
        </div>
      </div>
    </article>
  );
}
