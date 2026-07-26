/**
 * GlobalBroadcastPlayer
 *
 * ONE iframe that NEVER unmounts while a broadcast is active.
 * Navigating between pages only repositions it — the video never restarts.
 *
 * Modes (resolved in priority order):
 *   admin/*  → 1×1 px off-screen, invisible, no controls
 *   /tv      → fixed overlay covering #broadcast-player-slot (slot mode)
 *   other    → floating mini-player bottom-right (mini mode)
 *
 * DVR seek bar: YouTube dvr=1 param lets viewers scrub the live buffer.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { X, Maximize2, Pause, Radio, Volume2 } from "lucide-react";
import { useBroadcast } from "@/contexts/broadcast";
import { cn } from "@/lib/utils";

// YouTube embed params
// autoplay=1 — autoplays on all devices. iOS forces mute=1 for autoplay but the
// video still starts immediately. A tap-to-unmute overlay handles iOS audio policy.
// dvr=1      — enables DVR seek bar so viewers can scrub back in the live buffer.
const YT_PARAMS =
  "autoplay=1&dvr=1&rel=0&modestbranding=1&controls=1&disablekb=0&playsinline=1&enablejsapi=1&origin=" +
  encodeURIComponent(
    typeof window !== "undefined" ? window.location.origin : "https://flexamarket.com"
  );

function buildEmbedUrl(
  videoUrl: string | null,
  videoKey: string | null
): { url: string; isDirect: boolean } | null {
  if (videoUrl) {
    try {
      const u = new URL(videoUrl);
      if (u.hostname.includes("youtu.be")) {
        const id = u.pathname.slice(1).split("?")[0];
        return { url: `https://www.youtube.com/embed/${id}?${YT_PARAMS}`, isDirect: false };
      }
      if (u.hostname.includes("youtube.com")) {
        const live = u.pathname.match(/\/live\/([^/?]+)/);
        if (live)
          return { url: `https://www.youtube.com/embed/${live[1]}?${YT_PARAMS}`, isDirect: false };
        const v = u.searchParams.get("v");
        if (v) return { url: `https://www.youtube.com/embed/${v}?${YT_PARAMS}`, isDirect: false };
      }
      const vm = videoUrl.match(/vimeo\.com\/(\d+)/);
      if (vm)
        return {
          url: `https://player.vimeo.com/video/${vm[1]}?autoplay=1&background=1`,
          isDirect: false,
        };
      if (videoUrl.includes("archive.org/embed/")) {
        const sep = videoUrl.includes("?") ? "&" : "?";
        return { url: `${videoUrl}${sep}autoplay=1&start=0`, isDirect: false };
      }
      if (videoUrl.includes("dailymotion.com/embed/")) {
        const sep = videoUrl.includes("?") ? "&" : "?";
        return {
          url: videoUrl.includes("autoplay=1") ? videoUrl : `${videoUrl}${sep}autoplay=1`,
          isDirect: false,
        };
      }
    } catch { /* fall through */ }
    return { url: videoUrl, isDirect: true };
  }
  if (videoKey) return { url: `/api/storage/objects/${videoKey}`, isDirect: true };
  return null;
}

// Send postMessage command to YouTube iframe
function ytCmd(iframeEl: HTMLIFrameElement | null, func: string, args: unknown = "") {
  try {
    iframeEl?.contentWindow?.postMessage(JSON.stringify({ event: "command", func, args }), "*");
  } catch { /* cross-origin */ }
}

// Unmute + max volume + play — call ONLY inside a user-gesture handler
function ytUnmuteAndPlay(iframeEl: HTMLIFrameElement | null) {
  ytCmd(iframeEl, "unMute");
  ytCmd(iframeEl, "setVolume", [100]);
  ytCmd(iframeEl, "playVideo");
}

type SlotRect = { top: number; left: number; width: number; height: number };

// Mini-player dimensions
const MINI_W      = 264;
const MINI_H      = 148; // ≈ 16:9
const MINI_BOT    = 76;
const MINI_MARGIN = 12;

export default function GlobalBroadcastPlayer() {
  const bs = useBroadcast();
  const { dismissed, setDismissed } = bs;
  const [location, navigate] = useLocation();

  const [slotRect, setSlotRect] = useState<SlotRect | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // isMuted: true until user taps 🔊 overlay (iOS forces mute on autoplay)
  const [isMuted, setIsMuted] = useState(true);

  // ── Mini-player horizontal drag ──────────────────────────────────────────────
  const [miniLeft, setMiniLeft] = useState<number | null>(null);
  const miniLeftRef    = useRef<number | null>(null);
  const miniOverlayRef = useRef<HTMLDivElement>(null);
  // drag tracking — all mutable, no re-render during move
  const dragStartX    = useRef(0);
  const dragStartLeft = useRef(0);
  const dragging      = useRef(false);
  const wasDragRef    = useRef(false); // survives into onClick after touchEnd

  const resolvedMiniLeft = () =>
    miniLeftRef.current ??
    (typeof window !== "undefined" ? window.innerWidth - MINI_MARGIN - MINI_W : 0);

  const applyLeft = useCallback((left: number) => {
    miniLeftRef.current = left;
    if (wrapperRef.current) {
      wrapperRef.current.style.left  = left + "px";
      wrapperRef.current.style.right = "auto";
    }
    if (miniOverlayRef.current) {
      miniOverlayRef.current.style.left  = left + "px";
      miniOverlayRef.current.style.right = "auto";
    }
  }, []);

  const handleMiniTouchStart = useCallback((e: React.TouchEvent) => {
    dragging.current   = false;
    wasDragRef.current = false;
    dragStartX.current    = e.touches[0].clientX;
    dragStartLeft.current = resolvedMiniLeft();
  }, []);

  const handleMiniTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - dragStartX.current;
    if (!dragging.current && Math.abs(dx) > 5) dragging.current = true;
    if (!dragging.current) return;
    const w       = typeof window !== "undefined" ? window.innerWidth : 400;
    const maxLeft = w - MINI_MARGIN - MINI_W;
    applyLeft(Math.max(MINI_MARGIN, Math.min(maxLeft, dragStartLeft.current + dx)));
  }, [applyLeft]);

  const handleMiniTouchEnd = useCallback((_e: React.TouchEvent) => {
    if (!dragging.current) return;
    wasDragRef.current = true; // tell onClick to skip navigation
    dragging.current   = false;
    // Snap to nearest edge
    const w       = typeof window !== "undefined" ? window.innerWidth : 400;
    const cur     = miniLeftRef.current ?? (w - MINI_MARGIN - MINI_W);
    const snapped = cur + MINI_W / 2 < w / 2 ? MINI_MARGIN : w - MINI_MARGIN - MINI_W;
    applyLeft(snapped);
    setMiniLeft(snapped);
  }, [applyLeft]);

  const iframeRef  = useRef<HTMLIFrameElement>(null);
  const videoRef   = useRef<HTMLVideoElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const isOnViewerTV = location === "/tv";
  const isOnAdminTV  = location.startsWith("/admin");
  const isActive     = bs.state === "playing" || bs.state === "paused";

  // ── Slot tracking: poll every 80 ms ─────────────────────────────────────────
  useEffect(() => {
    if (!isOnViewerTV || !isActive) { setSlotRect(null); return; }
    let lastKey = "";
    const measure = () => {
      const slot = document.getElementById("broadcast-player-slot");
      if (!slot) { if (lastKey !== "null") { lastKey = "null"; setSlotRect(null); } return; }
      const r = slot.getBoundingClientRect();
      const key = `${r.top.toFixed(1)},${r.left.toFixed(1)},${r.width.toFixed(1)},${r.height.toFixed(1)}`;
      if (key !== lastKey) { lastKey = key; setSlotRect({ top: r.top, left: r.left, width: r.width, height: r.height }); }
    };
    measure();
    // 200ms is fast enough for smooth repositioning while being 2.5× lighter
    // than 80ms — reduces iOS Safari memory pressure from 750 to 300 updates/min.
    const id = setInterval(measure, 200);
    return () => clearInterval(id);
  }, [isOnViewerTV, isActive]);

  // ── Fullscreen change listener ───────────────────────────────────────────────
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    document.addEventListener("webkitfullscreenchange", h);
    return () => {
      document.removeEventListener("fullscreenchange", h);
      document.removeEventListener("webkitfullscreenchange", h);
    };
  }, []);

  // Reset muted overlay whenever broadcast changes (new video = needs new unmute tap)
  useEffect(() => { setIsMuted(true); }, [bs.videoUrl, bs.videoKey]);

  // Auto-reload removed — it caused infinite restart loops because embedKey was
  // in the dependency array and YouTube live streams don't reliably send playerState=1.

  // ── Media Session API (iOS lock-screen) ──────────────────────────────────────
  useEffect(() => {
    if (!isActive || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: bs.programTitle ?? "Flexa TV",
      artist: "Flexa Market",
      artwork: [{ src: "/flexa-tv-logo.png", sizes: "512x512", type: "image/png" }],
    });
  }, [isActive, bs.programTitle]);

  const goToTV = useCallback(() => navigate("/tv"), [navigate]);

  const goFullscreen = useCallback(async () => {
    if (isFullscreen) {
      try { await (document.exitFullscreen?.() ?? (document as any).webkitExitFullscreen?.()); } catch { /**/ }
      return;
    }
    const el = wrapperRef.current ?? iframeRef.current;
    if (!el) return;
    try {
      if (el.requestFullscreen) await el.requestFullscreen();
      else if ((el as any).webkitRequestFullscreen) await (el as any).webkitRequestFullscreen();
    } catch { /**/ }
  }, [isFullscreen]);

  // ── Nothing to render ────────────────────────────────────────────────────────
  if (!isActive || dismissed) return null;

  const embed = buildEmbedUrl(bs.videoUrl, bs.videoKey);

  // ── Compute iframe position ──────────────────────────────────────────────────
  // ONE iframe, never unmounted. Position/size changes via CSS only.
  const slotVisible =
    isOnViewerTV &&
    slotRect !== null &&
    slotRect.top >= -10 &&
    slotRect.top + slotRect.height <= window.innerHeight + 10;

  // Iframe container geometry
  const iframeStyle: React.CSSProperties = isOnAdminTV
    ? { position: "fixed", left: -9999, top: 0, width: 1, height: 1, opacity: 0, zIndex: -1, pointerEvents: "none" }
    : slotVisible
    ? {
        position: "fixed",
        top:    slotRect!.top    + "px",
        left:   slotRect!.left   + "px",
        width:  slotRect!.width  + "px",
        height: slotRect!.height + "px",
        zIndex: 9000,
        background: "black",
        borderRadius: "12px",
        overflow: "hidden",
      }
    : {
        // Mini player — left-positioned so drag works
        position: "fixed",
        bottom:  MINI_BOT + "px",
        left:    (miniLeft ?? (typeof window !== "undefined" ? window.innerWidth - MINI_MARGIN - MINI_W : 0)) + "px",
        width:   MINI_W + "px",
        height:  MINI_H + "px",
        zIndex: 9000,
        background: "black",
        borderRadius: "14px",
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
        border: "1.5px solid rgba(139,92,246,0.5)",
        touchAction: "none",
      };

  return (
    <>
      {/* ── Persistent iframe / video — NEVER unmounts ─────────────────────── */}
      <div ref={wrapperRef} style={iframeStyle}>
        {embed ? (
          embed.isDirect ? (
            <video
              ref={videoRef}
              src={embed.url}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
              style={{ borderRadius: "12px" }}
            />
          ) : (
            <iframe
              ref={iframeRef}
              src={embed.url}
              className="w-full h-full"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
              title={bs.programTitle ?? "Flexa TV"}
              style={{ border: "none", borderRadius: "12px" }}
            />
          )
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <img src="/flexa-tv-logo.png" alt="Flexa TV" className="w-16 h-16 object-contain opacity-40" />
          </div>
        )}

        {/* Paused overlay (slot mode only) */}
        {bs.state === "paused" && !isOnAdminTV && (slotVisible || !isOnViewerTV) && (
          <div
            className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 gap-3"
            style={{ borderRadius: "12px" }}
          >
            <img src="/flexa-tv-logo.png" alt="Flexa TV" className="w-16 h-16 object-contain opacity-80" />
            <div className="flex items-center gap-2 text-white">
              <Pause size={16} className="text-red-400" />
              <p className="text-sm font-semibold">Transmisyon an sispann…</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Slot-mode UI overlay (controls layered on top of iframe) ─────────── */}
      {slotVisible && !isOnAdminTV && (
        <div
          style={{
            position: "fixed",
            top:    slotRect!.top    + "px",
            left:   slotRect!.left   + "px",
            width:  slotRect!.width  + "px",
            height: slotRect!.height + "px",
            zIndex: 9001,
            pointerEvents: "none",
            borderRadius: "12px",
          }}
        >
          {/* Top bar: LIVE badge | ⛶ fullscreen | power off */}
          <div className="absolute top-0 inset-x-0 flex items-center justify-between px-2 pt-2 pointer-events-none">
            <span className="inline-flex items-center gap-1 text-[10px] bg-red-600 text-white px-2 py-1 rounded-full font-bold animate-pulse shadow-lg">
              <Radio size={9} /> LIVE
            </span>
            <div className="flex items-center gap-1 pointer-events-auto">
              {/* ⛶ Fullscreen */}
              <button
                className="bg-black/70 hover:bg-black/90 active:bg-violet-700 text-white p-1.5 rounded-full transition-colors shadow-lg"
                title={isFullscreen ? "Soti fullscreen" : "Plein écran"}
                onClick={goFullscreen}
              >
                <Maximize2 size={12} />
              </button>
              {/* ⏻ Power off */}
              <button
                className="w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                title="Étein TV"
                onClick={() => setDismissed(true)}
              >
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                  <path d="M12 3v6" /><path d="M6.3 5.7A8 8 0 1 0 17.7 5.7" />
                </svg>
              </button>
            </div>
          </div>

          {/* 🔊 Tap-to-unmute overlay — centered, pulsing, disappears after first tap.
               iOS forces mute on autoplay; this is the ONE required user gesture. */}
          {isMuted && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-auto"
              style={{ zIndex: 20, background: "rgba(0,0,0,0.35)" }}
            >
              <button
                onClick={() => {
                  ytUnmuteAndPlay(iframeRef.current);
                  setIsMuted(false);
                }}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                  background: "rgba(255,255,255,0.15)", backdropFilter: "blur(6px)",
                  border: "2px solid rgba(255,255,255,0.5)", borderRadius: 20,
                  padding: "18px 28px", cursor: "pointer",
                  animation: "pulse 1.8s ease-in-out infinite",
                }}
              >
                <Volume2 size={36} color="white" strokeWidth={1.8} />
                <span style={{ color: "white", fontWeight: 800, fontSize: 15, letterSpacing: 0.5 }}>
                  Tap pou son 🔊
                </span>
              </button>
            </div>
          )}
          {/* ↓ Bottom intentionally empty — native seek bar lives here */}
        </div>
      )}

      {/* ── Mini-player header overlay ────────────────────────────────────────── */}
      {!slotVisible && !isOnAdminTV && (
        <div
          ref={miniOverlayRef}
          style={{
            position: "fixed",
            bottom:  MINI_BOT + "px",
            left:    (miniLeft ?? (typeof window !== "undefined" ? window.innerWidth - MINI_MARGIN - MINI_W : 0)) + "px",
            width:   MINI_W + "px",
            height:  MINI_H + "px",
            zIndex: 9001,
            pointerEvents: "none",
            borderRadius: "14px",
            touchAction: "none",
          }}
        >
          {/* Drag + click area — covers only the BODY (below header strip) so buttons aren't blocked */}
          <div
            className="absolute inset-x-0 bottom-0 cursor-pointer pointer-events-auto"
            style={{ top: 30 }}
            onTouchStart={handleMiniTouchStart}
            onTouchMove={handleMiniTouchMove}
            onTouchEnd={handleMiniTouchEnd}
            onClick={() => {
              if (wasDragRef.current) { wasDragRef.current = false; return; }
              ytUnmuteAndPlay(iframeRef.current);
              setIsMuted(false);
              goToTV();
            }}
          />

          {/* Header strip — sits ABOVE drag area in DOM (later = higher z-order) */}
          <div
            className="absolute top-0 inset-x-0 flex items-center justify-between px-2 bg-gradient-to-b from-black/80 to-transparent pointer-events-none"
            style={{ height: 30, zIndex: 5 }}
          >
            {/* Left: LIVE badge + title — tap this area navigates to TV */}
            <div
              className="flex items-center gap-1 flex-1 min-w-0 cursor-pointer pointer-events-auto"
              onTouchStart={handleMiniTouchStart}
              onTouchMove={handleMiniTouchMove}
              onTouchEnd={handleMiniTouchEnd}
              onClick={() => {
                if (wasDragRef.current) { wasDragRef.current = false; return; }
                ytUnmuteAndPlay(iframeRef.current);
                setIsMuted(false);
                goToTV();
              }}
            >
              <span className="inline-flex items-center gap-0.5 text-[9px] bg-red-600 text-white px-1 py-0.5 rounded font-bold animate-pulse shrink-0">
                <Radio size={7} /> LIVE
              </span>
              <p className="text-white text-[10px] font-semibold truncate max-w-[110px]">
                {bs.programTitle ?? "Flexa TV"}
              </p>
            </div>

            {/* Right: action buttons — separate from drag, always tappable */}
            <div className="flex gap-1.5 shrink-0 pointer-events-auto" style={{ zIndex: 10 }}>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); goToTV(); }}
                className="bg-black/70 active:bg-violet-700 rounded-full text-white transition-colors"
                style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Ouvri Flexa TV"
              >
                <Maximize2 size={11} />
              </button>
              <button
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
                className="bg-black/70 active:bg-red-600 rounded-full text-white transition-colors"
                style={{ width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                title="Fèmen"
              >
                <X size={11} />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
