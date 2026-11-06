/**
 * Public artist profile — GET /api/music/artist/:userId
 */
import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { ArrowLeft, CheckCircle, Loader2, Music2, Play } from "lucide-react";
import { musicPlayQueue, type MusicTrack } from "@/lib/musicStore";

type Artist = {
  id: number;
  name: string;
  avatar?: string | null;
  is_verified?: boolean;
  bio?: string | null;
  follower_count?: number;
};

function fmtPlays(n: number): string {
  if (n >= 1_000_000) return `${(n / 1e6).toFixed(1)} M`;
  if (n >= 1_000) return `${(n / 1000).toFixed(1)} k`;
  return String(n);
}

export default function MusicArtist() {
  const { t } = useTranslation();
  const [, params] = useRoute("/music/artist/:userId");
  const [, setLocation] = useLocation();
  const userId = params?.userId;

  const [artist, setArtist] = useState<Artist | null>(null);
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    setError(false);
    fetch(`/api/music/artist/${userId}`)
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d) => {
        setArtist(d.artist ?? null);
        setTracks(d.tracks ?? []);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [userId]);

  const playAt = (idx: number) => {
    const playable = tracks.filter((tr) => tr.audio_url);
    if (!playable.length) return;
    const target = tracks[idx];
    const mapped = Math.max(0, playable.findIndex((tr) => tr.id === target?.id));
    musicPlayQueue(playable, mapped >= 0 ? mapped : 0);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#050B1F" }}>
        <Loader2 className="animate-spin text-[#00D9FF]" size={28} />
      </div>
    );
  }

  if (error || !artist) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4" style={{ background: "#050B1F", color: "#fff" }}>
        <Music2 className="text-white/20" size={40} />
        <p className="text-white/50 text-sm">{t("music.noResults")}</p>
        <button type="button" onClick={() => setLocation("/music")}
          className="px-4 py-2 rounded-full text-sm font-bold"
          style={{ background: "rgba(0,217,255,0.2)", color: "#00D9FF" }}>
          {t("upload.backToMusic")}
        </button>
      </div>
    );
  }

  const totalPlays = tracks.reduce((s, tr) => s + (Number(tr.play_count) || 0), 0);

  return (
    <div className="min-h-screen pb-28" style={{ background: "#050B1F", color: "#fff" }}>
      <div className="relative overflow-hidden px-4 pt-12 pb-6"
        style={{ background: "linear-gradient(160deg,#0e6f8a 0%,#050B1F 70%)" }}>
        <button type="button" onClick={() => setLocation("/music")}
          className="w-9 h-9 rounded-full flex items-center justify-center mb-4"
          style={{ background: "rgba(0,0,0,0.35)" }}>
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-end gap-4">
          {artist.avatar ? (
            <img src={artist.avatar} alt="" className="w-20 h-20 rounded-2xl object-cover border border-white/20" />
          ) : (
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-2xl font-black"
              style={{ background: "rgba(0,217,255,0.2)" }}>
              {(artist.name || "?")[0]?.toUpperCase()}
            </div>
          )}
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-black truncate">{artist.name}</h1>
              {(artist.is_verified || tracks.some((tr) => tr.is_artist_verified)) && (
                <CheckCircle size={16} className="text-[#00D9FF] shrink-0" />
              )}
            </div>
            <p className="text-white/55 text-xs mt-1">
              {t("music.trackCount", { n: tracks.length })} · {fmtPlays(totalPlays)} {t("music.plays")}
            </p>
          </div>
          {tracks.some((tr) => tr.audio_url) && (
            <button type="button" onClick={() => playAt(0)}
              className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
              style={{ background: "#00D9FF", color: "#050B1F" }}>
              <Play size={18} fill="currentColor" className="ml-0.5" />
            </button>
          )}
        </div>
        {artist.bio && <p className="mt-4 text-sm text-white/65 leading-relaxed">{artist.bio}</p>}
      </div>

      <div className="px-4 mt-4">
        <p className="music-section-title text-xs font-bold uppercase tracking-wider text-white/40 mb-3">
          {t("music.artistTracks", { name: artist.name })}
        </p>
        {tracks.length === 0 ? (
          <p className="text-white/35 text-sm text-center py-12">{t("music.noTracksYet")}</p>
        ) : (
          <div className="space-y-1">
            {tracks.map((tr, idx) => (
              <button key={tr.id} type="button" onClick={() => playAt(idx)}
                className="w-full flex items-center gap-3 rounded-xl px-2 py-2.5 text-left active:bg-white/5">
                {tr.cover_url
                  ? <img src={tr.cover_url} alt="" className="w-12 h-12 rounded-md object-cover" />
                  : <div className="w-12 h-12 rounded-md bg-white/10 flex items-center justify-center"><Music2 size={16} className="text-white/30" /></div>}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{tr.title}</p>
                  <div className="flex items-center gap-1.5 text-[11px] text-white/40">
                    {tr.genre && <span className="truncate">{tr.genre}</span>}
                    {Number(tr.play_count) > 0 && (
                      <>
                        {tr.genre && <span>·</span>}
                        <Play size={8} className="inline" />
                        <span>{fmtPlays(Number(tr.play_count))}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
