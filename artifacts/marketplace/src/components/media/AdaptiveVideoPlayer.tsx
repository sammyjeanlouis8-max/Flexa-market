import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  src: string;
  poster?: string | null;
  className?: string;
  /** Max height for the player shell (px or CSS length). */
  maxHeight?: number | string;
  muted?: boolean;
  controls?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  "data-testid"?: string;
};

function clampRatio(w: number, h: number): number {
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return 16 / 9;
  return w / h;
}

/**
 * Reusable adaptive video player.
 * Matches the container to the video's intrinsic display aspect ratio
 * (9:16, 16:9, 1:1, 4:3, 3:4, 21:9, etc.) without stretch/crop by default.
 */
export function AdaptiveVideoPlayer({
  src,
  poster,
  className,
  maxHeight = 420,
  muted = true,
  controls = true,
  autoPlay = false,
  loop = false,
  "data-testid": testId = "adaptive-video-player",
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ratio, setRatio] = useState(16 / 9);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [durationLabel, setDurationLabel] = useState<string | null>(null);

  useEffect(() => {
    setReady(false);
    setFailed(false);
    setPlaying(false);
    setDurationLabel(null);
  }, [src]);

  const onMeta = () => {
    const el = videoRef.current;
    if (!el) return;
    const w = el.videoWidth;
    const h = el.videoHeight;
    setRatio(clampRatio(w, h));
    if (Number.isFinite(el.duration) && el.duration > 0) {
      const s = Math.round(el.duration);
      const m = Math.floor(s / 60);
      const r = s % 60;
      setDurationLabel(`${m}:${String(r).padStart(2, "0")}`);
    }
    setReady(true);
  };

  const toggle = () => {
    const el = videoRef.current;
    if (!el || failed) return;
    if (el.paused) {
      void el.play().then(() => setPlaying(true)).catch(() => setFailed(true));
    } else {
      el.pause();
      setPlaying(false);
    }
  };

  const replay = () => {
    const el = videoRef.current;
    if (!el) return;
    el.currentTime = 0;
    void el.play().then(() => setPlaying(true)).catch(() => setFailed(true));
  };

  const maxH = typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight;

  return (
    <div
      className={cn("avp-shell", className)}
      data-testid={testId}
      style={{
        aspectRatio: String(ratio),
        maxHeight: maxH,
        width: "100%",
        background: "#0f172a",
        borderRadius: 14,
        overflow: "hidden",
        position: "relative",
      }}
    >
      {!ready && !failed && (
        <div className="absolute inset-0 grid place-items-center text-white/70 z-[1]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      )}
      {failed ? (
        <div className="absolute inset-0 grid place-items-center text-white/80 text-sm px-4 text-center z-[1]">
          Video could not be played.
          <button type="button" className="mt-2 underline text-xs" onClick={() => { setFailed(false); videoRef.current?.load(); }}>
            Retry
          </button>
        </div>
      ) : null}
      <video
        ref={videoRef}
        src={src}
        poster={poster ?? undefined}
        playsInline
        muted={muted}
        controls={controls}
        autoPlay={autoPlay}
        loop={loop}
        preload="metadata"
        onLoadedMetadata={onMeta}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onError={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-contain bg-black"
        style={{ objectFit: "contain" }}
      />
      {!controls && ready && !failed && (
        <div className="absolute inset-0 flex items-center justify-center z-[2]">
          <button
            type="button"
            onClick={toggle}
            className="h-12 w-12 rounded-full bg-black/55 text-white grid place-items-center"
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 fill-current ml-0.5" />}
          </button>
        </div>
      )}
      {durationLabel && (
        <span className="absolute bottom-2 right-2 z-[2] rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
          {durationLabel}
        </span>
      )}
      {ready && !failed && (
        <button
          type="button"
          onClick={replay}
          className="absolute bottom-2 left-2 z-[2] h-8 w-8 rounded-full bg-black/55 text-white grid place-items-center"
          aria-label="Replay"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
