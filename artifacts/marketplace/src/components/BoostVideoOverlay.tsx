import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Volume2, VolumeX, SkipForward, Loader2 } from "lucide-react";
import { isAudioUnlocked, setAudioUnlocked } from "@/lib/audioUnlocked";
import { useAuth } from "@/contexts/auth";
import { trackBoosterEvent } from "@/booster/trackEvent";

/**
 * Professional Booster Pro Max ad player.
 *
 * - Skip countdown tracks actual media playback time (not wall clock).
 * - Paused / buffering time does not advance the countdown.
 * - Image interruptive ads use a 10s display countdown.
 * - Autoplay attempts sound when prior unlock permits; otherwise muted + Unmute.
 * - Never traps users on media errors.
 */

const SKIP_AFTER_SEC = 10;
const AD_INTERVAL_MS = 5 * 60_000;
const STORAGE_KEY = "flexamarket_boost_last_shown";

export function shouldShowBoostAd(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    return Date.now() - Number(raw) >= AD_INTERVAL_MS;
  } catch {
    return true;
  }
}

export function markBoostAdShown(): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch { /* private */ }
}

function toFetchableUrl(stored: string): string {
  const value = stored.trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/api/")) return value;
  if (value.startsWith("/") && !value.startsWith("/objects/")) return value;
  const trimmed = value.startsWith("/objects/")
    ? value.slice("/objects/".length)
    : value;
  return `/api/storage/objects/${trimmed}`;
}

interface BoostListing {
  id: number;
  title: string;
  price: number;
  thumbnail: string | null;
  boostVideoUrl: string | null;
  sellerName: string | null;
  boostCtaType: string | null;
  boostExternalLink: string | null;
  boostWhatsappNumber: string | null;
  boostCtaText: string | null;
  status?: string | null;
  isVideoOnly?: boolean;
  mediaType?: "image" | "video" | null;
  boostId?: number | null;
}

interface Props {
  listing: BoostListing;
  onClose: () => void;
}

export default function BoostVideoOverlay({ listing, onClose }: Props) {
  const { t } = useTranslation();
  const { token, user } = useAuth();
  const [, setLocation] = useLocation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const skipHandledRef = useRef(false);
  const playedMsRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const tenSecTrackedRef = useRef(false);
  const startTrackedRef = useRef(false);
  const impressionTrackedRef = useRef(false);

  const isImageAd = listing.mediaType === "image"
    || (!listing.boostVideoUrl && !!listing.thumbnail);

  const [countdown, setCountdown] = useState(SKIP_AFTER_SEC);
  const skipReady = countdown <= 0;
  const [muted, setMuted] = useState(true);
  const [videoPct, setVideoPct] = useState(0);
  const [videoFailed, setVideoFailed] = useState(false);
  const [loading, setLoading] = useState(!isImageAd);
  const [showUnmute, setShowUnmute] = useState(false);

  const track = useCallback((eventType: Parameters<typeof trackBoosterEvent>[0]["eventType"]) => {
    void trackBoosterEvent({
      listingId: listing.id,
      boostId: listing.boostId,
      eventType,
      placement: "overlay",
      token,
      country: user?.country,
      state: user?.state,
      city: user?.location,
    });
  }, [listing.id, listing.boostId, token, user?.country, user?.state, user?.location]);

  // Impression once on mount
  useEffect(() => {
    if (impressionTrackedRef.current) return;
    impressionTrackedRef.current = true;
    track("impression");
  }, [track]);

  // Image ad: wall-clock display countdown (interruptive placement only)
  useEffect(() => {
    if (!isImageAd) return;
    const started = performance.now();
    const id = window.setInterval(() => {
      const elapsed = (performance.now() - started) / 1000;
      const left = Math.max(0, Math.ceil(SKIP_AFTER_SEC - elapsed));
      setCountdown(left);
      if (elapsed >= SKIP_AFTER_SEC && !tenSecTrackedRef.current) {
        tenSecTrackedRef.current = true;
        track("ten_sec_view");
      }
      if (left <= 0) window.clearInterval(id);
    }, 200);
    return () => window.clearInterval(id);
  }, [isImageAd, track]);

  // Video: progress bar + playback-time countdown
  useEffect(() => {
    if (isImageAd) return;
    const vid = videoRef.current;
    if (!vid) return;

    const onTime = () => {
      if (vid.duration && isFinite(vid.duration) && vid.duration > 0) {
        setVideoPct((vid.currentTime / vid.duration) * 100);
      }
    };

    const tick = () => {
      if (vid.paused || vid.ended || vid.readyState < 2) {
        lastTickRef.current = null;
        return;
      }
      const now = performance.now();
      if (lastTickRef.current != null) {
        playedMsRef.current += now - lastTickRef.current;
      }
      lastTickRef.current = now;
      const playedSec = playedMsRef.current / 1000;
      const left = Math.max(0, Math.ceil(SKIP_AFTER_SEC - playedSec));
      setCountdown(left);
      if (playedSec >= SKIP_AFTER_SEC && !tenSecTrackedRef.current) {
        tenSecTrackedRef.current = true;
        track("ten_sec_view");
      }
    };

    const onPlaying = () => {
      setLoading(false);
      setVideoFailed(false);
      lastTickRef.current = performance.now();
      if (!startTrackedRef.current) {
        startTrackedRef.current = true;
        track("video_start");
      }
    };
    const onPause = () => { lastTickRef.current = null; };
    const onWaiting = () => { lastTickRef.current = null; setLoading(true); };
    const onCanPlay = () => setLoading(false);

    const interval = window.setInterval(tick, 200);
    vid.addEventListener("timeupdate", onTime);
    vid.addEventListener("loadedmetadata", onTime);
    vid.addEventListener("playing", onPlaying);
    vid.addEventListener("pause", onPause);
    vid.addEventListener("waiting", onWaiting);
    vid.addEventListener("canplay", onCanPlay);
    return () => {
      window.clearInterval(interval);
      vid.removeEventListener("timeupdate", onTime);
      vid.removeEventListener("loadedmetadata", onTime);
      vid.removeEventListener("playing", onPlaying);
      vid.removeEventListener("pause", onPause);
      vid.removeEventListener("waiting", onWaiting);
      vid.removeEventListener("canplay", onCanPlay);
    };
  }, [isImageAd, track]);

  // Autoplay with sound preference
  useEffect(() => {
    if (isImageAd) return;
    const vid = videoRef.current;
    if (!vid) return;
    let cancelled = false;

    const attemptPlay = async (withSound: boolean) => {
      vid.muted = !withSound;
      setMuted(!withSound);
      try {
        await vid.play();
        if (cancelled) return;
        if (withSound) {
          setAudioUnlocked(true);
          setShowUnmute(false);
        } else {
          setShowUnmute(true);
        }
      } catch {
        if (cancelled) return;
        if (withSound) await attemptPlay(false);
        else {
          setShowUnmute(true);
          setLoading(false);
        }
      }
    };

    if (isAudioUnlocked()) {
      void attemptPlay(true);
    } else {
      void attemptPlay(false);
    }

    const onUnlocked = (e: Event) => {
      if ((e as CustomEvent<boolean>).detail && videoRef.current) {
        videoRef.current.muted = false;
        setMuted(false);
        setShowUnmute(false);
        videoRef.current.play().catch(() => {});
      }
    };
    window.addEventListener("flexa:audio-unlocked", onUnlocked);
    return () => {
      cancelled = true;
      window.removeEventListener("flexa:audio-unlocked", onUnlocked);
    };
  }, [isImageAd]);

  const toggleMute = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const vid = videoRef.current;
    if (!vid) return;
    const next = !vid.muted;
    vid.muted = next;
    setMuted(next);
    setShowUnmute(next);
    if (!next) {
      setAudioUnlocked(true);
      vid.play().catch(() => {});
    }
  }, []);

  const finish = useCallback((reason: "skip" | "complete" | "error" | "cta") => {
    if (skipHandledRef.current) return;
    skipHandledRef.current = true;
    videoRef.current?.pause();
    if (reason === "skip") track("skip");
    if (reason === "complete") track("video_complete");
    if (reason === "cta") track("click");
    onClose();
  }, [onClose, track]);

  const handleSkip = useCallback((e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!skipReady) return;
    finish("skip");
  }, [skipReady, finish]);

  const retryVideo = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const video = videoRef.current;
    if (!video) {
      finish("error");
      return;
    }
    setVideoFailed(false);
    setLoading(true);
    video.load();
    video.play().catch(() => {
      setVideoFailed(true);
      setLoading(false);
    });
  }, [finish]);

  const isVideoOnly = listing.isVideoOnly || listing.status === "hidden";
  const hasExternalCta =
    (listing.boostCtaType === "link" && !!listing.boostExternalLink)
    || (listing.boostCtaType === "whatsapp" && !!listing.boostWhatsappNumber);

  const handleCta = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const type = listing.boostCtaType;
    if (type === "link" && listing.boostExternalLink) {
      window.open(listing.boostExternalLink, "_blank", "noopener,noreferrer");
      finish("cta");
    } else if (type === "whatsapp" && listing.boostWhatsappNumber) {
      window.open(`https://wa.me/${listing.boostWhatsappNumber.replace(/\D/g, "")}`, "_blank", "noopener,noreferrer");
      finish("cta");
    } else if (!isVideoOnly) {
      setLocation(`/listings/${listing.id}?buy=1`);
      finish("cta");
    } else {
      finish("cta");
    }
  }, [listing, finish, setLocation, isVideoOnly]);

  const ctaLabel = listing.boostCtaText
    || (listing.boostCtaType === "link"
      ? t("boostAd.visitLink", "Learn More")
      : listing.boostCtaType === "whatsapp"
        ? t("boostAd.chatWhatsApp", "WhatsApp")
        : t("boostAd.viewListing", "Learn More"));

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[99] bg-black/55"
        aria-hidden
        onClick={() => { /* block backdrop skip before ready */ }}
      />
      <div
        className="fixed inset-x-0 top-0 z-[100] mx-auto w-full max-w-3xl"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        role="dialog"
        aria-modal="true"
        aria-label={t("boostAd.sponsored")}
        data-testid="boost-video-overlay"
      >
        <div
          className="relative w-full overflow-hidden bg-black shadow-2xl"
          style={{ maxHeight: "min(62vh, 520px)" }}
        >
          {listing.thumbnail && (
            <img
              src={listing.thumbnail}
              alt=""
              aria-hidden
              className="absolute inset-0 h-full w-full object-contain opacity-40"
            />
          )}

          {isImageAd ? (
            <img
              src={listing.thumbnail || listing.boostVideoUrl || ""}
              alt={listing.title}
              className="relative z-[1] mx-auto block max-h-[min(62vh,520px)] w-full object-contain"
              onLoad={() => setLoading(false)}
              onError={() => { setVideoFailed(true); setLoading(false); }}
            />
          ) : (
            <video
              ref={videoRef}
              src={listing.boostVideoUrl ? toFetchableUrl(listing.boostVideoUrl) : undefined}
              autoPlay
              muted={muted}
              playsInline
              preload="auto"
              loop={false}
              onEnded={() => finish("complete")}
              onLoadedData={() => { setVideoFailed(false); setLoading(false); }}
              onError={() => { setVideoFailed(true); setLoading(false); }}
              className="relative z-[1] mx-auto block w-full"
              style={{
                maxHeight: "min(62vh, 520px)",
                objectFit: "contain",
                pointerEvents: "none",
              }}
              data-testid="video-boost-ad"
            />
          )}

          {loading && !videoFailed && (
            <div className="absolute inset-0 z-[2] flex items-center justify-center bg-black/40">
              <Loader2 className="h-8 w-8 animate-spin text-white" />
            </div>
          )}

          {videoFailed && (
            <button
              type="button"
              onClick={(e) => {
                if (isImageAd) finish("error");
                else retryVideo(e);
              }}
              className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-3 bg-black/70 text-white"
            >
              <span className="rounded-full border border-white/70 px-4 py-2 text-sm font-semibold">
                {isImageAd
                  ? t("boostAd.closeAd", "Fèmen anons")
                  : t("boostAd.retryVideo", "Eseye videyo a ankò")}
              </span>
              {!isImageAd && (
                <button
                  type="button"
                  className="text-xs underline opacity-80"
                  onClick={(e) => { e.stopPropagation(); finish("error"); }}
                >
                  {t("boostAd.skipOnError", "Kontinye san anons")}
                </button>
              )}
            </button>
          )}

          {/* Top chrome */}
          <div className="pointer-events-none absolute left-3 right-3 top-3 z-[4] flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="rounded bg-yellow-400 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-black">
                {t("boostAd.sponsored", "Sponsored")}
              </span>
              {listing.sellerName && (
                <span className="truncate text-xs font-semibold text-white" style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>
                  {listing.sellerName}
                </span>
              )}
            </div>

            <div className="pointer-events-auto flex items-center gap-2">
              {!isImageAd && (
                <button
                  type="button"
                  onClick={toggleMute}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white"
                  aria-label={muted ? "Unmute" : "Mute"}
                  data-testid="button-boost-mute"
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>
              )}
              {skipReady ? (
                <button
                  type="button"
                  onClick={handleSkip}
                  onPointerUp={handleSkip}
                  onTouchEnd={handleSkip}
                  className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-black shadow"
                  style={{ touchAction: "manipulation" }}
                  data-testid="button-boost-skip"
                >
                  {t("boostAd.skip", "Skip Ad")} <SkipForward className="h-3.5 w-3.5" />
                </button>
              ) : (
                <div
                  className="rounded-full bg-black/55 px-3 py-1.5 text-xs font-bold text-white"
                  data-testid="text-boost-skip-countdown"
                  aria-label={t("boostAd.skipIn", { seconds: countdown })}
                >
                  {t("boostAd.skipIn", { seconds: countdown, defaultValue: `Skip in ${countdown}s` })}
                </div>
              )}
            </div>
          </div>

          {showUnmute && !isImageAd && (
            <button
              type="button"
              onClick={toggleMute}
              className="absolute left-1/2 top-1/2 z-[4] flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-sm font-semibold text-white"
              data-testid="button-boost-unmute-hint"
            >
              <Volume2 className="h-4 w-4" />
              {t("tr.tapForSound", "Unmute")}
            </button>
          )}

          {!isImageAd && (
            <div className="absolute bottom-0 left-0 right-0 z-[4] h-1 bg-white/20" aria-hidden>
              <div className="h-full bg-white" style={{ width: `${videoPct}%` }} />
            </div>
          )}
        </div>

        {/* Bottom CTA bar */}
        <div
          data-testid="boost-controls-bar"
          className="bg-[#0f1c3f] px-4 pt-3"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 12px), 12px)", touchAction: "manipulation" }}
        >
          {(!isVideoOnly || hasExternalCta) && (
            <button
              type="button"
              onClick={handleCta}
              onTouchEnd={(e) => { e.preventDefault(); handleCta(e); }}
              className="flex w-full items-center justify-between gap-3 rounded-xl bg-[#2563eb] px-4 py-3 font-bold text-white shadow-lg transition active:scale-[0.98]"
              data-testid="button-boost-view-listing"
            >
              <div className="flex min-w-0 items-center gap-3">
                {listing.thumbnail && (
                  <img src={listing.thumbnail} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                )}
                <div className="min-w-0 text-left">
                  <div className="truncate text-sm font-bold">{listing.title}</div>
                  {listing.price > 0 && (
                    <div className="text-xs opacity-90">${listing.price.toFixed(2)}</div>
                  )}
                </div>
              </div>
              <span className="shrink-0 text-sm whitespace-nowrap">{ctaLabel} →</span>
            </button>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}
