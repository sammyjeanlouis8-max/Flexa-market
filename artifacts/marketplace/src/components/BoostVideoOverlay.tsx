import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { isAudioUnlocked, setAudioUnlocked } from "@/lib/audioUnlocked";

/**
 * Video Booster overlay — floating player, no dark background.
 *
 * Layout: fixed top-of-screen card (video + controls).
 *   - No full-screen dark overlay: page content visible below the player.
 *   - Video plays at natural aspect ratio (object-contain).
 *   - Sound locked ON; browser-forced mute unmutes on first user interaction.
 *   - No pause: video plays uninterrupted until skip or end.
 *   - Skip/countdown always visible BELOW the video.
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
  if (/^https?:\/\//i.test(stored)) return stored;
  const trimmed = stored.startsWith("/objects/")
    ? stored.slice("/objects/".length)
    : stored;
  return `/api/storage/objects/${trimmed}`;
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
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [countdown, setCountdown] = useState(SKIP_AFTER_SEC);
  const skipReady = countdown === 0;
  const [soundLocked, setSoundLocked] = useState(false); // true = iOS forced muted start

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

  // ── Autoplay with sound ON ────────────────────────────────────────────────
  // Browsers forbid unmuted autoplay until the user has interacted with the page
  // at least once. We persist that unlock for the whole session (shared with the
  // video feed via @/lib/audioUnlocked), so after the very first tap ANYWHERE,
  // every following ad comes up with sound automatically — no "tap for sound"
  // prompt is shown again.
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    let cancelled = false;

    // Turn sound on, persist the unlock session-wide, and clear listeners.
    const unlockAudio = () => {
      const v = videoRef.current;
      if (v) { v.muted = false; v.play().catch(() => {}); }
      setSoundLocked(false);
      setAudioUnlocked(true);
      window.removeEventListener("touchstart",  unlockAudio, { capture: true });
      window.removeEventListener("pointerdown", unlockAudio, { capture: true });
      window.removeEventListener("click",       unlockAudio, { capture: true });
    };

    const attemptPlay = async (withSound: boolean) => {
      vid.muted = !withSound;
      try {
        await vid.play();
        if (cancelled) return;
        if (withSound) {
          // Sound is on — remember it so the next ad needs no gesture.
          setSoundLocked(false);
          setAudioUnlocked(true);
        } else {
          // Browser forced a muted start. Arm the first-gesture unlock so any
          // tap turns sound on. Only show the visible hint if audio has NEVER
          // been unlocked this session — once unlocked, later ads recover sound
          // silently with no repeated prompt.
          if (!isAudioUnlocked()) setSoundLocked(true);
          window.addEventListener("touchstart",  unlockAudio, { capture: true, once: true, passive: true });
          window.addEventListener("pointerdown", unlockAudio, { capture: true, once: true, passive: true });
          window.addEventListener("click",       unlockAudio, { capture: true, once: true });
        }
      } catch {
        if (cancelled) return;
        if (withSound) await attemptPlay(false); // graceful fallback to muted
      }
    };

    attemptPlay(true); // always try unmuted first

    // If audio gets unlocked elsewhere (e.g. the video feed) while this ad plays.
    const onUnlocked = (e: Event) => {
      if ((e as CustomEvent<boolean>).detail && videoRef.current) {
        videoRef.current.muted = false;
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
  const handleSkip = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    videoRef.current?.pause();
    onClose();
  }, [onClose]);

  // ── CTA ───────────────────────────────────────────────────────────────────
  const handleCta = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    e.preventDefault();
    videoRef.current?.pause();
    const type = listing.boostCtaType;
    if (type === "link" && listing.boostExternalLink) {
      window.open(listing.boostExternalLink, "_blank", "noopener,noreferrer");
      onClose();
    } else if (type === "whatsapp" && listing.boostWhatsappNumber) {
      window.open(`https://wa.me/${listing.boostWhatsappNumber.replace(/\D/g, "")}`, "_blank", "noopener,noreferrer");
      onClose();
    } else {
      setLocation(`/listings/${listing.id}?buy=1`);
      onClose();
    }
  }, [listing, onClose, setLocation]);

  // ── Render ────────────────────────────────────────────────────────────────
  // Split layout: video pinned to TOP, controls bar pinned to BOTTOM.
  // Marketplace content stays visible in the middle.
  return (
    <>
      {/* ── VIDEO — fixed top of screen ─────────────────────────────────── */}
      <div
        className="fixed top-0 left-0 right-0 z-[100]"
        style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        role="dialog"
        aria-modal="true"
        aria-label={t("boostAd.sponsored")}
        data-testid="boost-video-overlay"
      >
        <div className="relative w-full bg-black" style={{ maxHeight: "55vh", overflow: "hidden" }}>
          {/* pointer-events:none on video is CRITICAL for iOS tap handling */}
          <video
            ref={videoRef}
            src={toFetchableUrl(listing.boostVideoUrl)}
            autoPlay
            playsInline
            preload="auto"
            loop={false}
            onEnded={onClose}
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

          {/* SPONSORED badge — overlaid top-left on the video */}
          <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none">
            <span className="bg-yellow-400 text-black text-xs font-bold uppercase px-2 py-1 rounded">
              {t("boostAd.sponsored")}
            </span>
            {listing.sellerName && (
              <span
                className="text-white text-xs font-medium"
                style={{ textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
              >
                {t("boostAd.sponsoredBy", { name: listing.sellerName })}
              </span>
            )}
          </div>

          {/* Sound-locked hint — center of video, disappears on first touch */}
          {soundLocked && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-none"
              aria-live="polite"
            >
              <div
                className="flex items-center gap-2 bg-black/70 rounded-full px-4 py-2"
                style={{ animation: "pulse 1.8s ease-in-out infinite" }}
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5 text-white fill-current">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
                </svg>
                <span className="text-white text-sm font-semibold">{t("tr.tapForSound")}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── CONTROLS BAR — fixed bottom of screen ───────────────────────── */}
      {/* CTA first, then Skip/countdown below — both pinned to bottom */}
      <div
        className="fixed bottom-0 left-0 right-0 z-[100] bg-gray-900 px-4 pt-3"
        style={{ paddingBottom: "max(env(safe-area-inset-bottom, 12px), 12px)" }}
      >
        {/* CTA button */}
        <button
          type="button"
          onClick={handleCta}
          onTouchEnd={e => { e.preventDefault(); handleCta(e); }}
          className="w-full bg-primary hover:bg-primary/90 active:scale-[0.98] text-primary-foreground font-bold py-3 px-4 rounded-xl shadow-lg flex items-center justify-between gap-3 transition-all"
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

        {/* Skip / countdown — right-aligned, below CTA */}
        <div className="flex items-center justify-end mt-3 mb-1">
          {skipReady ? (
            <button
              type="button"
              onClick={handleSkip}
              onTouchEnd={e => { e.preventDefault(); handleSkip(e); }}
              className="bg-white text-black rounded-full px-5 py-2 text-sm font-bold hover:bg-white/90 active:scale-95 flex items-center gap-1.5 transition-all"
              data-testid="button-boost-skip"
            >
              {t("boostAd.skip")} <X className="h-4 w-4" />
            </button>
          ) : (
            <div
              className="relative bg-white/20 rounded-full w-11 h-11 flex items-center justify-center"
              data-testid="text-boost-skip-countdown"
              aria-label={t("boostAd.skipIn", { seconds: countdown })}
            >
              <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 44 44">
                <circle cx="22" cy="22" r="19" fill="none" stroke="white" strokeOpacity="0.25" strokeWidth="2.5" />
                <circle
                  cx="22" cy="22" r="19"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeDasharray={`${2 * Math.PI * 19}`}
                  strokeDashoffset={`${2 * Math.PI * 19 * (1 - countdown / SKIP_AFTER_SEC)}`}
                  strokeLinecap="round"
                  style={{ transition: "stroke-dashoffset 1s linear" }}
                />
              </svg>
              <span className="text-white text-xs font-bold relative z-10">{countdown}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
