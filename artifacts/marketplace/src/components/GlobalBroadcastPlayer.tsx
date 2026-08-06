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
import { X, Maximize2, Pause, Radio, Volume2, VolumeX, Film } from "lucide-react";
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

function isBlockedHost(url: string | null): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.includes("facebook.com") || h.includes("instagram.com") ||
           h.includes("fb.watch") || h.includes("fb.com");
  } catch { return false; }
}

function buildEmbedUrl(
  videoUrl: string | null,
  videoKey: string | null
): { url: string; isDirect: boolean } | null {
  // Facebook/Instagram block cross-origin iframe embedding — return null so the
  // player shows the branded "no signal" fallback instead of an error page.
  if (isBlockedHost(videoUrl)) return null;
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
  const { dismissed, setDismissed, filmPlayer, setFilmPlayer } = bs;
  const [location, navigate] = useLocation();

  // Film mode: filmPlayer is set but no active live broadcast
  const isFilmActive = filmPlayer !== null;
  const isFilmMode   = isFilmActive && !(bs.state === "playing" || bs.state === "paused");

  const [slotRect, setSlotRect]     = useState<SlotRect | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // isMuted: true until user taps 🔊 (iOS forces mute on autoplay)
  const [isMuted, setIsMuted]       = useState(true);
  // slotConnecting: branded "Kap konekte..." overlay shown for 5 s after entering
  // slot mode — prevents raw YouTube/iframe error pages from appearing on first load.
  const [slotConnecting, setSlotConnecting] = useState(false);
  const slotConnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Grace period — mini-player stays 10 s after broadcast stops ─────────────
  // Prevents flicker from 5-second poll glitches where stopped/playing bounces.
  const [stableActive, setStableActive] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActive = bs.state === "playing" || bs.state === "paused";
  // stableActive stays true for either a live broadcast OR a film player
  const isEitherActive = isActive || isFilmActive;

  useEffect(() => {
    if (isEitherActive) {
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
      setStableActive(true);
    } else {
      hideTimerRef.current = setTimeout(() => setStableActive(false), 10_000);
    }
    return () => {
      if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null; }
    };
  }, [isEitherActive]);

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
    if (!isOnViewerTV || !isEitherActive) { setSlotRect(null); return; }
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
  }, [isOnViewerTV, isEitherActive]);

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

  // Reset muted overlay whenever video source changes (new video = needs new unmute tap)
  useEffect(() => { setIsMuted(true); }, [bs.videoUrl, bs.videoKey, filmPlayer?.videoUrl]);

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

  // Show "connecting" branded overlay for 5 s every time slot mode becomes visible.
  // This prevents a raw YouTube "Ce contenu n'est plus disponible" error page from
  // appearing instantly when the stream URL is dead or still buffering.
  const prevSlotVisibleRef = useRef(false);
  useEffect(() => {
    const entering = slotVisible && !prevSlotVisibleRef.current;
    prevSlotVisibleRef.current = slotVisible;
    if (!entering) return;
    setSlotConnecting(true);
    if (slotConnTimerRef.current) clearTimeout(slotConnTimerRef.current);
    slotConnTimerRef.current = setTimeout(() => setSlotConnecting(false), 5_000);
    return () => {
      if (slotConnTimerRef.current) { clearTimeout(slotConnTimerRef.current); slotConnTimerRef.current = null; }
    };
  // slotVisible changes whenever we navigate to/from /tv or the slot DOM element appears
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slotVisible]);

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
  if (!stableActive) return null;
  // Broadcast dismissed and no film to fall back to → nothing
  if (isActive && dismissed && !isFilmActive) return null;

  // Film mini player is suppressed while VideoPlayer is the active full-screen player on /tv
  const videoPlayerActive = isOnViewerTV && typeof document !== "undefined" && !!document.getElementById("flexa-tv-video-player");
  if (isFilmMode && videoPlayerActive) return null;

  // Effective video source — film takes priority when no live broadcast is active
  const effectiveVideoUrl = isFilmMode ? (filmPlayer?.videoUrl ?? null) : bs.videoUrl;
  const effectiveVideoKey = isFilmMode ? (filmPlayer?.videoKey ?? null) : bs.videoKey;
  const effectiveTitle    = isFilmMode ? (filmPlayer?.title ?? "Flexa TV") : (bs.programTitle ?? "Flexa TV");

  const embed = buildEmbedUrl(effectiveVideoUrl, effectiveVideoKey);

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
              title={effectiveTitle}
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

        {/* ── Slot "connecting" overlay ─────────────────────────────────────────
            Shows for 5 s when the user first enters /tv while a broadcast is active.
            Prevents raw YouTube / iframe error pages ("Ce contenu n'est plus
            disponible") from appearing on-screen before the stream loads.
            In mini mode this overlay is already replaced by the opaque poster. */}
        {slotConnecting && slotVisible && (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 z-30"
            style={{
              background: "linear-gradient(135deg,#0d0918 0%,#180a30 50%,#0a0a12 100%)",
              borderRadius: "12px",
            }}
          >
            {/* Pulsing logo */}
            <div className="relative flex items-center justify-center">
              <div
                className="absolute rounded-full animate-ping"
                style={{ width: 80, height: 80, background: "rgba(139,92,246,0.2)" }}
              />
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center"
                style={{ background: "rgba(139,92,246,0.15)", border: "1.5px solid rgba(139,92,246,0.4)" }}
              >
                <img src="/flexa-tv-logo.png" alt="Flexa TV" className="w-10 h-10 object-contain" />
              </div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <p className="text-white font-semibold text-sm">Flexa TV</p>
              <p className="text-white/50 text-xs">Kap konekte sou signal la…</p>
            </div>
            {/* Skip button — lets user dismiss overlay immediately */}
            <button
              onClick={() => setSlotConnecting(false)}
              className="mt-1 text-white/30 text-[11px] underline"
            >
              Montre dirèkteman
            </button>
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

        {/* ── Mini-mode poster — OPAQUE cover over the iframe ─────────────────
            The iframe MUST stay hidden in mini mode because:
            - Facebook/Instagram embeds show a prominent error card ("Ce contenu
              n'est plus disponible") when the URL is geo-blocked or removed.
            - YouTube shows a white preload flash before the player loads.
            The poster is the authoritative visual; the iframe provides audio only.
            Priority: film thumbnail → branded gradient → logo.                  */}
        {isMiniMode && (
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ zIndex: 5, borderRadius: "14px", overflow: "hidden", background: "#0a0a0a" }}
          >
            {isFilmMode ? (
              filmPlayer?.thumbnailUrl ? (
                /* Film with thumbnail — show it full-size */
                <img
                  src={filmPlayer.thumbnailUrl}
                  alt={filmPlayer.title ?? "Film"}
                  className="w-full h-full object-cover"
                />
              ) : (
                /* Film without thumbnail — gradient + title */
                <>
                  <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#1e0a3c 0%,#2d1657 50%,#0f0f1a 100%)" }} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 px-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center mb-1"
                      style={{ background: "linear-gradient(135deg,#7c3aed,#c026d3)" }}>
                      <Film size={16} className="text-white" />
                    </div>
                    <p className="text-white text-[10px] font-bold text-center leading-tight line-clamp-2 opacity-90">
                      {filmPlayer?.title ?? "Flexa TV"}
                    </p>
                  </div>
                </>
              )
            ) : (
              /* Live broadcast — animated gradient + logo */
              <>
                <div className="absolute inset-0" style={{ background: "linear-gradient(135deg,#0f0f1a 0%,#1a0a2e 60%,#0a0a0a 100%)" }} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <img src="/flexa-tv-logo.png" alt="Flexa TV" className="w-12 h-12 object-contain opacity-30" />
                </div>
              </>
            )}
            {/* Top + bottom gradients for header/title legibility */}
            <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.70) 0%, transparent 45%)" }} />
            <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.60) 0%, transparent 45%)" }} />
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
            {/* ── Body area: drag + tap to open TV (excludes top 44px header) ── */}
            <div
              className="absolute inset-x-0 bottom-0 cursor-pointer"
              style={{ top: 44 }}
              onTouchStart={handleMiniTouchStart}
              onTouchMove={handleMiniTouchMove}
              onTouchEnd={handleMiniTouchEnd}
              onClick={() => {
                if (wasDragRef.current) { wasDragRef.current = false; return; }
                if (isFilmMode) window.dispatchEvent(new CustomEvent("flexa:resume-film"));
                goToTV();
              }}
            />

            {/* ── Header strip: badge · title · sound · expand ─────────────── */}
            <div
              className="absolute top-0 inset-x-0 flex items-center gap-1 px-2"
              style={{
                height: 44,
                borderRadius: "14px 14px 0 0",
              }}
            >
              {/* Left: badge + title (draggable + tap-to-TV) */}
              <div
                className="flex items-center gap-1 flex-1 min-w-0 cursor-pointer"
                onTouchStart={handleMiniTouchStart}
                onTouchMove={handleMiniTouchMove}
                onTouchEnd={handleMiniTouchEnd}
                onClick={() => {
                  if (wasDragRef.current) { wasDragRef.current = false; return; }
                  if (isFilmMode) window.dispatchEvent(new CustomEvent("flexa:resume-film"));
                  ytUnmuteAndPlay(iframeRef.current);
                  setIsMuted(false);
                  goToTV();
                }}
              >
                {isFilmMode ? (
                  <span className="inline-flex items-center gap-0.5 text-[9px] bg-purple-600 text-white px-1.5 py-0.5 rounded font-bold shrink-0">
                    <Film size={7} /> Film
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-0.5 text-[9px] bg-red-600 text-white px-1.5 py-0.5 rounded font-bold animate-pulse shrink-0">
                    <Radio size={7} /> LIVE
                  </span>
                )}
                <p className="text-white text-[10px] font-semibold truncate drop-shadow">
                  {effectiveTitle}
                </p>
              </div>

              {/* Right: sound · expand · close — all 3 inside the header bounds */}
              <div className="flex items-center gap-1.5 shrink-0">
                {/* 🔊 Unmute */}
                <button
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    initBackgroundAudio();
                    ytUnmuteAndPlay(iframeRef.current);
                    setIsMuted(false);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    initBackgroundAudio();
                    ytUnmuteAndPlay(iframeRef.current);
                    setIsMuted(false);
                  }}
                  style={{
                    width: 30, height: 30,
                    borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isMuted ? "rgba(124,58,237,0.95)" : "rgba(0,0,0,0.55)",
                    color: "white",
                    border: isMuted ? "1.5px solid rgba(255,255,255,0.5)" : "1px solid rgba(255,255,255,0.15)",
                    flexShrink: 0,
                    cursor: "pointer",
                  }}
                  title={isMuted ? "Aktive son" : "Son aktif"}
                >
                  {isMuted ? <VolumeX size={13} /> : <Volume2 size={13} />}
                </button>

                {/* ↗ Expand */}
                <button
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); goToTV(); }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); goToTV(); }}
                  style={{
                    width: 30, height: 30,
                    borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(0,0,0,0.55)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "white",
                    flexShrink: 0,
                    cursor: "pointer",
                  }}
                  title="Ouvri Flexa TV"
                >
                  <Maximize2 size={12} />
                </button>

                {/* ✕ Close — same row, same size, red tint to signal destructive */}
                <button
                  onTouchStart={(e) => e.stopPropagation()}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    isFilmMode ? setFilmPlayer(null) : setDismissed(true);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    isFilmMode ? setFilmPlayer(null) : setDismissed(true);
                  }}
                  style={{
                    width: 30, height: 30,
                    borderRadius: "50%",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "rgba(220,38,38,0.85)",
                    border: "1px solid rgba(255,255,255,0.25)",
                    color: "white",
                    flexShrink: 0,
                    cursor: "pointer",
                  }}
                  title="Fèmen"
                  aria-label="Fèmen"
                >
                  <X size={13} strokeWidth={2.5} />
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
