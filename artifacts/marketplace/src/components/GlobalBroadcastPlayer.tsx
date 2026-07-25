/**
 * GlobalBroadcastPlayer
 *
 * ONE iframe instance that never unmounts while a broadcast is active.
 * This prevents video restarts when viewers navigate away and return.
 *
 * Behaviour by route:
 *   /tv        → positioned as a fixed overlay exactly covering the
 *               #broadcast-player-slot placeholder div in FlexaTV.
 *               Tracks scroll + resize so it stays in sync.
 *   /admin/tv  → hidden (AdminTV has its own preview player).
 *   elsewhere  → floating mini-player (bottom-right, above bottom nav).
 */
import { useEffect, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { X, Maximize2, Pause, Radio } from "lucide-react";
import { useBroadcast } from "@/contexts/broadcast";
import { cn } from "@/lib/utils";

// controls=1 required on iOS Safari — controls=0 causes black-screen rendering bug
const YT_PARAMS = "autoplay=1&rel=0&modestbranding=1&controls=1&disablekb=0&playsinline=1";

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
  // dismissed / setDismissed now live in BroadcastContext so FlexaTV's
  // on/off button and this component share the same toggle state.
  const { dismissed, setDismissed } = bs;
  const [location, navigate] = useLocation();
  // Bounding rect of the #broadcast-player-slot div (updated on scroll/resize)
  const [slotRect, setSlotRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);

  const isOnViewerTV = location === "/tv";
  const isOnAdminTV  = location === "/admin/tv";
  const isActive = bs.state === "playing" || bs.state === "paused";

  // ── Slot tracking: keep the fixed overlay aligned with the placeholder div ──
  useEffect(() => {
    if (!isOnViewerTV || !isActive) { setSlotRect(null); return; }

    const measure = () => {
      const slot = document.getElementById("broadcast-player-slot");
      if (!slot) { setSlotRect(null); return; }
      const r = slot.getBoundingClientRect();
      setSlotRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };

    measure();
    const ro = new ResizeObserver(measure);
    const slot = document.getElementById("broadcast-player-slot");
    if (slot) ro.observe(slot);
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [isOnViewerTV, isActive]);

  // Media Session API — iOS lock screen controls
  useEffect(() => {
    if (!isActive || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: bs.programTitle ?? "Flexa TV",
      artist: "Flexa Market",
      artwork: [{ src: "/flexa-tv-logo.png", sizes: "512x512", type: "image/png" }],
    });
  }, [isActive, bs.programTitle]);

  const goToTV = useCallback(() => navigate("/tv"), [navigate]);

  // ── Early exits ──────────────────────────────────────────────────────────────
  if (!isActive || dismissed) return null;

  const embed = buildEmbedUrl(bs.videoUrl, bs.videoKey);

  // On /admin/tv: keep the iframe MOUNTED but invisible so it doesn't restart
  // when admin navigates to another page. Admin has their own preview player.
  if (isOnAdminTV) {
    return (
      <div style={{ position: "fixed", left: "-9999px", top: 0, width: "1px", height: "1px", opacity: 0, pointerEvents: "none", zIndex: -1 }}>
        {embed ? embed.isDirect
          ? <video src={embed.url} autoPlay playsInline muted style={{ width: 1, height: 1 }} />
          : <iframe src={embed.url} allow="autoplay; fullscreen; picture-in-picture" title="bg-admin" style={{ border: "none", width: 1, height: 1 }} />
        : null}
      </div>
    );
  }

  const videoContent = embed ? (
    embed.isDirect ? (
      <video
        src={embed.url}
        autoPlay
        playsInline
        className="w-full h-full object-contain"
        style={{ borderRadius: "12px", WebkitTransform: "translateZ(0)", transform: "translateZ(0)" } as any}
      />
    ) : (
      <iframe
        src={embed.url}
        className="w-full h-full"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        title={bs.programTitle ?? "Flexa TV"}
        style={{ border: "none", borderRadius: "12px", WebkitTransform: "translateZ(0)", transform: "translateZ(0)" } as any}
      />
    )
  ) : (
    <div className="w-full h-full flex items-center justify-center">
      <img src="/flexa-tv-logo.png" alt="Flexa TV" className="w-20 h-20 object-contain opacity-50" />
    </div>
  );

  // ── Slot mode: fixed overlay exactly covering the placeholder in /tv ─────────
  if (isOnViewerTV) {
    if (!slotRect) return null; // not measured yet — FlexaTV shows black placeholder
    return (
      <div
        style={{
          position: "fixed",
          top:    slotRect.top    + "px",
          left:   slotRect.left   + "px",
          width:  slotRect.width  + "px",
          height: slotRect.height + "px",
          zIndex: 8000,
          background: "black",
          // No overflow:hidden or borderRadius here — causes iOS Safari
          // black-screen bug on fixed elements containing video iframes.
          // Border-radius is applied on the iframe/video elements instead.
        }}
      >
        {videoContent}
      </div>
    );
  }

  // ── Mini-player mode: floating bottom-right on all other pages ───────────────
  return (
    <div
      className={cn(
        "fixed z-[8000] shadow-2xl rounded-2xl overflow-hidden border border-violet-500/60",
        "bg-black",
        "bottom-[76px] right-3 w-[220px]",
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

      {/* Click anywhere → go to /tv */}
      <div className="absolute inset-0 z-10 cursor-pointer" onClick={goToTV} />

      {videoContent}

      {/* Top bar: title + buttons */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-center justify-between px-2 py-1 bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
        <div className="flex items-center gap-1">
          <span className="inline-flex items-center gap-0.5 text-[9px] bg-red-600 text-white px-1 py-0.5 rounded font-bold animate-pulse">
            <Radio size={7} /> LIVE
          </span>
          <p className="text-white text-[10px] font-semibold truncate max-w-[90px]">
            {bs.programTitle ?? "Flexa TV"}
          </p>
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
            onClick={() => setDismissed(true)}
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
