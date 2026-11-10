import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import {
  isAudioUnlocked,
  setAudioUnlocked,
  isUserMutedPreference,
  setUserMutedPreference,
  preferUnmutedAutoplay,
} from "@/lib/audioUnlocked";
import { isNativeMobileApp } from "@/lib/nativeMobileApp";
import {
  buildPromoChatDraft,
  getPublicPromoVideoUrl,
  openWhatsAppWithPromoVideo,
  storePromoChatDraft,
} from "@/lib/promoVideoContact";
import {
  resolveBoostAdCtaLabel,
  resolveBoostAdSkipInLabel,
  resolveBoostAdSkipLabel,
} from "@/lib/boostAdControls";

/**
 * Video Booster overlay — floating player, no dark background.
 *
 * Layout: fixed top-of-screen player with in-frame controls.
 *   - No full-screen dark overlay: page content visible below the player.
 *   - Video plays at natural aspect ratio (object-contain).
 *   - Sound locked ON; browser-forced mute unmutes on first user interaction.
 *   - No pause: video plays uninterrupted until skip or end.
 *   - Message + Skip/countdown anchored INSIDE the video frame (no bottom banner).
 */

const SKIP_AFTER_SEC = 10;
const AD_INTERVAL_MS = 5 * 60_000;
const STORAGE_KEY    = "flexamarket_boost_last_shown";

// ─── Public helpers ───────────────────────────────────────────────────────────
export function shouldShowBoostAd(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    return Date.now() - Number(raw) >= AD_INTERVAL_MS;
  } catch { return true; }
}

export function markBoostAdShown(): void {
  try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch { /* private */ }
}

// ─── URL helper ──────────────────────────────────────────────────────────────
function toFetchableUrl(stored: string): string {
  const value = stored.trim();
  if (/^https?:\/\//i.test(value)) return value;
  // The boost API already resolves modern Wasabi assets to this same-origin,
  // Range-capable route. Rewriting it as an object-storage path turns
  // `/api/storage/video-stream?...` into a 404 and leaves iPhone with a black
  // player surface.
  if (value.startsWith("/api/")) return value;
  // Preserve non-storage same-origin paths. Only legacy `/objects/...` values
  // need converting to the object proxy below.
  if (value.startsWith("/") && !value.startsWith("/objects/")) return value;
  const trimmed = value.startsWith("/objects/")
    ? value.slice("/objects/".length)
    : value;
  return `/api/storage/objects/${trimmed}`;
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface BoostListing {
  id: number;
  title: string;
  price: number;
  thumbnail: string | null;
  boostVideoUrl: string | null;
  boostImageUrl?: string | null;
  adFormat?: "video" | "image" | string | null;
  sellerName: string | null;
  sellerId?: number | null;
  boostCtaType: string | null;
  boostExternalLink: string | null;
  boostWhatsappNumber: string | null;
  boostCtaText: string | null;
  /** "hidden" for video-only ghost listings — no product page exists */
  status?: string | null;
  isVideoOnly?: boolean;
}

function trackBoostEvent(listingId: number, type: "view" | "click" | "skip" | "video_view") {
  try {
    const tk = localStorage.getItem("flexamarket_token");
    void fetch("/api/booster/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(tk ? { Authorization: `Bearer ${tk}` } : {}),
      },
      body: JSON.stringify({ listingId, type }),
      keepalive: true,
    });
  } catch { /* non-critical */ }
}

interface Props {
  listing: BoostListing;
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function BoostVideoOverlay({ listing, onClose }: Props) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const skipHandledRef = useRef(false);
  const isImageAd =
    listing.adFormat === "image" ||
    (!listing.boostVideoUrl && !!listing.boostImageUrl);

  const [countdown, setCountdown] = useState(SKIP_AFTER_SEC);
  const skipReady = countdown === 0;
  const [soundLocked, setSoundLocked] = useState(false); // true = browser forced muted start
  const [muted, setMuted] = useState(
    () => isUserMutedPreference() ? true : !preferUnmutedAutoplay(isNativeMobileApp()),
  );
  const [videoPct, setVideoPct] = useState(0); // 0–100 for the progress bar
  const [videoFailed, setVideoFailed] = useState(false);

  useEffect(() => {
    trackBoostEvent(listing.id, isImageAd ? "view" : "video_view");
  }, [listing.id, isImageAd]);

  // ── Video progress bar ────────────────────────────────────────────────────
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onTime = () => {
      if (vid.duration && isFinite(vid.duration) && vid.duration > 0) {
        setVideoPct((vid.currentTime / vid.duration) * 100);
      }
    };
    vid.addEventListener("timeupdate", onTime);
    vid.addEventListener("loadedmetadata", onTime);
    return () => {
      vid.removeEventListener("timeupdate", onTime);
      vid.removeEventListener("loadedmetadata", onTime);
    };
  }, []);

  // ── Countdown — runs from mount, independent of play state ────────────────
  useEffect(() => {
    if (countdown === 0) return;
    const id = window.setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { window.clearInterval(id); return 0; }
        return c - 1;
      });
    }, 1_000);
    return () => window.clearInterval(id);
  }, []); // run once on mount

  // ── Autoplay with sound ON when the platform allows it ───────────────────
  // Prefer unmuted autoplay (native WebViews + prior session unlock). Browsers
  // that block unmuted play fall back to muted, then unlock on first gesture.
  // No microphone / recording permission is requested for playback.
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    let cancelled = false;

    // Turn sound on, persist the unlock session-wide, and clear listeners.
    const unlockAudio = () => {
      if (isUserMutedPreference()) return;
      const v = videoRef.current;
      if (v) { v.muted = false; setMuted(false); v.play().catch(() => {}); }
      setSoundLocked(false);
      setUserMutedPreference(false);
      setAudioUnlocked(true);
      window.removeEventListener("touchstart",  unlockAudio, { capture: true });
      window.removeEventListener("pointerdown", unlockAudio, { capture: true });
      window.removeEventListener("click",       unlockAudio, { capture: true });
    };

    const armGestureUnlock = () => {
      if (!isAudioUnlocked() && !isUserMutedPreference()) setSoundLocked(true);
      window.addEventListener("touchstart",  unlockAudio, { capture: true, once: true, passive: true });
      window.addEventListener("pointerdown", unlockAudio, { capture: true, once: true, passive: true });
      window.addEventListener("click",       unlockAudio, { capture: true, once: true });
    };

    const attemptPlay = async (withSound: boolean) => {
      vid.muted = !withSound;
      setMuted(!withSound);
      try {
        await vid.play();
        if (cancelled) return;
        if (withSound) {
          setSoundLocked(false);
          setAudioUnlocked(true);
        } else {
          armGestureUnlock();
        }
      } catch {
        if (cancelled) return;
        if (withSound) await attemptPlay(false); // graceful fallback to muted
      }
    };

    // Honor explicit mute; otherwise try unmuted first (Safari may reject → muted).
    if (isUserMutedPreference()) {
      void attemptPlay(false);
    } else {
      void attemptPlay(true);
    }

    // If audio gets unlocked elsewhere (e.g. the video feed) while this ad plays.
    const onUnlocked = (e: Event) => {
      if ((e as CustomEvent<boolean>).detail && videoRef.current) {
        videoRef.current.muted = false;
        setMuted(false);
        videoRef.current.play().catch(() => {});
        setSoundLocked(false);
      }
    };
    window.addEventListener("flexa:audio-unlocked", onUnlocked);

    return () => {
      cancelled = true;
      window.removeEventListener("flexa:audio-unlocked", onUnlocked);
      window.removeEventListener("touchstart",  unlockAudio, { capture: true });
      window.removeEventListener("pointerdown", unlockAudio, { capture: true });
      window.removeEventListener("click",       unlockAudio, { capture: true });
    };
  }, []);

  // ── Resume when scrolled back into view ───────────────────────────────────
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) vid.play().catch(() => {}); else vid.pause(); },
      { threshold: 0.3 }
    );
    obs.observe(vid);
    return () => obs.disconnect();
  }, []);

  // ── Skip ──────────────────────────────────────────────────────────────────
  const handleSkip = useCallback((e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (skipHandledRef.current) return;
    skipHandledRef.current = true;
    videoRef.current?.pause();
    trackBoostEvent(listing.id, "skip");
    onClose();
  }, [onClose, listing.id]);

  const toggleMute = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const vid = videoRef.current;
    const turnOn = muted;
    if (turnOn) {
      setUserMutedPreference(false);
      setAudioUnlocked(true);
      setSoundLocked(false);
      setMuted(false);
      if (vid) {
        vid.muted = false;
        vid.play().catch(() => {});
      }
    } else {
      setUserMutedPreference(true);
      setMuted(true);
      setSoundLocked(false);
      if (vid) vid.muted = true;
    }
  }, [muted]);

  const retryVideo = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const video = videoRef.current;
    if (!video) return;
    setVideoFailed(false);
    video.load();
    video.play().catch(() => setVideoFailed(true));
  }, []);

  // ── CTA ───────────────────────────────────────────────────────────────────
  // Video-only boosts (status="hidden") have no product page — never navigate
  // to /listings/:id for them unless CTA is buy_now on a real product.
  const isVideoOnly = listing.isVideoOnly || listing.status === "hidden";
  const ctaType = listing.boostCtaType;
  const hasCta =
    ctaType === "buy_now" && !isVideoOnly
    || ctaType === "message"
    || (ctaType === "whatsapp" && !!listing.boostWhatsappNumber)
    || (ctaType === "link" && !!listing.boostExternalLink)
    || (!ctaType && !isVideoOnly); // legacy: default view listing

  const handleCta = useCallback(async (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    videoRef.current?.pause();
    trackBoostEvent(listing.id, "click");
    const type = listing.boostCtaType;
    if (type === "none") {
      onClose();
      return;
    }
    if (type === "link" && listing.boostExternalLink) {
      window.open(listing.boostExternalLink, "_blank", "noopener,noreferrer");
      onClose();
      return;
    }
    if (type === "whatsapp" && listing.boostWhatsappNumber) {
      openWhatsAppWithPromoVideo({
        phone: listing.boostWhatsappNumber,
        videoId: listing.id,
        title: listing.title,
        origin: window.location.origin,
      });
      onClose();
      return;
    }
    if (type === "message" && listing.sellerId) {
      try {
        const token =
          localStorage.getItem("flexamarket_token")
          || localStorage.getItem("token")
          || sessionStorage.getItem("token");
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers.Authorization = `Bearer ${token}`;
        const response = await fetch("/api/conversations", {
          method: "POST",
          headers,
          body: JSON.stringify({
            listingId: listing.id,
            sellerId: listing.sellerId,
            source: "boost_ad",
          }),
        });
        if (response.ok) {
          const conversation = await response.json();
          const videoUrl = getPublicPromoVideoUrl(listing.id, window.location.origin);
          storePromoChatDraft(conversation.id, {
            text: buildPromoChatDraft({
              videoId: listing.id,
              title: listing.title,
              origin: window.location.origin,
            }),
            videoId: listing.id,
            videoTitle: listing.title ?? "",
            videoUrl,
            thumbnailUrl: listing.boostImageUrl
              ?? listing.thumbnail
              ?? null,
          });
          setLocation(`/messages/${conversation.id}?composeVideo=${listing.id}`);
          onClose();
          return;
        }
      } catch { /* fall through */ }
      setLocation(`/messages?listingId=${listing.id}&sellerId=${listing.sellerId}`);
      onClose();
      return;
    }
    if ((type === "buy_now" || !type) && !isVideoOnly) {
      setLocation(`/listings/${listing.id}?buy=1`);
      onClose();
      return;
    }
    onClose();
  }, [listing, onClose, setLocation, isVideoOnly]);

  const ctaLabel = resolveBoostAdCtaLabel({
    ctaType,
    customText: listing.boostCtaText,
    t,
  });
  const skipLabel = resolveBoostAdSkipLabel(t);
  const skipInLabel = resolveBoostAdSkipInLabel(t, countdown);
  const showInFrameCta = hasCta && ctaType !== "none";

  // ── Render ────────────────────────────────────────────────────────────────
  // Single fixed player at TOP. Message + Skip live INSIDE the video frame so
  // they scroll with the ad and never cover marketplace content below.
  // Escape app-shell's isolated stacking context so the player stays above
  // body-level bars and outside the shell's overflow clipping.
  return createPortal(
    <div
      className="fixed top-0 left-0 right-0 z-[100]"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
      role="dialog"
      aria-modal="true"
      aria-label={t("boostAd.sponsored")}
      data-testid="boost-video-overlay"
    >
      <div
        className="relative w-full bg-black"
        style={{ maxHeight: "55vh", overflow: "hidden" }}
        data-testid="boost-ad-player-frame"
      >
        {isImageAd ? (
          <img
            src={toFetchableUrl(listing.boostImageUrl || listing.thumbnail || "")}
            alt={listing.title}
            className="w-full"
            style={{ display: "block", maxHeight: "55vh", objectFit: "contain" }}
            data-testid="image-boost-ad"
          />
        ) : (
          <>
            {listing.thumbnail && (
              <img
                src={listing.thumbnail}
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full object-contain"
              />
            )}
            <video
              ref={videoRef}
              src={listing.boostVideoUrl ? toFetchableUrl(listing.boostVideoUrl) : undefined}
              autoPlay
              muted={muted}
              playsInline
              preload="auto"
              loop={false}
              onEnded={onClose}
              onLoadedData={() => setVideoFailed(false)}
              onError={() => setVideoFailed(true)}
              className="w-full"
              style={{
                display: "block",
                maxHeight: "55vh",
                objectFit: "contain",
                pointerEvents: "none",
                willChange: "transform",
              }}
              data-testid="video-boost-ad"
            />
            {videoFailed && (
              <button
                type="button"
                onClick={retryVideo}
                onTouchEnd={retryVideo}
                className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/65 text-white"
                aria-label={t("boostAd.retryVideo", "Eseye videyo a ankò")}
              >
                <span className="rounded-full border border-white/70 px-4 py-2 text-sm font-semibold">
                  {t("boostAd.retryVideo", "Eseye videyo a ankò")}
                </span>
              </button>
            )}
          </>
        )}

        {/* SPONSORED badge — overlaid top-left on the video */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 pointer-events-none max-w-[70%]">
          <span className="bg-yellow-400 text-black text-xs font-bold uppercase px-2 py-1 rounded">
            {t("boostAd.sponsored")}
          </span>
          {listing.sellerName && (
            <span
              className="text-white text-xs font-medium truncate"
              style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
            >
              {t("boostAd.sponsoredBy", { name: listing.sellerName })}
            </span>
          )}
        </div>

        {/* Mute / Unmute */}
        {!isImageAd && (
          <button
            type="button"
            onClick={toggleMute}
            onTouchEnd={toggleMute}
            className="absolute top-3 right-3 z-10 bg-black/60 text-white rounded-full px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 max-w-[42%]"
            data-testid="button-boost-mute"
            aria-label={muted ? t("boostAd.unmute", "Unmute") : t("boostAd.mute", "Mute")}
          >
            <span aria-hidden>{muted ? "🔇" : "🔊"}</span>
            <span className="truncate">
              {muted ? t("boostAd.unmute", "Unmute") : t("boostAd.mute", "Mute")}
            </span>
          </button>
        )}

        {/* Sound-locked hint — center of video, disappears on first touch */}
        {!isImageAd && soundLocked && (
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
            aria-live="polite"
          >
            <div
              className="flex items-center gap-2 bg-black/70 rounded-full px-4 py-2"
              style={{ animation: "pulse 1.8s ease-in-out infinite" }}
            >
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-current">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
              </svg>
              <span className="text-white text-sm font-semibold">{t("tr.tapForSound")}</span>
            </div>
          </div>
        )}

        {/* In-frame controls — same baseline above the progress strip */}
        <div
          data-testid="boost-controls-bar"
          className="absolute inset-x-0 bottom-0 z-20 pointer-events-none"
          style={{ touchAction: "manipulation" }}
        >
          <div className="flex items-end justify-between gap-2 px-2.5 pb-3 pt-8 bg-gradient-to-t from-black/55 via-black/15 to-transparent">
            {showInFrameCta ? (
              <button
                type="button"
                onClick={(e) => { void handleCta(e); }}
                onTouchEnd={(e) => { e.preventDefault(); void handleCta(e); }}
                className="pointer-events-auto min-h-11 max-w-[58%] shrink bg-[#2563eb] hover:bg-[#1d4ed8] active:scale-[0.98] text-white font-bold text-sm sm:text-[15px] leading-tight rounded-full px-3.5 py-2.5 shadow-lg transition-all"
                style={{ WebkitTapHighlightColor: "transparent" }}
                data-testid="button-boost-view-listing"
                aria-label={ctaLabel}
              >
                <span className="block truncate">{ctaLabel}</span>
              </button>
            ) : (
              <span className="min-w-0 flex-1" aria-hidden="true" />
            )}

            {/* Skip stays in the same bottom-right slot before and after countdown */}
            <div className="pointer-events-auto flex justify-end min-w-0 max-w-[48%] shrink-0">
              {skipReady ? (
                <button
                  type="button"
                  onClick={handleSkip}
                  onPointerUp={handleSkip}
                  onTouchEnd={handleSkip}
                  className="min-h-11 bg-white text-black rounded-full px-3.5 py-2.5 text-sm font-bold hover:bg-white/90 active:scale-95 flex items-center gap-1.5 shadow-lg transition-all max-w-full"
                  style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
                  data-testid="button-boost-skip"
                  aria-label={skipLabel}
                >
                  <span className="truncate">{skipLabel}</span>
                  <X className="h-4 w-4 shrink-0" aria-hidden="true" />
                </button>
              ) : (
                <div
                  className="min-h-11 bg-white/20 backdrop-blur-[2px] text-white rounded-full px-3.5 py-2.5 text-sm font-bold flex items-center justify-center shadow-md max-w-full"
                  data-testid="text-boost-skip-countdown"
                  aria-live="polite"
                  aria-label={skipInLabel}
                >
                  <span className="truncate">{skipInLabel}</span>
                </div>
              )}
            </div>
          </div>

          {/* Progress strip — below the control baseline */}
          {!isImageAd && (
            <div
              className="h-1 bg-white/20 pointer-events-none"
              aria-hidden="true"
            >
              <div
                className="h-full bg-white rounded-r-full transition-none"
                style={{ width: `${videoPct}%` }}
              />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
