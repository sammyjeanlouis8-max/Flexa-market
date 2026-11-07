/**
 * Library panel: Playlists | History | Liked
 * Fetches /api/music/playlists and /api/music/history; creates playlists; plays queues.
 */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ChevronLeft, Heart, History, Library, ListMusic, Loader2, Plus, Play,
} from "lucide-react";
import { musicPlayQueue, type MusicTrack } from "@/lib/musicStore";

type Tab = "playlists" | "history" | "liked";

type PlaylistRow = {
  id: number;
  title: string;
  description?: string | null;
  track_count?: number;
  is_public?: boolean;
  cover_url?: string | null;
};

type HistoryRow = {
  history_id: number;
  played_at: string;
  position_seconds?: number | null;
  track: MusicTrack;
};

function authHeaders(): HeadersInit {
  const token =
    localStorage.getItem("flexamarket_token")
    ?? sessionStorage.getItem("flexamarket_token")
    ?? "";
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export default function MusicLibraryPanel({
  likedTracks = [],
  onBack,
  onPlayLiked,
}: {
  likedTracks?: MusicTrack[];
  onBack?: () => void;
  onPlayLiked?: (track: MusicTrack, queue: MusicTrack[], idx: number) => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("playlists");
  const [playlists, setPlaylists] = useState<PlaylistRow[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [openPlaylist, setOpenPlaylist] = useState<{
    id: number;
    title: string;
    tracks: MusicTrack[];
  } | null>(null);
  const [plLoading, setPlLoading] = useState(false);

  const loadPlaylists = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/music/playlists", { headers: authHeaders() });
      if (r.status === 401) {
        setError(t("music.loginToComment"));
        setPlaylists([]);
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setPlaylists(d.playlists ?? []);
    } catch {
      setError(t("music.reportFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const loadHistory = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch("/api/music/history", { headers: authHeaders() });
      if (r.status === 401) {
        setError(t("music.loginToComment"));
        setHistory([]);
        return;
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setHistory(d.history ?? []);
    } catch {
      setError(t("music.reportFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (tab === "playlists" && !openPlaylist) void loadPlaylists();
    if (tab === "history") void loadHistory();
  }, [tab, openPlaylist, loadPlaylists, loadHistory]);

  const createPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/music/playlists", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ title: newTitle.trim(), is_public: true }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.error ?? `HTTP ${r.status}`);
      }
      setNewTitle("");
      await loadPlaylists();
    } catch (err: any) {
      setError(err?.message ?? t("music.reportFailed"));
    } finally {
      setCreating(false);
    }
  };

  const openPl = async (id: number, title: string) => {
    setPlLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/music/playlists/${id}`, { headers: authHeaders() });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const d = await r.json();
      setOpenPlaylist({ id, title: d.playlist?.title ?? title, tracks: d.tracks ?? [] });
    } catch {
      setError(t("music.reportFailed"));
    } finally {
      setPlLoading(false);
    }
  };

  const playTracks = (tracks: MusicTrack[], idx: number) => {
    const playable = tracks.filter((tr) => tr.audio_url);
    if (!playable.length) return;
    const mappedIdx = Math.max(0, playable.findIndex((tr) => tr.id === tracks[idx]?.id));
    musicPlayQueue(playable, mappedIdx >= 0 ? mappedIdx : 0);
  };

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "playlists", label: t("music.playlists"), icon: <ListMusic size={14} /> },
    { id: "history", label: t("music.history"), icon: <History size={14} /> },
    { id: "liked", label: t("music.likedSongs"), icon: <Heart size={14} /> },
  ];

  return (
    <div className="music-view-root px-4 pb-28" style={{ color: "#fff", minHeight: "100vh" }}>
      <div className="sticky top-0 z-20 flex items-center gap-3 py-3 mb-2"
        style={{ background: "rgba(5,11,31,0.92)", backdropFilter: "blur(12px)" }}>
        {onBack && (
          <button type="button" onClick={onBack}
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.08)" }}>
            <ChevronLeft size={18} />
          </button>
        )}
        <Library size={18} className="text-[#00D9FF]" />
        <h1 className="font-black text-lg">{t("music.library")}</h1>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto scrollbar-hide">
        {tabs.map((tb) => (
          <button key={tb.id} type="button" onClick={() => { setTab(tb.id); setOpenPlaylist(null); }}
            className="shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold transition-colors"
            style={{
              background: tab === tb.id ? "rgba(0,217,255,0.2)" : "rgba(255,255,255,0.06)",
              color: tab === tb.id ? "#00D9FF" : "rgba(255,255,255,0.65)",
              border: tab === tb.id ? "1px solid rgba(0,217,255,0.35)" : "1px solid transparent",
            }}>
            {tb.icon}
            {tb.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="text-red-400 text-xs mb-3 px-1">{error}</p>
      )}

      {tab === "playlists" && !openPlaylist && (
        <>
          <form onSubmit={createPlaylist} className="flex gap-2 mb-4">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={t("music.createPlaylist")}
              className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}
            />
            <button type="submit" disabled={creating || !newTitle.trim()}
              className="shrink-0 w-11 h-11 rounded-xl flex items-center justify-center disabled:opacity-40"
              style={{ background: "linear-gradient(135deg,#00D9FF,#A020F0)" }}>
              {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={18} />}
            </button>
          </form>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#00D9FF]" /></div>
          ) : playlists.length === 0 ? (
            <p className="text-white/35 text-sm text-center py-12">{t("music.emptyPlaylist")}</p>
          ) : (
            <div className="space-y-2">
              {playlists.map((pl) => (
                <button key={pl.id} type="button" onClick={() => void openPl(pl.id, pl.title)}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left active:scale-[0.99] transition-transform"
                  style={{ background: "#1a1a1a" }}>
                  <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
                    style={{ background: "linear-gradient(135deg,#0e6f8a,#4b0082)" }}>
                    <ListMusic size={20} className="text-white/80" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-sm truncate">{pl.title}</p>
                    <p className="text-white/40 text-[11px]">
                      {t("music.trackCount", { n: pl.track_count ?? 0 })}
                      {pl.is_public === false ? ` · ${t("music.private")}` : ` · ${t("music.public")}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {tab === "playlists" && openPlaylist && (
        <div>
          <button type="button" onClick={() => setOpenPlaylist(null)}
            className="flex items-center gap-1 text-xs text-white/50 mb-3">
            <ChevronLeft size={14} /> {t("music.playlists")}
          </button>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-black text-base truncate">{openPlaylist.title}</h2>
            {openPlaylist.tracks.length > 0 && (
              <button type="button"
                onClick={() => playTracks(openPlaylist.tracks, 0)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ background: "rgba(0,217,255,0.2)", color: "#00D9FF" }}>
                <Play size={12} fill="currentColor" /> {t("music.playAll")}
              </button>
            )}
          </div>
          {plLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#00D9FF]" /></div>
          ) : openPlaylist.tracks.length === 0 ? (
            <p className="text-white/35 text-sm text-center py-12">{t("music.emptyPlaylist")}</p>
          ) : (
            <div className="space-y-1">
              {openPlaylist.tracks.map((tr, idx) => (
                <button key={tr.id} type="button" onClick={() => playTracks(openPlaylist.tracks, idx)}
                  className="w-full flex items-center gap-3 rounded-xl px-2 py-2.5 text-left"
                  style={{ background: "transparent" }}>
                  {tr.cover_url
                    ? <img src={tr.cover_url} alt="" className="w-11 h-11 rounded-md object-cover" />
                    : <div className="w-11 h-11 rounded-md bg-white/10" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{tr.title}</p>
                    <p className="text-[11px] text-white/40 truncate">{tr.artist}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        loading ? (
          <div className="flex justify-center py-16"><Loader2 className="animate-spin text-[#00D9FF]" /></div>
        ) : history.length === 0 ? (
          <p className="text-white/35 text-sm text-center py-12">{t("music.emptyHistory")}</p>
        ) : (
          <div className="space-y-1">
            {history.map((h, idx) => (
              <button key={h.history_id} type="button"
                onClick={() => {
                  const queue = history.map((x) => x.track).filter((tr) => tr?.audio_url);
                  const i = queue.findIndex((tr) => tr.id === h.track.id);
                  if (i >= 0) musicPlayQueue(queue, i);
                }}
                className="w-full flex items-center gap-3 rounded-xl px-2 py-2.5 text-left">
                {h.track?.cover_url
                  ? <img src={h.track.cover_url} alt="" className="w-11 h-11 rounded-md object-cover" />
                  : <div className="w-11 h-11 rounded-md bg-white/10" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{h.track?.title}</p>
                  <p className="text-[11px] text-white/40 truncate">{h.track?.artist}</p>
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {tab === "liked" && (
        likedTracks.length === 0 ? (
          <p className="text-white/35 text-sm text-center py-12">{t("music.emptyLiked")}</p>
        ) : (
          <div className="space-y-1">
            {likedTracks.map((tr, idx) => (
              <button key={tr.id} type="button"
                onClick={() => {
                  if (onPlayLiked) onPlayLiked(tr, likedTracks, idx);
                  else musicPlayQueue(likedTracks.filter((x) => x.audio_url), idx);
                }}
                className="w-full flex items-center gap-3 rounded-xl px-2 py-2.5 text-left">
                {tr.cover_url
                  ? <img src={tr.cover_url} alt="" className="w-11 h-11 rounded-md object-cover" />
                  : <div className="w-11 h-11 rounded-md bg-white/10" />}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{tr.title}</p>
                  <p className="text-[11px] text-white/40 truncate">{tr.artist}</p>
                </div>
                <Heart size={14} className="text-red-400 fill-red-400 shrink-0" />
              </button>
            ))}
          </div>
        )
      )}
    </div>
  );
}
