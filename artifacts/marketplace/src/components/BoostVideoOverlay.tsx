import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Volume2, VolumeX, X } from "lucide-react";

/**
 * Sponsored-video overlay — production autoplay + smart-sound logic.
 *
 * Sound strategy (browser-policy aware):
 *  1. Attempt play WITH sound (unmuted).
 *  2. If browser blocks → fall back to muted autoplay (required by most
 *     mobile browsers until the user has interacted with the page).
 *  3. While muted, listen for ANY user interaction (scroll, touch, pointer)
 *     and unmute automatically on the first one.
 *  4. If even muted autoplay fails → show "Tap to play" overlay.
 *
 * User preference is persisted in sessionStorage so it survives route
 * changes within the same session but resets on a fresh visit.
 *
 * Frequency is managed via localStorage timestamp in Layout.tsx.
 *
 * iOS/Android fix: The native video compositing layer intercepts pointer
 * events on mobile browsers, silently swallowing button taps. All interactive
 * UI is placed in a separate z-[110] container with pointer-events-none on
 * the container and pointer-events-auto on individual buttons. The video
 * element itself gets pointer-events: none so it never intercepts UI taps.
 */

const SKIP_AFTER_SEC  = 10;
const AD_INTERVAL_MS  = 5 * 60_000;
const STORAGE_KEY     = "flexamarket_boost_last_shown";
const MUTE_PREF_KEY   = "flexamarket_boost_muted";

// ─── Public helpers ──────────────────────────────────────────────────────────
export function shouldShowBoostAd(): boolean {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return true;
    return Date.now() - Number(raw) >= AD_INTERVAL_MS;
  } catch { return true; }
}

export function markBoostAdShown(): void {
  try { localStorage.setItem(STORAGE_KEY, String(Date.now())); } catch { /* private mode */ }
}

// ─── URL helper ─────────────────────────────────────────────────────────────
function toFetchableUrl(stored: string): string {
  if (/^https?:\/\//i.test(stored)) return stored;
  const trimmed = stored.startsWith("/objects/")
    ? stored.slice("/objects/".length)
    : stored;
  return `/api/storage/objects/${trimmed}`;
}

// ─── Saved mute preference (session-scoped) ──────────────────────────────────
function getSavedMute(): boolean | null {
  try {
    const v = sessionStorage.getItem(MUTE_PREF_KEY);
    return v === null ? null : v === "1";
  } catch { return null; }
}

function saveMutePref(muted: boolean): void {
  try { sessionStorage.setItem(MUTE_PREF_KEY, muted ? "1" : "0"); } catch { /* ignore */ }
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface BoostListing {
  id: number;
  title: string;
  price: number;
  thumbnail: string | null;
  boostVideoUrl: string;
  sellerName: string | null;
  boostCtaType: string | null;
  boostExternalLink: string | null;
  boostWhatsappNumber: string | null;
  boostCtaText: string | null;
}

interface Props {
  listing: BoostListing;
  onClose: () => void;
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function BoostVideoOverlay({ listing, onClose }: Props) {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const videoRef  = useRef<HTMLVideoElement | null>(null);
  const interactionBound = useRef(false);

  // Always start with sound ON — ignore any previously saved mute preference
  const [muted, setMuted]     = useState<boolean>(false);
  const [countdown, setCountdown] = useState(SKIP_AFTER_SEC);
  const skipReady = countdown === 0;

  // ── Countdown ticker ──────────────────────────────────────────────────────
  useEffect(() => {
    if (countdown === 0) return;
    const id = window.setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { window.clearInterval(id); return 0; }
        return c - 1;
      });
    }, 1_000);
    return () => window.clearInterval(id);
  }, []); // run once

  // ── Unmute on first user interaction (when forced-muted by browser) ───────
  const bindInteractionUnmute = useCallback(() => {
    if (interactionBound.current) return;
    interactionBound.current = true;

    const tryUnmute = () => {
      const vid = videoRef.current;
      if (!vid) return;
      // Always unmute on first interaction — sound is mandatory for boost ads
      vid.muted = false;
      setMuted(false);
      removeListeners();
    };

    const removeListeners = () => {
      window.removeEventListener("scroll",      tryUnmute, { capture: true });
      window.removeEventListener("touchstart",  tryUnmute, { capture: true });
      window.removeEventListener("pointerdown", tryUnmute, { capture: true });
      window.removeEventListener("keydown",     tryUnmute, { capture: true });
    };

    window.addEventListener("scroll",      tryUnmute, { capture: true, once: true, passive: true });
    window.addEventListener("touchstart",  tryUnmute, { capture: true, once: true, passive: true });
    window.addEventListener("pointerdown", tryUnmute, { capture: true, once: true, passive: true });
    window.addEventListener("keydown",     tryUnmute, { capture: true, once: true });
  }, []);

  // ── Smart autoplay on mount ───────────────────────────────────────────────
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    let cancelled = false;

    // Native app WebView: always start with sound on
    const isNativeApp = !!(typeof window !== "undefined" && (window as any).isNativeApp);

    const attemptPlay = async (withSound: boolean) => {
      vid.muted = !withSound;
      try {
        await vid.play();
        if (cancelled) return;
        setMuted(!withSound);
        if (!withSound && !isNativeApp) bindInteractionUnmute();
        // Native app: if we started muted (browser blocked), unmute immediately
        if (!withSound && isNativeApp) {
          vid.muted = false;
          setMuted(false);
        }
      } catch (err: any) {
        if (cancelled) return;
        if (withSound) {
          await attemptPlay(false);
        }
        // Muted autoplay also blocked — video stays paused (browser restriction)
      }
    };

    // Always try with sound — boost ads must never start muted
    attemptPlay(true);
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── IntersectionObserver: pause when hidden, resume when visible ──────────
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) { vid.play().catch(() => {}); }
        else { vid.pause(); }
      },
      { threshold: 0.3 }
    );
    observer.observe(vid);
    return () => observer.disconnect();
  }, []);

  // ── Manual mute toggle ────────────────────────────────────────────────────
  const toggleMute = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    const vid = videoRef.current;
    if (!vid) return;
    const next = !muted;
    vid.muted = next;
    setMuted(next);
    saveMutePref(next);
  }, [muted]);


  // ── Skip ──────────────────────────────────────────────────────────────────
  const handleSkip = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    videoRef.current?.pause();
    onClose();
  }, [onClose]);

  // ── CTA ───────────────────────────────────────────────────────────────────
  const handleViewListing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    videoRef.current?.pause();
    const ctaType = listing.boostCtaType;
    if (ctaType === "link" && listing.boostExternalLink) {
      window.open(listing.boostExternalLink, "_blank", "noopener,noreferrer");
      onClose();
    } else if (ctaType === "whatsapp" && listing.boostWhatsappNumber) {
      const num = listing.boostWhatsappNumber.replace(/\D/g, "");
      window.open(`https://wa.me/${num}`, "_blank", "noopener,noreferrer");
      onClose();
    } else {
      setLocation(`/listings/${listing.id}?buy=1`);
      onClose();
    }
  }, [listing, onClose, setLocation]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={t("boostAd.sponsored")}
      data-testid="boost-video-overlay"
    >
      {/* ── Video ─────────────────────────────────────────────────────────────
          pointer-events: none is CRITICAL on iOS/Android — without it the
          native video layer intercepts all touch events and buttons above/
          below it become unclickable. Play/pause is handled by the
          transparent overlay button in the UI layer below. */}
      <video
        ref={videoRef}
        src={toFetchableUrl(listing.boostVideoUrl)}
        autoPlay
        muted={muted}
        playsInline
        preload="auto"
        loop={false}
        onEnded={onClose}
        className="max-h-[80vh] max-w-[90vw] rounded-lg shadow-2xl"
        data-testid="video-boost-ad"
        style={{ willChange: "transform", pointerEvents: "none" }}
      />

      {/* ── Interactive UI layer ───────────────────────────────────────────────
          This div sits ABOVE the video at z-[110] (> video stacking layer).
          pointer-events-none on the container, pointer-events-auto on each
          interactive element, prevents ghost-click issues while ensuring every
          tap reaches the intended button. */}
      <div
        className="absolute inset-0 z-[110] pointer-events-none flex flex-col"
        aria-hidden="false"
      >
        {/* Top row: sponsored badge only — no interactive elements to avoid status-bar collision */}
        <div
          className="flex items-start px-4 gap-2"
          style={{ paddingTop: "max(env(safe-area-inset-top, 16px), 56px)" }}
        >
          <div className="flex items-center gap-2">
            <span className="bg-yellow-400 text-black text-xs font-bold uppercase px-2 py-1 rounded">
              {t("boostAd.sponsored")}
            </span>
            {listing.sellerName && (
              <span
                className="text-white text-xs font-medium"
                style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
              >
                {t("boostAd.sponsoredBy", { name: listing.sellerName })}
              </span>
            )}
          </div>
        </div>

        {/* Middle spacer — no tap-to-pause, video plays uninterrupted */}
        <div className="flex-1" />

        {/* ── Bottom bar: CTA + sound + skip — absolutely pinned to bottom ── */}
        <div
          className="pointer-events-auto px-4 pb-4"
          style={{ paddingBottom: "max(env(safe-area-inset-bottom, 16px), 16px)" }}
        >
          {/* CTA button */}
          <button
            type="button"
            onClick={handleViewListing}
            onTouchEnd={e => { e.preventDefault(); handleViewListing(e); }}
            className="w-full bg-primary hover:bg-primary/90 active:scale-[0.98] text-primary-foreground font-bold py-3 px-4 rounded-xl shadow-lg flex items-center justify-between gap-3 transition-all mb-3"
            data-testid="button-boost-view-listing"
          >
            <div className="flex items-center gap-3 min-w-0">
              {listing.thumbnail && (
                <img
                  src={listing.thumbnail}
                  alt=""
                  loading="eager"
                  className="h-10 w-10 rounded object-cover flex-shrink-0"
                />
              )}
              <div className="text-left min-w-0">
                <div className="text-sm font-bold truncate">{listing.title}</div>
                {listing.price > 0 && (
                  <div className="text-xs opacity-90">${listing.price.toFixed(2)}</div>
                )}
              </div>
            </div>
            <span className="text-sm whitespace-nowrap shrink-0">
              {listing.boostCtaType === "link"
                ? <>{t("boostAd.visitLink")} →</>
                : listing.boostCtaType === "whatsapp"
                  ? <>{t("boostAd.chatWhatsApp")} →</>
                  : <>{t("boostAd.viewListing")} →</>}
            </span>
          </button>

          {/* Sound + Skip in one row below CTA */}
          <div className="flex items-center justify-between">
            {/* Sound toggle */}
            <button
              type="button"
              onClick={toggleMute}
              onTouchEnd={e => { e.preventDefault(); toggleMute(e); }}
              className="bg-black/60 text-white rounded-full p-2 hover:bg-black/80 active:scale-95 transition-all"
              aria-label={muted ? t("boostAd.unmute") : t("boostAd.mute")}
              data-testid="button-boost-unmute"
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>

            {/* Skip / countdown */}
            {skipReady ? (
              <button
                type="button"
                onClick={handleSkip}
                onTouchEnd={e => { e.preventDefault(); handleSkip(e); }}
                className="bg-white text-black rounded-full px-4 py-2 text-sm font-bold hover:bg-white/90 active:scale-95 flex items-center gap-1 transition-all"
                data-testid="button-boost-skip"
              >
                {t("boostAd.skip")} <X className="h-4 w-4" />
              </button>
            ) : (
              <div
                className="relative bg-black/60 rounded-full w-10 h-10 flex items-center justify-center"
                data-testid="text-boost-skip-countdown"
                aria-label={t("boostAd.skipIn", { seconds: countdown })}
              >
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 40 40">
                  <circle cx="20" cy="20" r="17" fill="none" stroke="white" strokeOpacity="0.2" strokeWidth="2.5" />
                  <circle
                    cx="20" cy="20" r="17"
                    fill="none"
                    stroke="white"
                    strokeWidth="2.5"
                    strokeDasharray={`${2 * Math.PI * 17}`}
                    strokeDashoffset={`${2 * Math.PI * 17 * (1 - countdown / SKIP_AFTER_SEC)}`}
                    strokeLinecap="round"
                    style={{ transition: "stroke-dashoffset 1s linear" }}
                  />
                </svg>
                <span className="text-white text-xs font-bold relative z-10">{countdown}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
