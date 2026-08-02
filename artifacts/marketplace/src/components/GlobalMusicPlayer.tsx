/**
 * GlobalMusicPlayer — persistent mini-player shown on all pages except /music.
 * Reads from the module-level musicStore so it stays live across route changes.
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
      <img
        src={src}
        alt={title}
        onError={() => setErr(true)}
        className="w-full h-full object-cover"
      />
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
        <span
          key={i}
          className={`w-1 rounded-full bg-violet-300 ${playing ? "animate-bounce" : ""}`}
          style={{ height: `${h}%`, animationDelay: `${i * 150}ms` }}
        />
      ))}
    </div>
  );
}

export default function GlobalMusicPlayer() {
  const [location] = useLocation();
  const [, forceUpdate] = useState(0);
  const isDragging = useRef(false);

  // Subscribe to store changes
  useEffect(() => subscribeMusicState(() => forceUpdate(n => n + 1)), []);

  const s = getMusicState();

  // Hide on /music pages (FlexaMusic has its own MiniPlayer)
  const onMusicPage = /^\/music(\/|$)/.test(location);
  if (!s.track || onMusicPage) return null;

  const { track, playing, currentTime, duration, muted } = s;
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const seekFromX = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    musicSeek(ratio * (duration || 0));
  };

  return (
    <div
      className="fixed left-0 right-0 mx-3 z-[60] rounded-2xl select-none"
      style={{
        bottom: "calc(4rem + env(safe-area-inset-bottom, 0px) + 8px)",
        background: "linear-gradient(135deg,#1c0934,#2a1648)",
        border: "1px solid rgba(139,92,246,0.45)",
        boxShadow: "0 -4px 32px rgba(100,50,200,0.25), 0 8px 32px rgba(0,0,0,0.6)",
      }}
    >
      {/* NOW PLAYING pill */}
      {playing && (
        <div
          className="absolute -top-3 left-4 flex items-center gap-1.5 px-2 py-0.5 rounded-full"
          style={{ background: "linear-gradient(90deg,#7c3aed,#c026d3)", boxShadow: "0 2px 8px rgba(124,58,237,0.6)" }}
        >
          <NowPlayingDots playing={playing} />
          <span className="text-[9px] font-black text-white tracking-widest uppercase">Now Playing</span>
        </div>
      )}

      <div className="rounded-2xl overflow-hidden">
        {/* Draggable progress bar */}
        <div
          className="h-5 flex items-center cursor-pointer relative"
          style={{ touchAction: "none" }}
          onClick={e => seekFromX(e.clientX, e.currentTarget)}
          onTouchStart={e => { isDragging.current = true; seekFromX(e.touches[0].clientX, e.currentTarget); }}
          onTouchMove={e => { if (!isDragging.current) return; e.preventDefault(); seekFromX(e.touches[0].clientX, e.currentTarget); }}
          onTouchEnd={() => { isDragging.current = false; }}
        >
          <div className="absolute left-0 right-0 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />
          <div className="absolute left-0 h-1 rounded-full"
            style={{ width: `${pct}%`, background: "linear-gradient(90deg,#8b5cf6,#ec4899)" }} />
          <div className="absolute w-4 h-4 rounded-full bg-white -translate-x-1/2"
            style={{ left: `${pct}%`, boxShadow: "0 0 0 3px rgba(139,92,246,0.6), 0 2px 6px rgba(0,0,0,0.5)" }} />
        </div>

        <div className="flex items-center gap-2.5 px-3 pb-3 pt-1">
          {/* Cover art */}
          <div className="shrink-0 w-[42px] h-[42px] rounded-[10px] overflow-hidden">
            <CoverThumb src={track.cover_url} title={track.title} />
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-bold truncate leading-tight">{track.title}</p>
            <p className="text-white/50 text-[10px] truncate">{track.artist}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-violet-300 text-[9px] font-mono tabular-nums">{fmtDur(Math.floor(currentTime))}</span>
              {duration > 0 && <span className="text-white/20 text-[9px]">/ {fmtDur(Math.floor(duration))}</span>}
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={musicPlayPrev} className="w-8 h-8 flex items-center justify-center active:scale-90 transition-transform">
              <SkipBack size={14} className="text-white/70" />
            </button>
            <button
              onClick={musicTogglePlay}
              className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: "linear-gradient(135deg,#7c3aed,#c026d3)", boxShadow: "0 4px 12px rgba(124,58,237,0.5)" }}
            >
              {playing
                ? <Pause size={15} className="text-white" />
                : <Play  size={15} className="text-white ml-0.5" />}
            </button>
            <button onClick={musicPlayNext} className="w-8 h-8 flex items-center justify-center active:scale-90 transition-transform">
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
