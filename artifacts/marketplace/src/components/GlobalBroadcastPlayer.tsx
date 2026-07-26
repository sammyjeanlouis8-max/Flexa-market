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
 * iOS FIX: In mini mode the iframe gets pointer-events:none so the overlay
 * inside the same div can reliably receive touch events. iOS Safari steals
 * all touches for iframes regardless of z-index; this is the only safe fix.
 *
 * DVR seek bar: YouTube dvr=1 param lets viewers scrub the live buffer.
 */
import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { X, Maximize2, Pause, Radio, Volume2, VolumeX } from "lucide-react";
import { useBroadcast } from "@/contexts/broadcast";

// YouTube embed params
// muted=1 → YouTube starts with its OWN muted flag (not browser-enforced).
// The browser's autoplay policy is satisfied, AND postMessage unMute/setVolume
// can override a YouTube-level mute (but NOT a browser-level enforcement).
const YT_PARAMS =
  "autoplay=1&muted=1&dvr=1&rel=0&modestbranding=1&controls=1&disablekb=0&playsinline=1&enablejsapi=1&origin=" +
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

  const [slotRect, setSlotRect]     = useState<SlotRect | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // isMuted: true until user taps 🔊 (iOS forces mute on autoplay)
  const [isMuted, setIsMuted]       = useState(true);

  // ── Grace period — mini-player stays 10 s after broadcast stops ─────────────
  // Prevents flicker from 5-second poll glitches where stopped/playing bounces.
  const [stableActive, setStableActive] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = bs.state === "playing" || bs.state === "paused";

  useEffect(() => {
    if (isActive) {
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
      setStableActive(true);
    } else {
      hideTimerRef.current = setTimeout(() => setStableActive(false), 10_000);
    }
    return () => {
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    };
  }, [isActive]);

  // ── Mini-player 2-axis drag ──────────────────────────────────────────────────
  const [miniLeft, setMiniLeft]     = useState<number | null>(null);
  const [miniTop,  setMiniTop]      = useState<number | null>(null);
  const miniLeftRef = useRef<number | null>(null);
  const miniTopRef  = useRef<number | null>(null);
  // drag tracking — all mutable, no re-render during move
  const dragStartX    = useRef(0);
  const dragStartY    = useRef(0);
  const dragStartLeft = useRef(0);
  const dragStartTop  = useRef(0);
  const dragging      = useRef(false);
  const wasDragRef    = useRef(false); // survives into onClick after touchEnd

  const iframeRef   = useRef<HTMLIFrameElement>(null);
  const videoRef    = useRef<HTMLVideoElement>(null);
  const wrapperRef  = useRef<HTMLDivElement>(null);
  // Background audio session — silent oscillator keeps iOS audio active when screen dims
  const audioCtxRef = useRef<AudioContext | null>(null);
  // Screen Wake Lock — prevents auto-lock while broadcast is playing
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const isOnViewerTV = location === "/tv";
  const isOnAdminTV  = location.startsWith("/admin");

  const resolvedMiniLeft = () =>
    miniLeftRef.current ??
    (typeof window !== "undefined" ? window.innerWidth - MINI_MARGIN - MINI_W : 0);

  // Default top = just above the bottom nav bar
  const resolvedMiniTop = () =>
    miniTopRef.current ??
    (typeof window !== "undefined" ? window.innerHeight - MINI_BOT - MINI_H : 300);

  const applyLeft = useCallback((left: number) => {
    miniLeftRef.current = left;
    if (wrapperRef.current) {
      wrapperRef.current.style.left  = left + "px";
      wrapperRef.current.style.right = "auto";
    }
  }, []);

  const applyTop = useCallback((top: number) => {
    miniTopRef.current = top;
    if (wrapperRef.current) {
      wrapperRef.current.style.top    = top + "px";
      wrapperRef.current.style.bottom = "auto";
    }
  }, []);

  const handleMiniTouchStart = useCallback((e: React.TouchEvent) => {
    dragging.current   = false;
    wasDragRef.current = false;
    dragStartX.current    = e.touches[0].clientX;
    dragStartY.current    = e.touches[0].clientY;
    dragStartLeft.current = resolvedMiniLeft();
    dragStartTop.current  = resolvedMiniTop();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleMiniTouchMove = useCallback((e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - dragStartX.current;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (!dragging.current && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) dragging.current = true;
    if (!dragging.current) return;
    const w = typeof window !== "undefined" ? window.innerWidth  : 400;
    const h = typeof window !== "undefined" ? window.innerHeight : 800;
    const maxLeft = w - MINI_MARGIN - MINI_W;
    const minTop  = 60;               // below the sticky header
    const maxTop  = h - MINI_H - 80; // above bottom nav
    applyLeft(Math.max(MINI_MARGIN, Math.min(maxLeft, dragStartLeft.current + dx)));
    applyTop(Math.max(minTop, Math.min(maxTop, dragStartTop.current + dy)));
  }, [applyLeft, applyTop]);

  const handleMiniTouchEnd = useCallback((_e: React.TouchEvent) => {
    if (!dragging.current) return;
    wasDragRef.current = true; // tell onClick to skip navigation
    dragging.current   = false;
    // Snap left/right to nearest edge; keep vertical position as-is
    const w       = typeof window !== "undefined" ? window.innerWidth : 400;
    const cur     = miniLeftRef.current ?? (w - MINI_MARGIN - MINI_W);
    const snapped = cur + MINI_W / 2 < w / 2 ? MINI_MARGIN : w - MINI_MARGIN - MINI_W;
    applyLeft(snapped);
    setMiniLeft(snapped);
    setMiniTop(miniTopRef.current);
  }, [applyLeft]);

  // ── Slot tracking: poll every 200ms ─────────────────────────────────────────
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

  // ── Media Session API (iOS lock-screen) ──────────────────────────────────────
  useEffect(() => {
    if (!isActive || !("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: bs.programTitle ?? "Flexa TV",
      artist: "Flexa Market",
      artwork: [{ src: "/flexa-tv-logo.png", sizes: "512x512", type: "image/png" }],
    });
    // Action handlers let the lock-screen "Now Playing" widget send commands back
    navigator.mediaSession.setActionHandler("play",  () => ytCmd(iframeRef.current, "playVideo"));
    navigator.mediaSession.setActionHandler("pause", () => ytCmd(iframeRef.current, "pauseVideo"));
    return () => {
      try { navigator.mediaSession.setActionHandler("play",  null); } catch { /**/ }
      try { navigator.mediaSession.setActionHandler("pause", null); } catch { /**/ }
    };
  }, [isActive, bs.programTitle]);

  // ── Screen Wake Lock — keeps display on so video isn't suspended ─────────────
  // Re-acquires after visibility changes (OS releases the lock when page hides)
  useEffect(() => {
    if (!isActive || dismissed || !("wakeLock" in navigator)) return;
    let active = true;
    const acquire = async () => {
      try {
        if (!active) return;
        wakeLockRef.current = await (navigator as any).wakeLock.request("screen");
      } catch { /* denied or unsupported */ }
    };
    acquire();
    const onVisibility = () => { if (document.visibilityState === "visible") acquire(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", onVisibility);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [isActive, dismissed]);

  // ── Silent AudioContext — keeps iOS audio session alive in background ─────────
  // MUST be started inside a user-gesture handler (initBackgroundAudio below).
  // Once the AudioContext is running, iOS treats the page as an audio app and
  // allows continued playback even when the display goes off.
  const initBackgroundAudio = useCallback(() => {
    if (audioCtxRef.current) return; // already running
    try {
      const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx  = new Ctx();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.001; // near-silent — audible only at maximum speaker volume
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      audioCtxRef.current = ctx;
    } catch { /* not supported */ }
  }, []);

  // Cleanup AudioContext when broadcast ends
  useEffect(() => {
    if (isActive) return;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
  }, [isActive]);

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
  // Use stableActive (10-s grace) so a 5-second poll glitch doesn't flash the mini-player off
  if (!stableActive || dismissed) return null;

  const embed = buildEmbedUrl(bs.videoUrl, bs.videoKey);

  // ── Compute iframe position ──────────────────────────────────────────────────
  const slotVisible =
    isOnViewerTV &&
    slotRect !== null &&
    slotRect.top >= -10 &&
    slotRect.top + slotRect.height <= window.innerHeight + 10;

  // Whether we're in mini-player mode (not slot, not admin)
  const isMiniMode = !slotVisible && !isOnAdminTV;

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
        // Mini player — top/left so vertical drag works (bottom-anchored can't move up)
        position: "fixed",
        top:  (miniTop  ?? (typeof window !== "undefined" ? window.innerHeight - MINI_BOT - MINI_H : 300)) + "px",
        left: (miniLeft ?? (typeof window !== "undefined" ? window.innerWidth  - MINI_MARGIN - MINI_W : 0)) + "px",
        width:   MINI_W + "px",
        height:  MINI_H + "px",
        zIndex: 9000,
        background: "black",
        borderRadius: "14px",
        overflow: "hidden",
        boxShadow: "0 8px 32px rgba(0,0,0,0.7)",
        border: "1.5px solid rgba(139,92,246,0.5)",
        // touchAction none on the wrapper so our drag handlers take priority
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
              style={{
                borderRadius: "12px",
                // Mini mode: disable pointer events so overlay inside can receive touches
                pointerEvents: isMiniMode ? "none" : "auto",
              }}
            />
          ) : (
            <iframe
              ref={iframeRef}
              src={embed.url}
              className="w-full h-full"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              allowFullScreen
              title={bs.programTitle ?? "Flexa TV"}
              style={{
                border: "none",
                borderRadius: "12px",
                // KEY FIX: iOS Safari iframes steal ALL touch events from overlaying
                // elements regardless of z-index. Disabling pointer events on the
                // iframe in mini mode lets our overlay reliably receive touches.
                // In slot/fullscreen mode the iframe needs its own controls.
                pointerEvents: isMiniMode ? "none" : "auto",
              }}
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
            style={{ borderRadius: "12px", pointerEvents: "none" }}
          >
            <img src="/flexa-tv-logo.png" alt="Flexa TV" className="w-16 h-16 object-contain opacity-80" />
            <div className="flex items-center gap-2 text-white">
              <Pause size={16} className="text-red-400" />
              <p className="text-sm font-semibold">Transmisyon an sispann…</p>
            </div>
          </div>
        )}

        {/* ── Mini-player controls overlay — INSIDE wrapperRef ─────────────────
            Being inside the same div as the iframe puts us in the same stacking
            context. Later in DOM = on top. Since the iframe has pointer-events:none
            in mini mode, ALL touches land here instead of being swallowed. */}
        {isMiniMode && (
          <div
            className="absolute inset-0"
            style={{ zIndex: 10, borderRadius: "14px", touchAction: "none" }}
          >
            {/* ── Body area: drag + tap to open TV ──────────────────────────── */}
            <div
              className="absolute inset-x-0 bottom-0 cursor-pointer"
              style={{ top: 34 }}
              onTouchStart={handleMiniTouchStart}
              onTouchMove={handleMiniTouchMove}
              onTouchEnd={handleMiniTouchEnd}
              onClick={() => {
                if (wasDragRef.current) { wasDragRef.current = false; return; }
                goToTV();
              }}
            />

            {/* ── Header strip: LIVE badge · title · buttons ──────────────── */}
            <div
              className="absolute top-0 inset-x-0 flex items-center gap-1 px-2"
              style={{
                height: 34,
                background: "linear-gradient(to bottom, rgba(0,0,0,0.85) 0%, transparent 100%)",
                borderRadius: "14px 14px 0 0",
              }}
            >
              {/* Left: LIVE + title (draggable + tap-to-TV) */}
              <div
                className="flex items-center gap-1 flex-1 min-w-0 cursor-pointer"
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
                <p className="text-white text-[10px] font-semibold truncate">
                  {bs.programTitle ?? "Flexa TV"}
                </p>
              </div>

              {/* Right: unmute · expand · close
                  These are siblings of the drag div (not children), so their
                  onClick fires independently. onPointerDown stopPropagation
                  prevents the drag handler from seeing the touch first. */}
              <div className="flex items-center gap-1 shrink-0">
                {/* 🔊 Unmute / sound toggle */}
                <button
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    e.preventDefault(); // block synthesized click — we handle it here
                    initBackgroundAudio();
                    ytUnmuteAndPlay(iframeRef.current);
                    setIsMuted(false);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {           // fallback for desktop/mouse
                    e.stopPropagation();
                    initBackgroundAudio();
                    ytUnmuteAndPlay(iframeRef.current);
                    setIsMuted(false);
                  }}
                  style={{
                    width: 30, height: 30,
                    borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isMuted ? "rgba(139,92,246,0.9)" : "rgba(0,0,0,0.7)",
                    color: "white",
                    border: isMuted ? "1.5px solid rgba(255,255,255,0.6)" : "none",
                    flexShrink: 0,
                  }}
                  title={isMuted ? "Aktive son" : "Son aktif"}
                >
                  {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                </button>

                {/* ↗ Expand to /tv */}
                <button
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    goToTV();
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); goToTV(); }}
                  style={{
                    width: 30, height: 30,
                    borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(0,0,0,0.7)",
                    color: "white",
                    flexShrink: 0,
                  }}
                  title="Ouvri Flexa TV"
                >
                  <Maximize2 size={12} />
                </button>

                {/* ✕ Dismiss — primary fix target */}
                <button
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    e.preventDefault(); // critical: prevents re-show from synthesized click
                    setDismissed(true);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setDismissed(true); }}
                  style={{
                    width: 30, height: 30,
                    borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(180,0,0,0.75)",
                    color: "white",
                    flexShrink: 0,
                  }}
                  title="Fèmen"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Slot-mode UI overlay (controls layered on top of iframe on /tv) ── */}
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
               muted=1 in YT_PARAMS means this is a YouTube-level mute (not browser-enforced),
               so postMessage unMute reliably works when called inside a user-gesture handler. */}
          {isMuted && (
            <div
              className="absolute inset-0 flex items-center justify-center pointer-events-auto"
              style={{ zIndex: 20, background: "rgba(0,0,0,0.35)" }}
            >
              <button
                onTouchEnd={(e) => {
                  e.preventDefault();
                  initBackgroundAudio();
                  ytUnmuteAndPlay(iframeRef.current);
                  setIsMuted(false);
                }}
                onClick={() => {
                  initBackgroundAudio();
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
        </div>
      )}
    </>
  );
}
