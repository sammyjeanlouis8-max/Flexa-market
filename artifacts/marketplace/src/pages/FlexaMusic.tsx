import { useState } from "react";
import {
  Music2, Play, Heart, Search, Shuffle, SkipForward,
  SkipBack, Volume2, Mic2, Radio, ListMusic, Star,
  TrendingUp, Headphones, Crown, Clock, Plus, ChevronRight,
} from "lucide-react";

// ── Placeholder data ──────────────────────────────────────────────────────────
const GENRES = [
  { label: "Kompa",     color: "from-violet-600 to-purple-800",  emoji: "🎷" },
  { label: "Trap",      color: "from-yellow-500 to-orange-700",  emoji: "🔥" },
  { label: "Rap",       color: "from-gray-700 to-gray-900",      emoji: "🎤" },
  { label: "Zouk",      color: "from-pink-500 to-rose-700",      emoji: "💃" },
  { label: "Reggaeton", color: "from-green-500 to-emerald-700",  emoji: "🌴" },
  { label: "R&B",       color: "from-blue-600 to-indigo-800",    emoji: "🎶" },
  { label: "Gospel",    color: "from-amber-500 to-yellow-600",   emoji: "🙏" },
  { label: "Pop",       color: "from-red-500 to-pink-600",       emoji: "⭐" },
];

const FEATURED = [
  { title: "Bel Ayiti",    artist: "Mika Menard",    duration: "3:42", liked: true },
  { title: "Pati Kite M",  artist: "T-Vice",         duration: "4:01", liked: false },
  { title: "One Love",     artist: "Farruko Haiti",  duration: "3:28", liked: true },
  { title: "Sak Pase",     artist: "BélO",           duration: "5:12", liked: false },
  { title: "Cheri",        artist: "Djakout #1",     duration: "4:44", liked: true },
];

const ALBUMS = [
  { title: "Timoun Lakay",   artist: "Carimi",       year: "2024", songs: 12, gradient: "from-violet-500 to-fuchsia-700" },
  { title: "Haïti Chérie",   artist: "Tabou Combo",  year: "2023", songs: 10, gradient: "from-amber-500 to-red-600"     },
  { title: "Leve Kanpe",     artist: "Bélô",         year: "2025", songs: 8,  gradient: "from-cyan-500 to-blue-700"     },
  { title: "Revolisyon",     artist: "Harmonik",     year: "2024", songs: 14, gradient: "from-emerald-500 to-teal-700"  },
];

// ── Mini Player (demo) ────────────────────────────────────────────────────────
function MiniPlayer({ track, onLike }: {
  track: { title: string; artist: string; liked: boolean; duration: string };
  onLike: () => void;
}) {
  const [playing, setPlaying] = useState(true);
  const [progress] = useState(38);

  return (
    <div
      className="fixed bottom-20 left-0 right-0 mx-3 z-40 rounded-2xl overflow-hidden shadow-2xl"
      style={{ background: "linear-gradient(135deg,#1e1b4b,#312e81,#4c1d95)", border: "1px solid rgba(139,92,246,0.4)" }}
    >
      {/* Progress bar */}
      <div className="h-0.5 bg-white/10">
        <div className="h-full bg-violet-400 transition-all" style={{ width: `${progress}%` }} />
      </div>

      <div className="flex items-center gap-3 px-3 py-2.5">
        {/* Artwork */}
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-400 to-fuchsia-600 flex items-center justify-center shrink-0 shadow-lg">
          <Music2 size={18} className="text-white" />
        </div>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-bold truncate">{track.title}</p>
          <p className="text-white/60 text-xs truncate">{track.artist}</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={onLike}>
            <Heart size={18} className={track.liked ? "text-red-400 fill-red-400" : "text-white/50"} />
          </button>
          <button
            onClick={() => setPlaying(p => !p)}
            className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center"
          >
            {playing
              ? <span className="text-white font-bold text-xs">⏸</span>
              : <Play size={16} className="text-white" />}
          </button>
          <button><SkipForward size={18} className="text-white/70" /></button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function FlexaMusic() {
  const [liked, setLiked] = useState<Record<number, boolean>>(
    Object.fromEntries(FEATURED.map((t, i) => [i, t.liked]))
  );
  const [miniTrack, setMiniTrack] = useState<null | (typeof FEATURED[0] & { liked: boolean })>(null);
  const [search, setSearch] = useState("");

  const playTrack = (track: typeof FEATURED[0], idx: number) => {
    setMiniTrack({ ...track, liked: liked[idx] });
  };

  const toggleLike = (idx: number) => {
    setLiked(prev => ({ ...prev, [idx]: !prev[idx] }));
    if (miniTrack) setMiniTrack(prev => prev ? { ...prev, liked: !prev.liked } : null);
  };

  return (
    <>
      <div className="max-w-3xl mx-auto px-3 pb-36">

        {/* ── Hero ── */}
        <div
          className="relative rounded-3xl overflow-hidden mb-6 p-6"
          style={{ background: "linear-gradient(135deg,#0f0c29,#302b63,#24243e)", minHeight: 200 }}
        >
          {/* Animated glow blobs */}
          <div className="absolute top-0 left-0 w-48 h-48 rounded-full bg-violet-600/30 blur-3xl -translate-x-1/4 -translate-y-1/4" />
          <div className="absolute bottom-0 right-0 w-40 h-40 rounded-full bg-fuchsia-600/30 blur-3xl translate-x-1/4 translate-y-1/4" />

          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/20 shadow-lg">
                <Music2 size={24} className="text-violet-300" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight">Flexa Music</h1>
                <p className="text-white/60 text-xs">Streaming · Downloads · Live</p>
              </div>
            </div>

            {/* Search bar */}
            <div className="flex items-center gap-2 bg-white/10 backdrop-blur rounded-xl px-3 py-2.5 border border-white/20">
              <Search size={16} className="text-white/50 shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Chèche chante, atiste, album..."
                className="flex-1 bg-transparent text-white text-sm placeholder:text-white/40 outline-none"
              />
              <Mic2 size={16} className="text-white/40 shrink-0" />
            </div>

            {/* Quick pills */}
            <div className="flex gap-2 mt-4 overflow-x-auto pb-1 scrollbar-hide">
              {["🔥 Trending", "🎶 New", "❤️ Liked", "🎙 Live"].map(pill => (
                <button key={pill}
                  className="text-xs text-white/80 bg-white/10 border border-white/20 rounded-full px-3 py-1 whitespace-nowrap shrink-0 backdrop-blur">
                  {pill}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Featured Tracks ── */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base flex items-center gap-2">
              <TrendingUp size={16} className="text-violet-500" /> Trending Kounye An
            </h2>
            <button className="text-xs text-violet-500 flex items-center gap-0.5">
              Tout <ChevronRight size={12} />
            </button>
          </div>

          <div className="space-y-2">
            {FEATURED.map((track, idx) => (
              <button
                key={idx}
                onClick={() => playTrack(track, idx)}
                className="w-full flex items-center gap-3 p-3 rounded-2xl bg-muted/50 hover:bg-muted transition-colors text-left active:scale-[0.98]"
              >
                {/* Rank / art */}
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shrink-0 shadow">
                  <span className="text-white font-bold text-sm">{idx + 1}</span>
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{track.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{track.artist}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-muted-foreground">{track.duration}</span>
                  <button
                    onClick={e => { e.stopPropagation(); toggleLike(idx); }}
                    className="p-1"
                  >
                    <Heart size={16} className={liked[idx] ? "text-red-400 fill-red-400" : "text-muted-foreground"} />
                  </button>
                  <div className="w-8 h-8 rounded-full bg-violet-600/20 flex items-center justify-center">
                    <Play size={12} className="text-violet-500" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ── Albums ── */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base flex items-center gap-2">
              <ListMusic size={16} className="text-fuchsia-500" /> Albums Popilè
            </h2>
            <button className="text-xs text-violet-500 flex items-center gap-0.5">
              Tout <ChevronRight size={12} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {ALBUMS.map((album, idx) => (
              <button key={idx}
                className="rounded-2xl overflow-hidden bg-muted/50 border border-border text-left hover:shadow-md active:scale-[0.97] transition-all">
                <div className={`h-32 bg-gradient-to-br ${album.gradient} flex items-center justify-center relative`}>
                  <Music2 size={36} className="text-white/60" />
                  <div className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                    <Play size={13} className="text-violet-700 ml-0.5" />
                  </div>
                </div>
                <div className="p-2.5">
                  <p className="font-bold text-sm truncate">{album.title}</p>
                  <p className="text-xs text-muted-foreground">{album.artist} · {album.songs} chante</p>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* ── Genres ── */}
        <section className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-base flex items-center gap-2">
              <Radio size={16} className="text-rose-500" /> Jen Mizik
            </h2>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {GENRES.map((g) => (
              <button key={g.label}
                className={`bg-gradient-to-br ${g.color} rounded-2xl p-3 flex flex-col items-center gap-1 hover:opacity-90 active:scale-95 transition-all`}>
                <span className="text-xl">{g.emoji}</span>
                <span className="text-white text-[10px] font-bold">{g.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* ── Premium Banner ── */}
        <section className="mb-6">
          <div
            className="rounded-3xl p-5 flex items-center gap-4 overflow-hidden relative"
            style={{ background: "linear-gradient(135deg,#f59e0b,#d97706,#92400e)" }}
          >
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
            <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <Crown size={24} className="text-white" />
            </div>
            <div className="flex-1 min-w-0 relative z-10">
              <p className="text-white font-black text-base">Flexa Premium</p>
              <p className="text-white/80 text-xs">Okenn reklam · Telechajman · Son HD</p>
            </div>
            <button className="bg-white text-amber-700 font-bold text-xs px-4 py-2 rounded-full whitespace-nowrap shrink-0 shadow">
              Esaye
            </button>
          </div>
        </section>

        {/* ── Quick Actions ── */}
        <section className="mb-6 grid grid-cols-2 gap-3">
          {[
            { icon: Headphones, label: "Podkass",     sub: "Tande kounye an",  color: "from-blue-500 to-indigo-600" },
            { icon: Star,       label: "Atis",         sub: "Dekouvri atiste",  color: "from-rose-500 to-pink-600"   },
            { icon: Clock,      label: "Tan Dòmi",     sub: "Sleep timer",      color: "from-teal-500 to-cyan-600"   },
            { icon: Plus,       label: "Playlist",     sub: "Kreye playlist",   color: "from-violet-500 to-purple-600"},
          ].map(({ icon: Icon, label, sub, color }) => (
            <button key={label}
              className="flex items-center gap-3 p-3 rounded-2xl bg-muted/50 border border-border hover:bg-muted active:scale-[0.97] transition-all text-left">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center shrink-0`}>
                <Icon size={18} className="text-white" />
              </div>
              <div className="min-w-0">
                <p className="font-bold text-sm">{label}</p>
                <p className="text-xs text-muted-foreground">{sub}</p>
              </div>
            </button>
          ))}
        </section>

        {/* ── Coming Soon Notice ── */}
        <div className="rounded-2xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/30 p-4 text-center">
          <p className="text-xs text-violet-600 dark:text-violet-400 font-semibold">🎵 Plis fonksyon ap vini — streaming, upload mizik, live ak plis</p>
        </div>

      </div>

      {/* ── Mini Player ── */}
      {miniTrack && (
        <MiniPlayer
          track={miniTrack}
          onLike={() => {
            const idx = FEATURED.findIndex(t => t.title === miniTrack.title);
            if (idx >= 0) toggleLike(idx);
          }}
        />
      )}
    </>
  );
}
