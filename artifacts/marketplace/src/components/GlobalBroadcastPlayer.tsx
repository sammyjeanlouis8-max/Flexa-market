/**
 * GlobalBroadcastPlayer
 *
 * ONE iframe instance that never unmounts while a broadcast is active.
 * Prevents video restarts when viewers navigate away and return.
 *
 * Behaviour by route:
 *   /tv        → fixed overlay exactly covering #broadcast-player-slot.
 *               Tracks position via setInterval(80ms). Includes all UI
 *               (LIVE badge, power button, 🔊 son, ⛶ fullscreen, paused overlay).
 *   /admin/tv  → hidden 1×1 px so the broadcast doesn't restart.
 *   elsewhere  → floating mini-player (bottom-right, above bottom nav).
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { X, Maximize2, Pause, Radio, Play, Volume2 } from "lucide-react";
import { useBroadcast } from "@/contexts/broadcast";
import { cn } from "@/lib/utils";

// controls=1 required on iOS Safari — controls=0 causes black-screen rendering bug
// enablejsapi=1 lets us send postMessage to trigger play after mount
const YT_PARAMS = "autoplay=1&rel=0&modestbranding=1&controls=1&disablekb=0&playsinline=1&enablejsapi=1&origin=" + encodeURIComponent(typeof window !== "undefined" ? window.location.origin : "https://flexamarket.com");

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
      if (videoUrl.includes("archive.org/embed/")) {
        const sep = videoUrl.includes("?") ? "&" : "?";
        return { url: `${videoUrl}${sep}autoplay=1&start=0`, isDirect: false };
      }
      if (videoUrl.includes("dailymotion.com/embed/")) {
        const sep = videoUrl.includes("?") ? "&" : "?";
        return { url: videoUrl.includes("autoplay=1") ? videoUrl : `${videoUrl}${sep}autoplay=1`, isDirect: false };
      }
    } catch { /* fall through */ }
    return { url: videoUrl, isDirect: true };
  }
  if (videoKey) return { url: `/api/storage/objects/${videoKey}`, isDirect: true };
  return null;
}

// Unmute + set full volume + play — call only inside a user-gesture handler
function ytUnmuteAndPlay(iframeEl: HTMLIFrameElement | null) {
  if (!iframeEl?.contentWindow) return;
  const send = (func: string, args: unknown = "") => {
    try { iframeEl.contentWindow!.postMessage(JSON.stringify({ event: "command", func, args }), "*"); } catch { /* cross-origin */ }
  };
  send("unMute");
  send("setVolume", [100]);
  send("playVideo");
}

export default function GlobalBroadcastPlayer() {
  const bs = useBroadcast();
  const { dismissed, setDismissed } = bs;
  const [location, navigate] = useLocation();
  const [slotRect, setSlotRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // embedKey: incrementing it forces React to remount the iframe (auto-reload)
  const [embedKey, setEmbedKey] = useState(0);
  const iframeRef  = useRef<HTMLIFrameElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const isOnViewerTV = location === "/tv";
  // startsWith covers /admin/tv, /admin/tv/programs/new, /admin/tv/programs/:id/edit, etc.
  const isOnAdminTV  = location.startsWith("/admin/tv") || location.startsWith("/admin");
  const isActive = bs.state === "playing" || bs.state === "paused";

  // ── Slot tracking: poll every 80 ms — catches React DOM changes immediately ──
  useEffect(() => {
    if (!isOnViewerTV || !isActive) { setSlotRect(null); return; }
    let lastKey = "";
    const measure = () => {
      const slot = document.getElementById("broadcast-player-slot");
      if (!slot) {
        if (lastKey !== "null") { lastKey = "null"; setSlotRect(null); }
        return;
      }
      const r = slot.getBoundingClientRect();
      const key = `${r.top.toFixed(1)},${r.left.toFixed(1)},${r.width.toFixed(1)},${r.height.toFixed(1)}`;
      if (key !== lastKey) { lastKey = key; setSlotRect({ top: r.top, left: r.left, width: r.width, height: r.height }); }
    };
    measure();
    const id = setInterval(measure, 80);
    return () => clearInterval(id);
  }, [isOnViewerTV, isActive]);

  // ── Fullscreen listener ───────────────────────────────────────────────────────
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    document.addEventListener("webkitfullscreenchange", h);
    return () => { document.removeEventListener("fullscreenchange", h); document.removeEventListener("webkitfullscreenchange", h); };
  }, []);

  // ── Auto-reload: if YouTube shows "Encodage en cours" (unstarted) after 10 s,
  // remount the iframe by bumping embedKey. Retries until the video plays. ──────
  useEffect(() => {
    if (!isActive) return;
    let playing = false;
    const onMsg = (e: MessageEvent) => {
      try {
        const d = typeof e.data === "string" ? JSON.parse(e.data) : e.data;
        // YouTube IFrame API v3 state 1 = playing
        if (d?.event === "onStateChange"  && d?.info === 1) playing = true;
        if (d?.event === "infoDelivery"   && d?.info?.playerState === 1) playing = true;
      } catch { /* ignore */ }
    };
    window.addEventListener("message", onMsg);
    const timer = setTimeout(() => {
      if (!playing) setEmbedKey(k => k + 1); // remount iframe → reload stream
    }, 10_000);
    return () => { window.removeEventListener("message", onMsg); clearTimeout(timer); };
  }, [isActive, bs.videoUrl, bs.videoKey, embedKey]); // embedKey in deps → retry loop

  // ── Media Session API — iOS lock-screen controls ──────────────────────────────
  useEffect(() => {
    if (!isActive || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: bs.programTitle ?? "Flexa TV",
      artist: "Flexa Market",
      artwork: [{ src: "/flexa-tv-logo.png", sizes: "512x512", type: "image/png" }],
    });
  }, [isActive, bs.programTitle]);

  const goToTV = useCallback(() => navigate("/tv"), [navigate]);

  // ── Fullscreen handler ────────────────────────────────────────────────────────
  const goFullscreen = useCallback(async () => {
    if (isFullscreen) {
      try { await (document.exitFullscreen?.() ?? (document as any).webkitExitFullscreen?.()); } catch { /* ignore */ }
      return;
    }
    // Try wrapper first, then iframe
    const el = wrapperRef.current ?? iframeRef.current;
    if (!el) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen();
    } catch { /* ignore */ }
  }, [isFullscreen]);

  // ── Early exits ───────────────────────────────────────────────────────────────
  if (!isActive || dismissed) return null;

  const embed = buildEmbedUrl(bs.videoUrl, bs.videoKey);

  // Admin: keep the iframe alive but invisible
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

  // ── The raw video element ─────────────────────────────────────────────────────
  const videoEl = embed ? (
    embed.isDirect ? (
      <video
        src={embed.url}
        autoPlay
        playsInline
        className="w-full h-full object-contain"
        style={{ borderRadius: "12px" } as React.CSSProperties}
      />
    ) : (
      <iframe
        key={embedKey}
        ref={iframeRef}
        src={embed.url}
        className="w-full h-full"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        allowFullScreen
        title={bs.programTitle ?? "Flexa TV"}
        style={{ border: "none", borderRadius: "12px" } as React.CSSProperties}
      />
    )
  ) : (
    <div className="w-full h-full flex items-center justify-center">
      <img src="/flexa-tv-logo.png" alt="Flexa TV" className="w-20 h-20 object-contain opacity-50" />
    </div>
  );

  // ── Full player UI (video + all overlays) ─────────────────────────────────────
  const fullPlayerUI = (mini = false) => (
    <div ref={wrapperRef} className="relative w-full h-full">
      {videoEl}

      {/* Paused overlay */}
      {bs.state === "paused" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 gap-4" style={{ borderRadius: "12px" }}>
          <img src="/flexa-tv-logo.png" alt="Flexa TV" className="w-20 h-20 object-contain opacity-80" />
          <div className="flex items-center gap-2 text-white">
            <Pause size={18} className="text-red-400" />
            <p className="text-sm font-semibold">Transmisyon an sispann…</p>
          </div>
        </div>
      )}

      {/* Top bar — LIVE badge + power button */}
      <div className="absolute top-0 inset-x-0 z-30 flex items-start justify-between px-2 pt-2 pointer-events-none">
        <span className="inline-flex items-center gap-1 text-[10px] bg-red-600 text-white px-2 py-1 rounded-full font-bold animate-pulse shadow-lg">
          <Radio size={9} /> LIVE
        </span>
        {!mini && (
          <button
            className="pointer-events-auto w-8 h-8 rounded-full bg-black/60 hover:bg-black/90 flex items-center justify-center text-white/70 hover:text-white transition-colors"
            title="Étein TV"
            onClick={() => setDismissed(true)}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M12 3v6" /><path d="M6.3 5.7A8 8 0 1 0 17.7 5.7" />
            </svg>
          </button>
        )}
      </div>

      {/* Bottom control bar — 🔊 Son + ⛶ Fullscreen */}
      {!mini && (
        <div
          className="absolute bottom-0 inset-x-0 z-30 flex items-center justify-end gap-2 px-2 pb-2"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, transparent 100%)", borderRadius: "0 0 12px 12px" }}
        >
          {/* Unmute / Sound button — always visible, user taps to unmute on iOS */}
          <button
            onClick={() => ytUnmuteAndPlay(iframeRef.current)}
            className="flex items-center gap-1 bg-black/70 hover:bg-black/90 active:bg-red-700 text-white text-[11px] font-bold px-3 py-1.5 rounded-full transition-colors shadow-lg"
            title="Aktive son"
          >
            <Volume2 size={12} /> Son
          </button>
          {/* Fullscreen button */}
          <button
            onClick={goFullscreen}
            className="bg-black/70 hover:bg-black/90 active:bg-violet-700 text-white p-1.5 rounded-full transition-colors shadow-lg"
            title={isFullscreen ? "Soti fullscreen" : "Plein écran"}
          >
            <Maximize2 size={13} />
          </button>
        </div>
      )}
    </div>
  );

  // ── Slot mode: fixed overlay exactly covering the placeholder in /tv ──────────
  if (isOnViewerTV && slotRect) {
    const slotVisible =
      slotRect.top >= -10 &&
      slotRect.top + slotRect.height <= window.innerHeight + 10;

    if (slotVisible) {
      return (
        <div
          style={{
            position: "fixed",
            top:    slotRect.top    + "px",
            left:   slotRect.left   + "px",
            width:  slotRect.width  + "px",
            height: slotRect.height + "px",
            zIndex: 9000,
            background: "black",
            borderRadius: "12px",
            overflow: "hidden",
          }}
        >
          {fullPlayerUI(false)}
        </div>
      );
    }
  }

  // ── Mini-player: floating bottom-right on scroll / other pages ────────────────
  return (
    <div
      className={cn(
        "fixed z-[9000] shadow-2xl rounded-2xl overflow-hidden border border-violet-500/60 bg-black",
        "bottom-[76px] right-3 w-[220px]",
      )}
      style={{ aspectRatio: "16/9" }}
    >
      {/* Click anywhere → go to /tv */}
      <div className="absolute inset-0 z-10 cursor-pointer" onClick={goToTV} />

      {fullPlayerUI(true)}

      {/* Mini top bar override (shows title + close) */}
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
          <button onClick={goToTV} className="bg-black/60 rounded-full p-1 text-white hover:bg-black/90" title="Ouvri Flexa TV">
            <Maximize2 size={10} />
          </button>
          <button onClick={() => setDismissed(true)} className="bg-black/60 rounded-full p-1 text-white hover:bg-black/90" title="Fèmen">
            <X size={10} />
          </button>
        </div>
      </div>
    </div>
  );
}
