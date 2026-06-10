/**
 * CLEAN VIDEO PLAYER COMPONENT (Rebuilt)
 *
 * Production-grade, mobile-first video player.
 * Works on: iPhone Safari, Android Chrome, Desktop Chrome/Firefox/Safari.
 *
 * Features:
 *   - Automatic moov-atom fix via toFetchableVideoUrl (no black screen)
 *   - playsInline required for iOS Safari
 *   - Stall detection + auto-recovery
 *   - Error recovery with retry
 *   - Loading skeleton
 *   - Poster / thumbnail support
 *   - Proper aspect ratio (portrait=cover, landscape=contain)
 *   - Mute/unmute with session persistence
 *   - Responsive (fills container)
 *   - Exclusive playback: starting one player automatically pauses all others
 */
import { useRef, useState, useEffect, useCallback, forwardRef } from "react";
import { Play, Pause, Volume2, VolumeX, AlertCircle, Loader2 } from "lucide-react";
import { toFetchableVideoUrl, toVideoPosterUrl } from "@/lib/videoUrl";
import { cn } from "@/lib/utils";

// ── Audio unlock helpers (shared across all players on the page) ──────────────

const AUDIO_KEY = "flexa_audio_unlocked";

function isAudioUnlocked(): boolean {
  try { return localStorage.getItem(AUDIO_KEY) === "1"; } catch { return false; }
}
function setAudioUnlocked(v: boolean): void {
  try {
    localStorage.setItem(AUDIO_KEY, v ? "1" : "0");
    window.dispatchEvent(new CustomEvent("flexa:audio-unlocked", { detail: v }));
  } catch { }
}

// ── Exclusive-playback event ───────────────────────────────────────────────────
//
// When any VideoPlayer starts playing it fires "flexa:video-playing" carrying
// its own unique id.  Every OTHER mounted VideoPlayer hears the event and
// pauses itself.  This guarantees at most one video plays at a time without
// any shared global state or prop drilling.

let _playerSeq = 0;
function nextPlayerId(): string {
  return `flexa-vp-${++_playerSeq}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface VideoPlayerProps {
  src: string | null | undefined;
  /** Optional manual poster. If omitted, auto-derived from Cloudinary URL. */
  poster?: string | null;
  /** Auto-play when mounted (default: false) */
  autoPlay?: boolean;
  /** Loop video (default: false) */
  loop?: boolean;
  /** Start muted (default: respects session state) */
  muted?: boolean;
  /** Show controls bar (default: true) */
  controls?: boolean;
  /** Tailwind class for the outer container */
  className?: string;
  /** Called when video starts playing */
  onPlay?: () => void;
  /** Called when video pauses */
  onPause?: () => void;
  /** Called when video ends */
  onEnded?: () => void;
  /** Called with error message if playback fails */
  onError?: (msg: string) => void;
  /** preload strategy (default: "metadata") */
  preload?: "auto" | "metadata" | "none";
  /** For feed use: is this the active (currently visible) card? */
  isActive?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

const VideoPlayer = forwardRef<HTMLVideoElement, VideoPlayerProps>(
  (
    {
      src,
      poster,
      autoPlay = false,
      loop = false,
      muted: mutedProp,
      controls = true,
      className,
      onPlay,
      onPause,
      onEnded,
      onError,
      preload = "metadata",
      isActive,
    },
    forwardedRef,
  ) => {
    const internalRef = useRef<HTMLVideoElement | null>(null);
    const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const retryCountRef = useRef(0);
    // Stable unique id for this player instance — never changes after mount.
    const playerIdRef = useRef<string>(nextPlayerId());
    const MAX_RETRIES = 3;

    const [playing, setPlaying] = useState(false);
    const [loading, setLoading] = useState(true);
    const [errored, setErrored] = useState(false);
    const [muted, setMuted] = useState(mutedProp ?? !isAudioUnlocked());
    const [isLandscape, setIsLandscape] = useState(false);

    const videoUrl = toFetchableVideoUrl(src);
    const autoPoster = poster ?? toVideoPosterUrl(src) ?? undefined;

    // Sync external muted prop
    useEffect(() => {
      if (mutedProp !== undefined) setMuted(mutedProp);
    }, [mutedProp]);

    // Sync audio-unlocked events from other players
    useEffect(() => {
      const handler = (e: Event) => {
        const unlocked = (e as CustomEvent<boolean>).detail;
        setMuted(!unlocked);
        if (internalRef.current) internalRef.current.muted = !unlocked;
      };
      window.addEventListener("flexa:audio-unlocked", handler);
      return () => window.removeEventListener("flexa:audio-unlocked", handler);
    }, []);

    // Exclusive playback: pause THIS player when another one starts playing.
    useEffect(() => {
      const myId = playerIdRef.current;
      const handler = (e: Event) => {
        const activeId = (e as CustomEvent<string>).detail;
        if (activeId === myId) return; // I fired this event — ignore
        const el = internalRef.current;
        if (el && !el.paused) {
          el.pause();
        }
      };
      window.addEventListener("flexa:video-playing", handler);
      return () => window.removeEventListener("flexa:video-playing", handler);
    }, []);

    // Auto-play when isActive changes (feed use case)
    useEffect(() => {
      const el = internalRef.current;
      if (!el || isActive === undefined) return;
      if (isActive) {
        el.play().catch(() => {});
      } else {
        el.pause();
      }
    }, [isActive]);

    // Stall recovery
    const handleStall = useCallback(() => {
      const el = internalRef.current;
      if (!el || el.paused) return;
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
      stallTimerRef.current = setTimeout(() => {
        const v = internalRef.current;
        if (!v || v.paused || v.readyState >= 3) return;
        const t = v.currentTime;
        v.load();
        v.currentTime = t;
        v.play().catch(() => {});
      }, 3000);
    }, []);

    // Error recovery
    const handleError = useCallback(() => {
      const el = internalRef.current;
      if (!el) return;
      retryCountRef.current += 1;
      if (retryCountRef.current <= MAX_RETRIES) {
        setTimeout(() => {
          const v = internalRef.current;
          if (!v) return;
          v.load();
          v.play().catch(() => {});
        }, 1500 * retryCountRef.current);
      } else {
        setErrored(true);
        onError?.("Video failed to load. Please check your connection.");
      }
    }, [onError]);

    const handleRetry = useCallback(() => {
      const el = internalRef.current;
      if (!el) return;
      retryCountRef.current = 0;
      setErrored(false);
      setLoading(true);
      el.load();
      el.play().catch(() => {});
    }, []);

    const togglePlay = useCallback(() => {
      const el = internalRef.current;
      if (!el) return;
      if (el.paused) { el.play().catch(() => {}); }
      else { el.pause(); }
    }, []);

    const toggleMute = useCallback(() => {
      const newMuted = !muted;
      setMuted(newMuted);
      setAudioUnlocked(!newMuted);
      if (internalRef.current) internalRef.current.muted = newMuted;
    }, [muted]);

    // Provide ref to both internal and forwarded ref
    const setRef = useCallback(
      (el: HTMLVideoElement | null) => {
        internalRef.current = el;
        if (typeof forwardedRef === "function") forwardedRef(el);
        else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLVideoElement | null>).current = el;
      },
      [forwardedRef],
    );

    if (!videoUrl) {
      return (
        <div
          className={cn(
            "flex items-center justify-center bg-zinc-900 rounded-lg aspect-video",
            className,
          )}
        >
          <p className="text-white/40 text-sm">No video</p>
        </div>
      );
    }

    return (
      <div className={cn("relative bg-black overflow-hidden", className)}>
        {/* ── Video element ── */}
        <video
          ref={setRef}
          src={videoUrl}
          poster={autoPoster}
          autoPlay={autoPlay}
          loop={loop}
          playsInline            /* iOS Safari: play inline (not fullscreen) */
          preload={preload}
          crossOrigin="anonymous"
          className={cn(
            "w-full h-full",
            isLandscape ? "object-contain" : "object-cover",
          )}
          style={{ willChange: "transform", transform: "translateZ(0)" }}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            setIsLandscape(v.videoWidth > v.videoHeight);
            setLoading(false);
          }}
          onCanPlay={() => setLoading(false)}
          onPlay={() => {
            setPlaying(true);
            // Notify all other mounted players to pause themselves.
            window.dispatchEvent(
              new CustomEvent("flexa:video-playing", { detail: playerIdRef.current }),
            );
            onPlay?.();
          }}
          onPause={() => { setPlaying(false); onPause?.(); }}
          onEnded={() => { setPlaying(false); onEnded?.(); }}
          onStalled={handleStall}
          onWaiting={handleStall}
          onError={handleError}
          onLoadStart={() => { setLoading(true); setErrored(false); }}
        />

        {/* ── Loading skeleton ── */}
        {loading && !errored && (
          <div className="absolute inset-0 flex items-center justify-center bg-zinc-900">
            {autoPoster ? (
              <img
                src={autoPoster}
                alt=""
                className="absolute inset-0 w-full h-full object-cover opacity-60"
              />
            ) : null}
            <div className="relative z-10 bg-black/40 backdrop-blur-sm rounded-full p-4">
              <Loader2 className="h-8 w-8 text-white animate-spin" />
            </div>
          </div>
        )}

        {/* ── Error state ── */}
        {errored && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-zinc-950 gap-3">
            <AlertCircle className="h-10 w-10 text-red-400" />
            <p className="text-white/60 text-sm text-center px-4">
              Video failed to load
            </p>
            <button
              type="button"
              onClick={handleRetry}
              className="bg-primary text-white text-sm font-bold px-4 py-2 rounded-lg active:scale-95 transition-transform"
            >
              Retry
            </button>
          </div>
        )}

        {/* ── Controls bar ── */}
        {controls && !errored && (
          <div
            className="absolute bottom-0 inset-x-0 flex items-center gap-3 px-3 py-2"
            style={{
              background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%)",
            }}
          >
            {/* Play/Pause */}
            <button
              type="button"
              onClick={togglePlay}
              className="text-white hover:scale-110 transition-transform active:scale-95"
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? (
                <Pause className="h-6 w-6 fill-white" />
              ) : (
                <Play className="h-6 w-6 fill-white" />
              )}
            </button>

            <div className="flex-1" />

            {/* Mute/Unmute */}
            <button
              type="button"
              onClick={toggleMute}
              className="text-white hover:scale-110 transition-transform active:scale-95"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? (
                <VolumeX className="h-5 w-5" />
              ) : (
                <Volume2 className="h-5 w-5" />
              )}
            </button>
          </div>
        )}

        {/* ── Pause overlay ── */}
        {!playing && !loading && !errored && controls && (
          <div
            className="absolute inset-0 flex items-center justify-center cursor-pointer"
            onClick={togglePlay}
          >
            <div className="bg-black/30 backdrop-blur-sm rounded-full p-4 pointer-events-none">
              <Play className="h-10 w-10 text-white fill-white drop-shadow-lg" />
            </div>
          </div>
        )}
      </div>
    );
  },
);

VideoPlayer.displayName = "VideoPlayer";
export default VideoPlayer;
