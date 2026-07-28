import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { Play, Pause, Music2 } from "lucide-react";

type Track = {
  id: number; title: string; artist: string; album: string | null;
  cover_url: string | null; audio_url: string | null;
  duration_seconds: number | null; play_count: number;
};

function fmtDur(s: number) {
  if (!s || !isFinite(s)) return "0:00";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function MusicPublicPlayer() {
  const [, params]   = useRoute("/music/play/:id");
  const [, setLocation] = useLocation();
  const id = params?.id;

  const [track,       setTrack]       = useState<Track | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(false);
  const [playing,     setPlaying]     = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration,    setDuration]    = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/music/${id}`)
      .then(r => r.json())
      .then(d => { if (d.track) setTrack(d.track); else setError(true); })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [id]);

  // ── Set document title
  useEffect(() => {
    if (track) document.title = `${track.title} — ${track.artist} · Flexa Music`;
  }, [track]);

  // ── Audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime  = () => setCurrentTime(audio.currentTime);
    const onDur   = () => { if (isFinite(audio.duration)) setDuration(audio.duration); };
    const onPlay  = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener("timeupdate",     onTime);
    audio.addEventListener("durationchange", onDur);
    audio.addEventListener("loadedmetadata", onDur);
    audio.addEventListener("play",           onPlay);
    audio.addEventListener("pause",          onPause);
    return () => {
      audio.removeEventListener("timeupdate",     onTime);
      audio.removeEventListener("durationchange", onDur);
      audio.removeEventListener("loadedmetadata", onDur);
      audio.removeEventListener("play",           onPlay);
      audio.removeEventListener("pause",          onPause);
    };
  }, []);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    a.paused ? a.play().catch(() => {}) : a.pause();
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = ((e.clientX - r.left) / r.width) * duration;
  };

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // ── Loading
  if (loading) return (
    <div style={{ background: "#0a0a0a", minHeight: "100dvh" }}
      className="flex items-center justify-center">
      <div className="w-10 h-10 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
    </div>
  );

  // ── Error / not found
  if (error || !track) return (
    <div style={{ background: "#0a0a0a", minHeight: "100dvh", color: "#fff" }}
      className="flex flex-col items-center justify-center gap-4 px-6 text-center">
      <Music2 size={48} className="text-white/20" />
      <p className="text-white/50 text-sm">Chante pa jwenn</p>
      <button onClick={() => setLocation("/music")}
        className="px-6 py-3 rounded-2xl text-sm font-bold text-white"
        style={{ background: "linear-gradient(135deg,#7c3aed,#c026d3)" }}>
        Louvri Flexa Music
      </button>
    </div>
  );

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100dvh", color: "#fff" }}
      className="flex flex-col min-h-screen px-6 py-10 max-w-sm mx-auto">

      {/* ── Branding ── */}
      <div className="flex items-center gap-2 mb-10">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
          style={{ background: "linear-gradient(135deg,#7c3aed,#c026d3)" }}>
          <Music2 size={14} className="text-white" />
        </div>
        <span className="text-white font-black text-sm tracking-tight">Flexa Music</span>
      </div>

      {/* ── Cover art ── */}
      <div className="w-full aspect-square rounded-3xl overflow-hidden shadow-2xl mb-8 relative"
        style={{ background: "linear-gradient(135deg,#2d1b4e,#4b0082)" }}>
        {track.cover_url
          ? <img src={track.cover_url} alt={track.title} className="w-full h-full object-cover" />
          : <div className="w-full h-full flex items-center justify-center">
              <Music2 size={80} className="text-white/15" />
            </div>}
        {/* Vinyl overlay */}
        <div className="absolute inset-0 pointer-events-none"
          style={{ background: "radial-gradient(ellipse at 50% 50%, transparent 60%, rgba(0,0,0,0.35) 100%)" }} />
      </div>

      {/* ── Track info ── */}
      <div className="mb-6 flex-1">
        <h1 className="text-white font-black text-2xl leading-tight mb-1">{track.title}</h1>
        <p className="text-white/50 text-base mb-1">{track.artist}</p>
        {track.play_count > 0 && (
          <p className="text-white/25 text-xs">{track.play_count.toLocaleString()} jwe</p>
        )}
      </div>

      {/* ── Progress bar ── */}
      <div className="mb-6">
        <div className="relative h-1.5 rounded-full cursor-pointer mb-2"
          style={{ background: "rgba(255,255,255,0.08)" }}
          onClick={seek}>
          <div className="absolute left-0 top-0 h-full rounded-full"
            style={{ width: `${pct}%`, background: "linear-gradient(90deg,#7c3aed,#c026d3)", transition: "width 0.25s linear" }} />
          {/* Thumb */}
          {pct > 0 && (
            <div className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 rounded-full bg-white shadow-md"
              style={{ left: `calc(${pct}% - 7px)` }} />
          )}
        </div>
        <div className="flex justify-between text-[10px] text-white/30">
          <span>{fmtDur(currentTime)}</span>
          <span>{fmtDur(duration || track.duration_seconds || 0)}</span>
        </div>
      </div>

      {/* ── Play/Pause ── */}
      <div className="flex justify-center mb-10">
        <button onClick={toggle}
          className="w-20 h-20 rounded-full flex items-center justify-center shadow-2xl"
          style={{ background: "#ffffff" }}>
          {playing
            ? <Pause size={32} className="text-black" />
            : <Play  size={32} className="text-black ml-1" />}
        </button>
      </div>

      {/* ── CTA ── */}
      <div className="text-center">
        <p className="text-white/30 text-xs mb-3">Dekouvri plis mizik sou Flexa Market</p>
        <button onClick={() => setLocation("/music")}
          className="w-full py-4 rounded-2xl text-sm font-bold text-white"
          style={{ background: "linear-gradient(135deg,#7c3aed,#c026d3)" }}>
          Louvri Flexa Music
        </button>
      </div>

      <audio ref={audioRef} src={track.audio_url ?? ""} preload="metadata" />
    </div>
  );
}
