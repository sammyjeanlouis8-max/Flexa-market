import { useCallback, useEffect, useRef, useState } from "react";
import { Play } from "lucide-react";
import { captureVideoPosterFrame } from "@/lib/videoPoster";

interface PromoVideoPosterProps {
  videoUrl: string | null;
  thumbnailUrl: string | null;
  title: string;
  className?: string;
}

export default function PromoVideoPoster({
  videoUrl,
  thumbnailUrl,
  title,
  className = "",
}: PromoVideoPosterProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const captureStartedRef = useRef(false);
  const frameCallbackRef = useRef<number | null>(null);
  const captureTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [shouldCapture, setShouldCapture] = useState(false);
  const [storedPoster, setStoredPoster] = useState(thumbnailUrl);
  const [capturedPoster, setCapturedPoster] = useState<string | null>(null);
  const posterUrl = storedPoster ?? capturedPoster;

  useEffect(() => {
    setStoredPoster(thumbnailUrl);
    setCapturedPoster(null);
    captureStartedRef.current = false;
  }, [thumbnailUrl, videoUrl]);

  useEffect(() => {
    if (posterUrl || !videoUrl) return;
    const root = rootRef.current;
    if (!root || !("IntersectionObserver" in window)) {
      setShouldCapture(true);
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        setShouldCapture(true);
        observer.disconnect();
      },
      { rootMargin: "160px" },
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [posterUrl, videoUrl]);

  const capture = useCallback((video: HTMLVideoElement) => {
    const frame = captureVideoPosterFrame(video, 320, 568);
    if (!frame) return false;
    if (captureTimeoutRef.current) {
      clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = null;
    }
    setCapturedPoster(frame);
    video.pause();
    return true;
  }, []);

  const startCapture = useCallback((video: HTMLVideoElement) => {
    if (captureStartedRef.current || posterUrl) return;
    captureStartedRef.current = true;
    video.muted = true;
    captureTimeoutRef.current = setTimeout(() => {
      const frameAwareVideo = video as HTMLVideoElement & {
        cancelVideoFrameCallback?: (id: number) => void;
      };
      if (frameAwareVideo.cancelVideoFrameCallback && frameCallbackRef.current !== null) {
        frameAwareVideo.cancelVideoFrameCallback(frameCallbackRef.current);
      }
      frameCallbackRef.current = null;
      video.pause();
    }, 5_000);

    video.play()
      .then(() => {
        const frameAwareVideo = video as HTMLVideoElement & {
          requestVideoFrameCallback?: (callback: () => void) => number;
          cancelVideoFrameCallback?: (id: number) => void;
        };
        if (frameAwareVideo.requestVideoFrameCallback) {
          frameCallbackRef.current = frameAwareVideo.requestVideoFrameCallback(() => {
            frameCallbackRef.current = null;
            capture(video);
          });
          return;
        }
        requestAnimationFrame(() => requestAnimationFrame(() => capture(video)));
      })
      .catch(() => {
        if (captureTimeoutRef.current) {
          clearTimeout(captureTimeoutRef.current);
          captureTimeoutRef.current = null;
        }
        video.pause();
      });
  }, [capture, posterUrl]);

  useEffect(() => {
    return () => {
      const video = videoRef.current as (HTMLVideoElement & {
        cancelVideoFrameCallback?: (id: number) => void;
      }) | null;
      video?.pause();
      if (video?.cancelVideoFrameCallback && frameCallbackRef.current !== null) {
        video.cancelVideoFrameCallback(frameCallbackRef.current);
      }
      if (captureTimeoutRef.current) {
        clearTimeout(captureTimeoutRef.current);
        captureTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <div ref={rootRef} className={`absolute inset-0 overflow-hidden bg-zinc-950 ${className}`}>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center"
        style={{
          background:
            "radial-gradient(circle at 30% 20%, rgba(249,115,22,0.55), transparent 42%), linear-gradient(145deg, #431407 0%, #111827 52%, #020617 100%)",
        }}
        aria-hidden="true"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-white/15 shadow-2xl backdrop-blur-md">
          <Play className="h-5 w-5 fill-white text-white" />
        </span>
        <span className="line-clamp-2 text-xs font-bold text-white/75">{title}</span>
        <span className="text-[9px] font-black uppercase tracking-[0.24em] text-primary">
          Flexa Video
        </span>
      </div>

      {posterUrl && (
        <img
          src={posterUrl}
          alt={title}
          loading="lazy"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => {
            setStoredPoster(null);
            setCapturedPoster(null);
          }}
          data-testid="img-promo-poster"
        />
      )}

      {!posterUrl && videoUrl && shouldCapture && (
        <video
          ref={videoRef}
          src={videoUrl}
          muted
          autoPlay
          playsInline
          preload="auto"
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          onLoadedMetadata={(event) => startCapture(event.currentTarget)}
          onLoadedData={(event) => {
            if (!capture(event.currentTarget)) startCapture(event.currentTarget);
          }}
          onCanPlay={(event) => capture(event.currentTarget)}
          onPlaying={(event) => capture(event.currentTarget)}
          onError={() => {
            captureStartedRef.current = true;
            videoRef.current?.pause();
          }}
        />
      )}
    </div>
  );
}