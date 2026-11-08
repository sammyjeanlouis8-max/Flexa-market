import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Pause, Play, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { captureVideoPosterFrame } from "@/lib/videoPoster";

export type AdaptiveVideoMeta = {
  width: number;
  height: number;
  duration: number;
  ratio: number;
};

type Props = {
  src: string;
  poster?: string | null;
  className?: string;
  /** Max height for the player frame (px or CSS length). */
  maxHeight?: number | string;
  /** Initial muted state. Defaults to false so Play includes audio (subject to browser rules). */
  muted?: boolean;
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  /** Show custom mute/unmute when native controls are off. */
  showMuteToggle?: boolean;
  onMeta?: (meta: AdaptiveVideoMeta) => void;
  /** Called when a clear first-frame poster is captured from the video. */
  onPoster?: (dataUrl: string) => void;
  "data-testid"?: string;
};

function clampRatio(w: number, h: number): number {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 16 / 9;
  return w / h;
}

function parseMaxHeightPx(maxHeight: number | string): number {
  if (typeof maxHeight === "number" && Number.isFinite(maxHeight)) return maxHeight;
  const m = String(maxHeight).match(/^([\d.]+)px$/i);
  if (m) return parseFloat(m[1]);
  return 420;
}

/**
 * Adaptive video player: container matches the video's intrinsic aspect ratio
 * (9:16, 16:9, 1:1, 4:5, 3:4, …) with object-fit:contain — no stretch/crop,
 * and no layout-generated black letterboxing when the frame matches the ratio.
 *
 * Mobile Safari often loads metadata without painting a frame (blank white box
 * + play button). We seek slightly and capture a JPEG poster so the thumbnail
 * is always visible after upload.
 */
export function AdaptiveVideoPlayer({
  src,
  poster,
  className,
  maxHeight = 420,
  muted: mutedProp = false,
  controls = true,
  autoPlay = false,
  loop = false,
  showMuteToggle = true,
  onMeta,
  onPoster,
  "data-testid": testId = "adaptive-video-player",
}: Props) {
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const primedSrcRef = useRef<string | null>(null);
  const primeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [ratio, setRatio] = useState(16 / 9);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [capturedPoster, setCapturedPoster] = useState<string | null>(null);
  // Autoplay policies require muted for autoplay; otherwise keep original audio available.
  const [muted, setMuted] = useState(autoPlay ? true : mutedProp);

  const displayPoster = poster || capturedPoster || null;

  useEffect(() => {
    setReady(false);
    setFailed(false);
    setPlaying(false);
    setCapturedPoster(null);
    primedSrcRef.current = null;
    if (primeTimerRef.current) {
      clearTimeout(primeTimerRef.current);
      primeTimerRef.current = null;
    }
    setMuted(autoPlay ? true : mutedProp);
    return () => {
      if (primeTimerRef.current) {
        clearTimeout(primeTimerRef.current);
        primeTimerRef.current = null;
      }
    };
  }, [src, mutedProp, autoPlay]);

  useEffect(() => {
    const el = videoRef.current;
    if (el) el.muted = muted;
  }, [muted]);

  const publishMeta = useCallback((el: HTMLVideoElement) => {
    const w = el.videoWidth;
    const h = el.videoHeight;
    const nextRatio = clampRatio(w, h);
    setRatio(nextRatio);
    onMeta?.({
      width: w,
      height: h,
      duration: Number.isFinite(el.duration) ? el.duration : 0,
      ratio: nextRatio,
    });
  }, [onMeta]);

  const takePoster = useCallback((el: HTMLVideoElement) => {
    const frame = captureVideoPosterFrame(el, 720, 1280);
    if (!frame) return false;
    setCapturedPoster(frame);
    onPoster?.(frame);
    return true;
  }, [onPoster]);

  const primeFirstFrame = useCallback((el: HTMLVideoElement) => {
    if (primedSrcRef.current === src) {
      setReady(true);
      return;
    }
    primedSrcRef.current = src;
    publishMeta(el);

    const finish = () => {
      takePoster(el);
      setReady(true);
    };

    // Already have decoded pixels (common for blob: previews).
    if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && takePoster(el)) {
      setReady(true);
      return;
    }

    const onSeeked = () => {
      el.removeEventListener("seeked", onSeeked);
      finish();
    };
    el.addEventListener("seeked", onSeeked);

    try {
      const duration = Number.isFinite(el.duration) ? el.duration : 0;
      const target = duration > 0.35 ? Math.min(0.2, duration * 0.05) : 0.001;
      // Force Safari/iOS to decode a visible frame instead of a blank poster box.
      el.currentTime = el.currentTime > 0 ? el.currentTime : target;
    } catch {
      el.removeEventListener("seeked", onSeeked);
      // Last resort: brief muted play to unlock a frame, then pause.
      const wasMuted = el.muted;
      el.muted = true;
      void el.play()
        .then(() => {
          el.pause();
          el.muted = wasMuted;
          finish();
        })
        .catch(() => {
          el.muted = wasMuted;
          setReady(true);
        });
    }

    // Safety: never leave the spinner forever if seeked never fires.
    if (primeTimerRef.current) clearTimeout(primeTimerRef.current);
    primeTimerRef.current = setTimeout(() => {
      el.removeEventListener("seeked", onSeeked);
      takePoster(el);
      setReady(true);
    }, 4000);
  }, [publishMeta, src, takePoster]);

  const onLoadedMeta = () => {
    const el = videoRef.current;
    if (!el) return;
    primeFirstFrame(el);
  };

  const togglePlay = () => {
    const el = videoRef.current;
    if (!el || failed) return;
    if (el.paused) {
      void el.play().then(() => setPlaying(true)).catch(() => setFailed(true));
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const toggleMute = () => {
    setMuted((m) => !m);
  };

  const maxHpx = parseMaxHeightPx(maxHeight);
  const frameStyle = useMemo(() => {
    // Size the frame to the video ratio so object-fit:contain fills it (no letterbox).
    const width = `min(100%, ${maxHpx * ratio}px)`;
    return {
      aspectRatio: String(ratio),
      maxHeight: `${maxHpx}px`,
      width,
      maxWidth: "100%",
    } as const;
  }, [ratio, maxHpx]);

  return (
    <div
      className={cn("avp-shell", className)}
      data-testid={testId}
      style={{
        width: "100%",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        background: "transparent",
      }}
    >
      <div
        className="avp-frame"
        style={{
          ...frameStyle,
          position: "relative",
          borderRadius: 16,
          overflow: "hidden",
          background: "#0f172a",
        }}
      >
        {/* Still frame behind the video — covers blank Safari/iOS metadata-only paint. */}
        {displayPoster ? (
          <img
            src={displayPoster}
            alt=""
            draggable={false}
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ objectFit: "contain", zIndex: 0, background: "#0f172a" }}
            data-testid="adaptive-video-poster"
          />
        ) : null}

        {!ready && !failed && (
          <div className="absolute inset-0 grid place-items-center text-violet-500/80 z-[2] bg-violet-50/40">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        )}
        {failed ? (
          <div className="absolute inset-0 grid place-items-center text-slate-700 text-sm px-4 text-center z-[2] bg-violet-50/80">
            {t("boost.videoDecodeFailed", { defaultValue: "Couldn't read that video. Try MP4, WebM, or MOV." })}
            <button
              type="button"
              className="mt-2 underline text-xs text-violet-700"
              onClick={() => {
                setFailed(false);
                primedSrcRef.current = null;
                videoRef.current?.load();
              }}
            >
              {t("errors.tryAgain", { defaultValue: "Try again" })}
            </button>
          </div>
        ) : null}
        <video
          ref={videoRef}
          src={src}
          poster={displayPoster ?? undefined}
          playsInline
          muted={muted}
          controls={controls}
          autoPlay={autoPlay}
          loop={loop}
          preload="auto"
          onLoadedMetadata={onLoadedMeta}
          onLoadedData={() => {
            const el = videoRef.current;
            if (!el) return;
            if (!capturedPoster && !poster) takePoster(el);
            setReady(true);
          }}
          onSeeked={() => {
            const el = videoRef.current;
            if (el && !capturedPoster && !poster) takePoster(el);
          }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full"
          style={{
            objectFit: "contain",
            // Transparent so the captured poster shows through until a real frame paints.
            background: "transparent",
            zIndex: 1,
          }}
        />
        {/* Custom overlays only when native controls are off — avoids overlap. */}
        {!controls && ready && !failed && (
          <>
            <button
              type="button"
              onClick={togglePlay}
              className="absolute inset-0 z-[2] grid place-items-center"
              aria-label={playing
                ? t("boostAd.pause", { defaultValue: "Pause" })
                : t("boostAd.play", { defaultValue: "Play" })}
            >
              <span className="h-12 w-12 rounded-full bg-black/45 text-white grid place-items-center backdrop-blur-sm">
                {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current ml-0.5" />}
              </span>
            </button>
            {showMuteToggle && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleMute();
                }}
                className="absolute top-2 right-2 z-[3] h-9 w-9 rounded-full bg-black/45 text-white grid place-items-center backdrop-blur-sm"
                aria-label={muted
                  ? t("boostAd.unmute", { defaultValue: "Unmute" })
                  : t("boostAd.mute", { defaultValue: "Mute" })}
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
