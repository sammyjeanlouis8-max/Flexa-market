/**
 * GlobalMusicPlayer — persistent mini-player shown on all pages except /music.
 * Reads from the module-level musicStore so it stays live across route changes.
 *
 * Seek gestures:
 *  • Tap/drag the thin progress bar at the top  → precise seek
 *  • Swipe the entire card left / right          → seek backward / forward
 *    (drag distance maps linearly to song position; a live ±Xs indicator shows)
 */
import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Play, Pause, SkipBack, SkipForward, X, Volume2, VolumeX } from "lucide-react";
import {
  getMusicState,
  subscribeMusicState,
  musicTogglePlay,
  musicPlayNext,
  musicPlayPrev,
  musicStop,
  musicSeek,
  musicToggleMute,
  gAudio,
} from "@/lib/musicStore";

function fmtDur(s: number): string {
  if (!s || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function CoverThumb({ src, title }: { src: string | null; title: string }) {
  const [err, setErr] = useState(false);
  const char = title[0]?.toUpperCase() ?? "🎵";
  if (src && !err) {
    return (
      <img src={src} alt={title} onError={() => setErr(true)}
        className="w-full h-full object-cover" />
    );
  }
  return (
    <div className="w-full h-full flex items-center justify-center text-white font-bold text-base"
      style={{ background: "linear-gradient(135deg,#7c3aed,#c026d3)" }}>
      {char}
    </div>
  );
}

function NowPlayingDots({ playing }: { playing: boolean }) {
  return (
    <div className="flex gap-0.5 items-end" style={{ height: 10 }}>
      {[60, 100, 40].map((h, i) => (
        <span key={i}
          className={`w-1 rounded-full bg-violet-300 ${playing ? "animate-bounce" : ""}`}
          style={{ height: `${h}%`, animationDelay: `${i * 150}ms` }} />
      ))}
    </div>
  );
}

// ── Swipe constants ────────────────────────────────────────────────────────────
// 1 px of horizontal drag = this many seconds of seek
const SEC_PER_PX = 0.3;
// Minimum px before a horizontal touch is treated as a seek swipe
// (below this the tap is forwarded to the progress-bar handler or ignored)
const SWIPE_THRESHOLD = 8;

export default function GlobalMusicPlayer() {
  const [location] = useLocation();
  const [, forceUpdate] = useState(0);

  // ── Swipe-to-seek state ────────────────────────────────────────────────────
  const [swipeDelta, setSwipeDelta] = useState(0); // px, negative = left
  const [isSwiping, setIsSwiping]   = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const swipeAxisLocked = useRef<"x" | "y" | null>(null);
  const barDragging = useRef(false); // separate flag for the thin bar drag

  useEffect(() => subscribeMusicState(() => forceUpdate(n => n + 1)), []);

  const s = getMusicState();
  const onMusicPage = /^\/music(\/|$)/.test(location);
  if (!s.track || onMusicPage) return null;

  const { track, playing, currentTime, duration, muted } = s;
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // ── Seek delta applied while swiping (clamped to song bounds) ─────────────
  const seekDeltaSec = isSwiping ? swipeDelta * SEC_PER_PX : 0;
  const previewTime  = Math.max(0, Math.min(duration || 0, currentTime + seekDeltaSec));
  const previewPct   = duration > 0 ? (previewTime / duration) * 100 : pct;

  // ── Progress-bar precise seek ──────────────────────────────────────────────
  const seekFromX = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    musicSeek(ratio * (duration || 0));
  };

  // ── Card swipe handlers ────────────────────────────────────────────────────
  const onCardTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swipeAxisLocked.current = null;
  };

  const onCardTouchMove = (e: React.TouchEvent) => {
    if (barDragging.current) return; // progress bar has exclusive control
    const dx = e.touches[0].clientX - (touchStartX.current ?? e.touches[0].clientX);
    const dy = e.touches[0].clientY - (touchStartY.current ?? e.touches[0].clientY);

    // Axis lock: decide on first significant movement
    if (swipeAxisLocked.current === null) {
      if (Math.abs(dx) > SWIPE_THRESHOLD || Math.abs(dy) > SWIPE_THRESHOLD) {
        swipeAxisLocked.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
    }

    if (swipeAxisLocked.current === "x") {
      e.preventDefault();           // stop page scroll while seeking
      setSwipeDelta(dx);
      setIsSwiping(true);
    }
  };

  const onCardTouchEnd = () => {
    if (isSwiping && Math.abs(swipeDelta) > SWIPE_THRESHOLD) {
      musicSeek(previewTime);
    }
    setSwipeDelta(0);
    setIsSwiping(false);
    swipeAxisLocked.current = null;
    touchStartX.current = null;
    touchStartY.current = null;
  };

  return (
    <div
      className="fixed left-0 right-0 mx-3 z-[60] rounded-2xl select-none"
      style={{
        bottom: "calc(4rem + env(safe-area-inset-bottom, 0px) + 8px)",
        background: "linear-gradient(135deg,#1c0934,#2a1648)",
        border: "1px solid rgba(139,92,246,0.45)",
        boxShadow: "0 -4px 32px rgba(100,50,200,0.25), 0 8px 32px rgba(0,0,0,0.6)",
        // Translate card slightly while swiping so user feels haptic feedback
        transform: isSwiping ? `translateX(${Math.max(-20, Math.min(20, swipeDelta * 0.08))}px)` : "none",
        transition: isSwiping ? "none" : "transform 0.2s ease",
        touchAction: "pan-y",         // allow vertical scrolling on the rest of the page
      }}
      onTouchStart={onCardTouchStart}
      onTouchMove={onCardTouchMove}
      onTouchEnd={onCardTouchEnd}
    >
      {/* NOW PLAYING pill */}
      {playing && (
        <div className="absolute -top-3 left-4 flex items-center gap-1.5 px-2 py-0.5 rounded-full"
          style={{ background: "linear-gradient(90deg,#7c3aed,#c026d3)", boxShadow: "0 2px 8px rgba(124,58,237,0.6)" }}>
          <NowPlayingDots playing={playing} />
          <span className="text-[9px] font-black text-white tracking-widest uppercase">Now Playing</span>
        </div>
      )}

      <div className="rounded-2xl overflow-hidden">

        {/* ── Seek preview overlay (shown while swiping) ── */}
        {isSwiping && Math.abs(swipeDelta) > SWIPE_THRESHOLD && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(10,0,25,0.75)", backdropFilter: "blur(4px)",
            borderRadius: 16, pointerEvents: "none",
          }}>
            <div style={{ textAlign: "center" }}>
              <p className="text-white font-black text-2xl">
                {seekDeltaSec >= 0
                  ? `+${Math.round(seekDeltaSec)}s`
                  : `${Math.round(seekDeltaSec)}s`}
              </p>
              <p className="text-violet-300 text-sm font-bold mt-0.5">
                {fmtDur(Math.floor(previewTime))}
                {duration > 0 && <span className="text-white/30"> / {fmtDur(Math.floor(duration))}</span>}
              </p>
              <p className="text-white/40 text-xs mt-1">
                {swipeDelta > 0 ? "→ avanse" : "← rekile"}
              </p>
            </div>
          </div>
        )}

        {/* ── Thin progress bar (precise tap/drag seek) ── */}
        <div
          className="h-6 flex items-center cursor-pointer relative px-1"
          style={{ touchAction: "none" }}
          onMouseDown={e => { barDragging.current = true; seekFromX(e.clientX, e.currentTarget); }}
          onMouseMove={e => { if (!barDragging.current) return; seekFromX(e.clientX, e.currentTarget); }}
          onMouseUp={() => { barDragging.current = false; }}
          onMouseLeave={() => { barDragging.current = false; }}
          onClick={e => seekFromX(e.clientX, e.currentTarget)}
          onTouchStart={e => {
            barDragging.current = true;
            swipeAxisLocked.current = "x"; // prevent card-swipe takeover
            seekFromX(e.touches[0].clientX, e.currentTarget);
          }}
          onTouchMove={e => {
            if (!barDragging.current) return;
            e.stopPropagation();
            seekFromX(e.touches[0].clientX, e.currentTarget);
          }}
          onTouchEnd={() => { barDragging.current = false; }}
        >
          {/* Track */}
          <div className="absolute left-1 right-1 h-1 rounded-full"
            style={{ background: "rgba(255,255,255,0.1)" }} />
          {/* Fill */}
          <div className="absolute left-1 h-1 rounded-full"
            style={{
              width: `calc(${isSwiping ? previewPct : pct}% - 4px)`,
              background: isSwiping
                ? "linear-gradient(90deg,#ec4899,#f97316)"
                : "linear-gradient(90deg,#8b5cf6,#ec4899)",
              transition: isSwiping ? "none" : "width 0.1s linear",
            }} />
          {/* Thumb */}
          <div className="absolute w-4 h-4 rounded-full bg-white"
            style={{
              left: `calc(${isSwiping ? previewPct : pct}% - 8px + 4px)`,
              boxShadow: isSwiping
                ? "0 0 0 4px rgba(236,72,153,0.5), 0 2px 6px rgba(0,0,0,0.5)"
                : "0 0 0 3px rgba(139,92,246,0.6), 0 2px 6px rgba(0,0,0,0.5)",
              transition: isSwiping ? "none" : "left 0.1s linear",
              transform: isSwiping ? "scale(1.25)" : "scale(1)",
            }} />
        </div>

        {/* ── Info + controls row ── */}
        <div className="flex items-center gap-2.5 px-3 pb-3 pt-0.5">
          {/* Cover art */}
          <div className="shrink-0 w-[42px] h-[42px] rounded-[10px] overflow-hidden">
            <CoverThumb src={track.cover_url} title={track.title} />
          </div>

          {/* Title / artist / time */}
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-bold truncate leading-tight">{track.title}</p>
            <p className="text-white/50 text-[10px] truncate">{track.artist}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-violet-300 text-[9px] font-mono tabular-nums">
                {fmtDur(Math.floor(isSwiping ? previewTime : currentTime))}
              </span>
              {duration > 0 && (
                <span className="text-white/20 text-[9px]">/ {fmtDur(Math.floor(duration))}</span>
              )}
              {/* Live seek delta badge */}
              {isSwiping && Math.abs(swipeDelta) > SWIPE_THRESHOLD && (
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: "rgba(236,72,153,0.25)", color: "#f9a8d4" }}>
                  {seekDeltaSec >= 0 ? `+${Math.round(seekDeltaSec)}s` : `${Math.round(seekDeltaSec)}s`}
                </span>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={musicPlayPrev}
              className="w-8 h-8 flex items-center justify-center active:scale-90 transition-transform">
              <SkipBack size={14} className="text-white/70" />
            </button>
            <button onClick={musicTogglePlay}
              className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: "linear-gradient(135deg,#7c3aed,#c026d3)", boxShadow: "0 4px 12px rgba(124,58,237,0.5)" }}>
              {playing
                ? <Pause size={15} className="text-white" />
                : <Play  size={15} className="text-white ml-0.5" />}
            </button>
            <button onClick={musicPlayNext}
              className="w-8 h-8 flex items-center justify-center active:scale-90 transition-transform">
              <SkipForward size={14} className="text-white/70" />
            </button>
            <button onClick={musicToggleMute} className="w-7 h-7 flex items-center justify-center">
              {muted ? <VolumeX size={12} className="text-white/40" /> : <Volume2 size={12} className="text-white/60" />}
            </button>
            <button onClick={musicStop} className="w-7 h-7 flex items-center justify-center">
              <X size={13} className="text-white/30" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
