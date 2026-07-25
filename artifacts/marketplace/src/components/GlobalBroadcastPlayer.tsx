/**
 * GlobalBroadcastPlayer
 *
 * Lives in the App layout — never unmounts while a broadcast is active.
 * Behaviour by route:
 *   /tv page  → hidden (FlexaTV shows a placeholder + this player is
 *               repositioned to fill it via CSS)
 *   elsewhere → floating mini-player (bottom-right, above bottom nav)
 *
 * The iframe / <video> is ONE instance shared across navigation so audio
 * never stops when the user browses other pages.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { X, Maximize2, Pause, Play, Radio } from "lucide-react";
import { useBroadcast } from "@/contexts/broadcast";
import { cn } from "@/lib/utils";

const YT_PARAMS = "autoplay=1&rel=0&modestbranding=1&controls=0&disablekb=1&playsinline=1";

function buildEmbedUrl(videoUrl: string | null, videoKey: string | null): { url: string; isDirect: boolean } | null {
  if (videoUrl) {
    try {
      const u = new URL(videoUrl);
      if (u.hostname.includes("youtu.be")) {
        const id = u.pathname.slice(1).split("?")[0];
        return { url: `https://www.youtube.com/embed/${id}?${YT_PARAMS}`, isDirect: false };
      }
      if (u.hostname.includes("youtube.com")) {
        const live = u.pathname.match(/\/live\/([^/?]+)/);
        if (live) return { url: `https://www.youtube.com/embed/${live[1]}?${YT_PARAMS}`, isDirect: false };
        const v = u.searchParams.get("v");
        if (v) return { url: `https://www.youtube.com/embed/${v}?${YT_PARAMS}`, isDirect: false };
      }
      const vm = videoUrl.match(/vimeo\.com\/(\d+)/);
      if (vm) return { url: `https://player.vimeo.com/video/${vm[1]}?autoplay=1&background=1`, isDirect: false };
    } catch { /* fall through */ }
    return { url: videoUrl, isDirect: true };
  }
  if (videoKey) return { url: `/api/storage/objects/${videoKey}`, isDirect: true };
  return null;
}

export default function GlobalBroadcastPlayer() {
  const bs = useBroadcast();
  const [location, navigate] = useLocation();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [dismissed, setDismissed] = useState(false);
  const [prevBsState, setPrevBsState] = useState(bs.state);

  // Hide on both viewer /tv and admin /admin/tv — those pages have their own full player
  const isOnTVPage = location === "/tv" || location === "/admin/tv";
  const isActive = bs.state === "playing" || bs.state === "paused";

  // Reset dismissed when a new broadcast starts
  useEffect(() => {
    if (prevBsState === "stopped" && (bs.state === "playing" || bs.state === "paused")) {
      setDismissed(false);
    }
    setPrevBsState(bs.state);
  }, [bs.state]); // eslint-disable-line

  // Media Session API — shows title + controls on iOS lock screen
  useEffect(() => {
    if (!isActive || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: bs.programTitle ?? "Flexa TV",
      artist: "Flexa Market",
      artwork: [{ src: "/flexa-tv-logo.png", sizes: "512x512", type: "image/png" }],
    });
  }, [isActive, bs.programTitle]);

  const goToTV = useCallback(() => { navigate("/tv"); }, [navigate]);
  const stopAndDismiss = useCallback(() => setDismissed(true), []);

  // Don't render if: stopped, dismissed, or on the TV page (TV page handles it)
  if (!isActive || dismissed || isOnTVPage) return null;

  const embed = buildEmbedUrl(bs.videoUrl, bs.videoKey);

  return (
    <div
      ref={wrapperRef}
      className={cn(
        "fixed z-[8000] shadow-2xl rounded-2xl overflow-hidden border border-violet-500/60",
        "bg-black flex flex-col",
        // Floating mini-player — bottom-right, above the bottom nav bar (~68px)
        "bottom-[76px] right-3 w-[220px]"
      )}
      style={{ aspectRatio: "16/9" }}
    >
      {/* Paused overlay */}
      {bs.state === "paused" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 gap-1">
          <img src="/flexa-tv-logo.png" alt="Flexa TV" className="w-12 h-12 object-contain opacity-70" />
          <div className="flex items-center gap-1 text-white text-[10px]">
            <Pause size={10} className="text-red-400" /> Sispann…
          </div>
        </div>
      )}

      {/* Click-blocker (viewers can't interact with iframe) */}
      <div className="absolute inset-0 z-10 cursor-pointer" onClick={goToTV} />

      {/* Video / iframe */}
      {embed ? (
        embed.isDirect ? (
          <video
            ref={videoRef}
            src={embed.url}
            autoPlay
            playsInline
            className="w-full h-full object-contain"
          />
        ) : (
          <iframe
            src={embed.url}
            className="w-full h-full"
            allow="autoplay; fullscreen; picture-in-picture"
            allowFullScreen
            title={bs.programTitle ?? "Flexa TV"}
            style={{ border: "none" }}
          />
        )
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <img src="/flexa-tv-logo.png" alt="Flexa TV" className="w-12 h-12 object-contain opacity-50" />
        </div>
      )}

      {/* Top bar: title + close + expand */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-2 py-1 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-0.5 text-[9px] bg-red-600 text-white px-1 py-0.5 rounded font-bold animate-pulse">
            <Radio size={7} /> LIVE
          </span>
          <p className="text-white text-[10px] font-semibold truncate max-w-[90px]">{bs.programTitle ?? "Flexa TV"}</p>
        </div>
        <div className="flex gap-1 pointer-events-auto">
          <button
            onClick={goToTV}
            className="bg-black/60 rounded-full p-1 text-white hover:bg-black/90"
            title="Ouvri Flexa TV"
          >
            <Maximize2 size={10} />
          </button>
          <button
            onClick={stopAndDismiss}
            className="bg-black/60 rounded-full p-1 text-white hover:bg-black/90"
            title="Fèmen"
          >
            <X size={10} />
          </button>
        </div>
      </div>
    </div>
  );
}
