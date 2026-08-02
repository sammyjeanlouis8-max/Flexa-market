/**
 * GlobalMusicPlayer — persistent mini-player shown on all pages except /music.
 * Reads from the module-level musicStore so it stays live across route changes.
 *
 * Gestures:
 *  • Tap/drag the thin progress bar at the top  → precise seek
 *  • Swipe the card LEFT / RIGHT (on info area)  → seek ±Xs
 *  • Drag the ⠿ grip handle (or long-press card) → free 2-D reposition
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Play, Pause, SkipBack, SkipForward, X, Volume2, VolumeX, GripHorizontal } from "lucide-react";
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

// ── Constants ──────────────────────────────────────────────────────────────────
const SEC_PER_PX     = 0.3;   // 1 px horizontal swipe = Ns seek
const SWIPE_THRESH   = 8;     // px before treating as intentional swipe/drag
const LONG_PRESS_MS  = 350;   // ms hold before enabling free drag
const CARD_MARGIN    = 12;    // px left/right margin from viewport edges
const SNAP_BOTTOM_PX = 16;    // snap to bottom if within 16px of default pos

// ── Persisted position ────────────────────────────────────────────────────────
function loadPos(): { x: number; y: number } {
  try {
    const raw = localStorage.getItem("gmp_pos");
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { x: 0, y: 0 }; // default: bottom-centre
}
function savePos(x: number, y: number) {
  try { localStorage.setItem("gmp_pos", JSON.stringify({ x, y })); } catch { /* ignore */ }
}

export default function GlobalMusicPlayer() {
  const [location] = useLocation();
  const { t } = useTranslation();
  const [, forceUpdate] = useState(0);

  // ── Drag-to-reposition state ───────────────────────────────────────────────
  // pos = pixel offset from the default anchored position (bottom-centre)
  // positive Y → moves UP; positive X → moves right (relative to centred)
  const [pos, setPos] = useState<{ x: number; y: number }>(loadPos);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartTouch = useRef<{ cx: number; cy: number } | null>(null);
  const dragStartPos   = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragEnabled    = useRef(false); // set true after long-press or grip-touch
  const cardRef        = useRef<HTMLDivElement | null>(null);

  // ── Seek-swipe state ──────────────────────────────────────────────────────
  const [swipeDelta, setSwipeDelta] = useState(0);
  const [isSwiping, setIsSwiping]   = useState(false);
  const touchStartX    = useRef<number | null>(null);
  const touchStartY    = useRef<number | null>(null);
  const swipeAxisLocked = useRef<"x" | "y" | null>(null);
  const barDragging    = useRef(false);

  useEffect(() => subscribeMusicState(() => forceUpdate(n => n + 1)), []);

  const s = getMusicState();
  const [, navigate] = useLocation();
  const onMusicPage = /^\/music(\/|$)/.test(location);
  if (!s.track || onMusicPage) return null;

  const { track, playing, currentTime, duration, muted } = s;
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const seekDeltaSec = isSwiping ? swipeDelta * SEC_PER_PX : 0;
  const previewTime  = Math.max(0, Math.min(duration || 0, currentTime + seekDeltaSec));
  const previewPct   = duration > 0 ? (previewTime / duration) * 100 : pct;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const seekFromX = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    musicSeek(ratio * (duration || 0));
  };

  const clampPos = (x: number, y: number): { x: number; y: number } => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cardW = cardRef.current?.offsetWidth ?? (vw - CARD_MARGIN * 2);
    const cardH = cardRef.current?.offsetHeight ?? 90;
    // x: card must not slide beyond half its width off either edge
    const maxX = (vw - cardW) / 2 - CARD_MARGIN;
    const clampedX = Math.max(-maxX, Math.min(maxX, x));
    // y: 0 = default bottom pos; positive = up; clamp so card stays visible
    const defaultBottom = 64 + 8; // ~bottom-nav + gap
    const maxUp = vh - cardH - defaultBottom - 8;
    const clampedY = Math.max(0, Math.min(maxUp, y));
    // snap to bottom if within threshold
    const snappedY = clampedY < SNAP_BOTTOM_PX ? 0 : clampedY;
    return { x: clampedX, y: snappedY };
  };

  const commitPos = (x: number, y: number) => {
    const clamped = clampPos(x, y);
    setPos(clamped);
    savePos(clamped.x, clamped.y);
  };

  // ── Grip-handle touch (starts drag immediately) ───────────────────────────
  const onGripTouchStart = (e: React.TouchEvent) => {
    e.stopPropagation();
    dragEnabled.current = true;
    dragStartTouch.current = { cx: e.touches[0].clientX, cy: e.touches[0].clientY };
    dragStartPos.current = { ...pos };
    setIsDragging(true);
  };

  // ── Card touch — long-press activates drag; short = seek-swipe ────────────
  const onCardTouchStart = (e: React.TouchEvent) => {
    dragEnabled.current = false;
    dragStartTouch.current = { cx: e.touches[0].clientX, cy: e.touches[0].clientY };
    dragStartPos.current = { ...pos };

    // Long-press timer
    longPressTimer.current = setTimeout(() => {
      dragEnabled.current = true;
      setIsDragging(true);
      // Cancel any seek-swipe that may have started
      setSwipeDelta(0);
      setIsSwiping(false);
    }, LONG_PRESS_MS);

    // Seek-swipe init
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    swipeAxisLocked.current = null;
  };

  const onCardTouchMove = (e: React.TouchEvent) => {
    if (barDragging.current) return;

    const cx = e.touches[0].clientX;
    const cy = e.touches[0].clientY;

    if (dragEnabled.current && dragStartTouch.current) {
      // Free 2-D drag
      e.preventDefault();
      const dx = cx - dragStartTouch.current.cx;
      const dy = cy - dragStartTouch.current.cy;
      const rawX = dragStartPos.current.x + dx;
      const rawY = dragStartPos.current.y - dy; // invert: drag up = increase Y
      const clamped = clampPos(rawX, rawY);
      setPos(clamped);
      return;
    }

    // Otherwise: seek-swipe logic
    const dx = cx - (touchStartX.current ?? cx);
    const dy = cy - (touchStartY.current ?? cy);
    if (swipeAxisLocked.current === null) {
      if (Math.abs(dx) > SWIPE_THRESH || Math.abs(dy) > SWIPE_THRESH) {
        swipeAxisLocked.current = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        // If intentional gesture started → cancel long-press
        if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
      }
    }
    if (swipeAxisLocked.current === "x") {
      e.preventDefault();
      setSwipeDelta(dx);
      setIsSwiping(true);
    }
  };

  const onCardTouchEnd = () => {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }

    if (dragEnabled.current) {
      commitPos(pos.x, pos.y);
      dragEnabled.current = false;
      setIsDragging(false);
      dragStartTouch.current = null;
      return;
    }

    // Commit seek if swiping
    if (isSwiping && Math.abs(swipeDelta) > SWIPE_THRESH) {
      musicSeek(previewTime);
    }
    setSwipeDelta(0);
    setIsSwiping(false);
    swipeAxisLocked.current = null;
    touchStartX.current = null;
    touchStartY.current = null;
  };

  // ── Computed card style ────────────────────────────────────────────────────
  const transform = [
    `translateX(${pos.x}px)`,
    `translateY(${-pos.y}px)`,
    isSwiping && !isDragging ? `translateX(${Math.max(-20, Math.min(20, swipeDelta * 0.08))}px)` : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      ref={cardRef}
      className="fixed left-0 right-0 mx-3 z-[60] rounded-2xl select-none"
      style={{
        bottom: "calc(4rem + env(safe-area-inset-bottom, 0px) + 8px)",
        background: "linear-gradient(135deg,#1c0934,#2a1648)",
        border: isDragging
          ? "1.5px solid rgba(139,92,246,0.85)"
          : "1px solid rgba(139,92,246,0.45)",
        boxShadow: isDragging
          ? "0 0 0 4px rgba(124,58,237,0.2), 0 16px 40px rgba(0,0,0,0.7)"
          : "0 -4px 32px rgba(100,50,200,0.25), 0 8px 32px rgba(0,0,0,0.6)",
        transform,
        transition: isDragging || isSwiping ? "none" : "transform 0.25s cubic-bezier(0.34,1.56,0.64,1)",
        touchAction: "none",
        cursor: isDragging ? "grabbing" : "default",
        willChange: "transform",
      }}
      onTouchStart={onCardTouchStart}
      onTouchMove={onCardTouchMove}
      onTouchEnd={onCardTouchEnd}
    >
      {/* Drag handle — always visible at top-centre */}
      <div
        className="absolute -top-5 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1 rounded-full cursor-grab active:cursor-grabbing"
        style={{
          background: isDragging
            ? "linear-gradient(90deg,#7c3aed,#c026d3)"
            : "rgba(139,92,246,0.35)",
          backdropFilter: "blur(8px)",
          boxShadow: isDragging ? "0 2px 12px rgba(124,58,237,0.6)" : "none",
          transition: "background 0.2s, box-shadow 0.2s",
        }}
        onTouchStart={onGripTouchStart}
        onTouchMove={onCardTouchMove}
        onTouchEnd={onCardTouchEnd}
      >
        <GripHorizontal size={12} className="text-white/80" />
        {isDragging && (
          <span className="text-[9px] font-black text-white tracking-widest uppercase">{t("music.playerDragging")}</span>
        )}
      </div>

      {/* NOW PLAYING pill */}
      {playing && !isDragging && (
        <div className="absolute -top-3 left-4 flex items-center gap-1.5 px-2 py-0.5 rounded-full"
          style={{ background: "linear-gradient(90deg,#7c3aed,#c026d3)", boxShadow: "0 2px 8px rgba(124,58,237,0.6)" }}>
          <NowPlayingDots playing={playing} />
          <span className="text-[9px] font-black text-white tracking-widest uppercase">Now Playing</span>
        </div>
      )}

      <div className="rounded-2xl overflow-hidden">

        {/* ── Seek preview overlay (shown while swiping) ── */}
        {isSwiping && !isDragging && Math.abs(swipeDelta) > SWIPE_THRESH && (
          <div style={{
            position: "absolute", inset: 0, zIndex: 10,
            display: "flex", alignItems: "center", justifyContent: "center",
            background: "rgba(10,0,25,0.75)", backdropFilter: "blur(4px)",
            borderRadius: 16, pointerEvents: "none",
          }}>
            <div style={{ textAlign: "center" }}>
              <p className="text-white font-black text-2xl">
                {seekDeltaSec >= 0 ? `+${Math.round(seekDeltaSec)}s` : `${Math.round(seekDeltaSec)}s`}
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
            swipeAxisLocked.current = "x";
            seekFromX(e.touches[0].clientX, e.currentTarget);
          }}
          onTouchMove={e => {
            if (!barDragging.current) return;
            e.stopPropagation();
            seekFromX(e.touches[0].clientX, e.currentTarget);
          }}
          onTouchEnd={() => { barDragging.current = false; }}
        >
          <div className="absolute left-1 right-1 h-1 rounded-full"
            style={{ background: "rgba(255,255,255,0.1)" }} />
          <div className="absolute left-1 h-1 rounded-full"
            style={{
              width: `calc(${isSwiping ? previewPct : pct}% - 4px)`,
              background: isSwiping
                ? "linear-gradient(90deg,#ec4899,#f97316)"
                : "linear-gradient(90deg,#8b5cf6,#ec4899)",
              transition: isSwiping ? "none" : "width 0.1s linear",
            }} />
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
          {/* ── Cover + info — tap to open /music ── */}
          <div
            className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer active:opacity-70 transition-opacity"
            onClick={() => { if (!isDragging && !isSwiping) navigate("/music"); }}
          >
            <div className="shrink-0 w-[42px] h-[42px] rounded-[10px] overflow-hidden">
              <CoverThumb src={track.cover_url} title={track.title} />
            </div>

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
                {isSwiping && !isDragging && Math.abs(swipeDelta) > SWIPE_THRESH && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: "rgba(236,72,153,0.25)", color: "#f9a8d4" }}>
                    {seekDeltaSec >= 0 ? `+${Math.round(seekDeltaSec)}s` : `${Math.round(seekDeltaSec)}s`}
                  </span>
                )}
                {isDragging && (
                  <span className="text-[9px] font-bold text-violet-300 animate-pulse">
                    {t("music.playerDraggingTip")}
                  </span>
                )}
              </div>
            </div>
          </div>{/* end tappable area */}

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
