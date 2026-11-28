/**
 * Flexa Music Home — redesign parity (forest green / charcoal / orange).
 * Featured Track carousel, Recently Played, New Releases, Playlists list,
 * Search + Library tabs, Add Music for eligible uploaders.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Compass,
  Heart,
  Home,
  Library,
  Loader2,
  Music2,
  Play,
  Plus,
  Search,
  User,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { isNativeMobileApp } from "@/lib/nativeMobileApp";
import {
  MUSIC_RECENTLY_PLAYED_KEY,
  MUSIC_RECENT_SEARCHES_KEY,
} from "@/lib/musicTheme";
import {
  dismissSponsoredBanner,
  getSponsoredBannerCount,
  getSponsoredHistory,
} from "@/lib/musicAdBreak";

export type MusicHomeTrack = {
  id: number;
  title: string;
  artist: string;
  album?: string | null;
  genre?: string | null;
  cover_url: string | null;
  audio_url?: string | null;
  duration_seconds?: number | null;
  is_featured?: boolean;
  play_count?: number;
  created_at?: string;
};

export type MusicPlaylistCard = {
  id: number;
  title: string;
  cover_url: string | null;
  track_count: number;
  description?: string | null;
};

type Tab = "home" | "explore" | "library" | "profile";

type Props = {
  tracks: MusicHomeTrack[];
  liked: Set<number>;
  user: any;
  currentTrackId?: number;
  currentTrackPlaying?: boolean;
  searchLoading?: boolean;
  autoFocusSearch?: boolean;
  onFocusHandled?: () => void;
  onPlay: (t: MusicHomeTrack, q: MusicHomeTrack[], i: number) => void;
  onToggleLike: (id: number) => void;
  onSearch: (q: string) => void;
  onUpload: () => void;
  onOpenPlaylist: (id: number) => void;
  onPlayPlaylist: (id: number) => void;
  setLocation: (path: string) => void;
};

function Cover({
  src,
  title,
  size,
  radius = 12,
}: {
  src?: string | null;
  title: string;
  size: number;
  radius?: number;
}) {
  const [err, setErr] = useState(false);
  if (src && !err) {
    return (
      <img
        src={src}
        alt={title}
        onError={() => setErr(true)}
        className="object-cover music-cover shrink-0"
        style={{ width: size, height: size, borderRadius: radius }}
      />
    );
  }
  return (
    <div
      className="shrink-0 flex items-center justify-center font-black text-white/80"
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        background: "linear-gradient(135deg,#0B3D2B,#1C2C24)",
      }}
    >
      {(title?.[0] || "♪").toUpperCase()}
    </div>
  );
}

function BrandMark() {
  return (
    <div className="music-brand-mark text-[17px]">
      <span className="eq" aria-hidden>
        <span /><span /><span /><span />
      </span>
      <span>
        Flexa <span className="name-music">Music</span>
      </span>
    </div>
  );
}

function readRecentSearches(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(MUSIC_RECENT_SEARCHES_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(0, 8) : [];
  } catch {
    return [];
  }
}

function pushRecentSearch(q: string) {
  const next = [q, ...readRecentSearches().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 8);
  localStorage.setItem(MUSIC_RECENT_SEARCHES_KEY, JSON.stringify(next));
}

function readRecentlyPlayedIds(): number[] {
  try {
    const raw = JSON.parse(localStorage.getItem(MUSIC_RECENTLY_PLAYED_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => Number.isFinite(x)).slice(0, 30) : [];
  } catch {
    return [];
  }
}

function normalize(s: string) {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export default function MusicHome({
  tracks,
  liked,
  user,
  currentTrackId,
  currentTrackPlaying,
  searchLoading,
  autoFocusSearch,
  onFocusHandled,
  onPlay,
  onToggleLike,
  onSearch,
  onUpload,
  onOpenPlaylist,
  onPlayPlaylist,
  setLocation,
}: Props) {
  const { t } = useTranslation();
  const artistToolsAvailable = !isNativeMobileApp();
  const [tab, setTab] = useState<Tab>("home");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [recentSearches, setRecentSearches] = useState<string[]>(() => readRecentSearches());
  const [playlists, setPlaylists] = useState<MusicPlaylistCard[]>([]);
  const [playlistsLoading, setPlaylistsLoading] = useState(true);
  const [featuredIdx, setFeaturedIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchSeq = useRef(0);

  useEffect(() => {
    if (autoFocusSearch) {
      setSearchOpen(true);
      setTab("explore");
      setTimeout(() => searchInputRef.current?.focus(), 50);
      onFocusHandled?.();
    }
  }, [autoFocusSearch, onFocusHandled]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/music/playlists?limit=40");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setPlaylists(data.playlists ?? []);
      } catch {
        /* optional */
      } finally {
        if (!cancelled) setPlaylistsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const seq = ++searchSeq.current;
    const id = setTimeout(() => {
      if (seq !== searchSeq.current) return;
      onSearch(search.trim());
      if (search.trim().length >= 2) {
        pushRecentSearch(search.trim());
        setRecentSearches(readRecentSearches());
      }
    }, 320);
    return () => clearTimeout(id);
  }, [search, onSearch]);

  const featured = useMemo(() => {
    const feats = tracks.filter((t) => t.is_featured);
    return (feats.length ? feats : tracks).slice(0, 5);
  }, [tracks]);

  const featuredTrack = featured[featuredIdx % Math.max(featured.length, 1)] ?? null;

  const recentlyPlayed = useMemo(() => {
    const ids = readRecentlyPlayedIds();
    const byId = new Map(tracks.map((t) => [t.id, t]));
    const fromHistory = ids.map((id) => byId.get(id)).filter(Boolean) as MusicHomeTrack[];
    if (fromHistory.length >= 3) return fromHistory.slice(0, 12);
    return tracks.slice(0, 12);
  }, [tracks, currentTrackId]);

  const newReleases = useMemo(() => {
    return [...tracks]
      .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
      .slice(0, 12);
  }, [tracks]);

  const libraryTracks = useMemo(
    () => tracks.filter((t) => liked.has(t.id)),
    [tracks, liked],
  );

  const artists = useMemo(() => {
    const map = new Map<string, MusicHomeTrack[]>();
    for (const t of tracks) {
      const key = t.artist?.trim() || "Unknown";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return [...map.entries()].map(([name, ts]) => ({ name, tracks: ts, cover: ts[0]?.cover_url ?? null }));
  }, [tracks]);

  const showSearchPanel = searchOpen || tab === "explore" || !!search.trim();

  const playFeatured = () => {
    if (!featuredTrack) return;
    const q = featured.length ? featured : tracks;
    const i = Math.max(0, q.findIndex((t) => t.id === featuredTrack.id));
    onPlay(featuredTrack, q, i);
  };

  return (
    <div className="music-view-root" style={{ minHeight: "100vh", paddingBottom: 130 }} data-testid="music-home-redesign">
      {/* Brand header */}
      <div className="music-topbar sticky top-0 z-30 flex items-center justify-between px-4 py-3 gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <button
            type="button"
            onClick={() => {
              // SPA navigate keeps GlobalMusicPlayer mounted (playback continues).
              setLocation("/");
            }}
            className="music-icon-button w-9 h-9 rounded-full flex items-center justify-center shrink-0"
            aria-label={t("common.back", { defaultValue: "Back to Flexa Market" })}
            data-testid="music-back"
          >
            <ArrowLeft size={20} />
          </button>
          <BrandMark />
        </div>
        <div className="flex items-center gap-2">
          {artistToolsAvailable && (
            <button
              type="button"
              onClick={onUpload}
              className="music-icon-button h-9 px-3 rounded-full flex items-center gap-1.5 text-xs font-bold"
              style={{ background: "var(--music-orange)", color: "#111", border: "none" }}
              data-testid="music-add-music"
            >
              <Plus size={14} /> Add Music
            </button>
          )}
          <button
            type="button"
            aria-label={t("nav.search")}
            className="music-icon-button w-9 h-9 rounded-full flex items-center justify-center"
            onClick={() => {
              setSearchOpen(true);
              setTab("explore");
              setTimeout(() => searchInputRef.current?.focus(), 40);
            }}
            data-testid="music-open-search"
          >
            <Search size={17} />
          </button>
        </div>
      </div>

      {showSearchPanel ? (
        <div className="px-4 pt-2 pb-4">
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2.5"
            style={{ background: "var(--music-elevated)", border: "1px solid var(--music-line)" }}
          >
            <Search size={15} className="text-white/40 shrink-0" />
            <input
              ref={searchInputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") {
                  e.preventDefault();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              placeholder={t("music.searchPlaceholder", { defaultValue: "Search songs, artists, playlists…" })}
              className="flex-1 bg-transparent text-white text-sm placeholder:text-white/35 outline-none"
              inputMode="search"
              enterKeyHint="search"
              data-testid="music-search-input"
            />
            {search && (
              <button type="button" onClick={() => { setSearch(""); onSearch(""); }} aria-label="Clear">
                <X size={14} className="text-white/40" />
              </button>
            )}
          </div>

          {!search.trim() && recentSearches.length > 0 && (
            <div className="mt-4">
              <p className="music-section-label mb-2">Recent searches</p>
              <div className="flex flex-wrap gap-2">
                {recentSearches.map((q) => (
                  <button
                    key={q}
                    type="button"
                    className="rounded-full px-3 py-1.5 text-xs font-semibold text-white/85"
                    style={{ background: "var(--music-elevated)", border: "1px solid var(--music-line)" }}
                    onClick={() => setSearch(q)}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {search.trim() ? (
            <div className="mt-4 space-y-5">
              <p className="text-xs text-white/45 flex items-center gap-2">
                {searchLoading ? <Loader2 size={12} className="animate-spin" style={{ color: "var(--music-orange)" }} /> : null}
                {searchLoading
                  ? t("music.searching", { defaultValue: "Searching…" })
                  : t("music.searchResults", { n: tracks.length, q: search, defaultValue: `${tracks.length} results for “${search}”` })}
              </p>

              {/* Songs */}
              <section>
                <p className="music-section-title mb-2">Songs</p>
                {!searchLoading && tracks.length === 0 ? (
                  <p className="text-sm text-white/35 py-6 text-center">{t("music.noResults", { defaultValue: "No results" })}</p>
                ) : (
                  <div className="space-y-1">
                    {tracks.map((track, i) => (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => onPlay(track, tracks, i)}
                        className="music-track-row flex items-center gap-3 w-full px-2 py-2 text-left"
                        style={{ background: track.id === currentTrackId ? "rgba(255,107,0,0.12)" : "transparent" }}
                      >
                        <Cover src={track.cover_url} title={track.title} size={48} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{track.title}</p>
                          <p className="text-xs text-white/45 truncate">{track.artist}</p>
                        </div>
                        {track.id === currentTrackId && currentTrackPlaying ? (
                          <span className="text-[10px] font-bold" style={{ color: "var(--music-orange)" }}>▶</span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* Artists */}
              <section>
                <p className="music-section-title mb-2">Artists</p>
                <div className="space-y-2">
                  {artists
                    .filter((a) => normalize(a.name).includes(normalize(search)))
                    .slice(0, 8)
                    .map((a) => (
                      <button
                        key={a.name}
                        type="button"
                        className="flex items-center gap-3 w-full text-left"
                        onClick={() => {
                          const first = a.tracks[0];
                          if (first) onPlay(first, a.tracks, 0);
                        }}
                      >
                        <Cover src={a.cover} title={a.name} size={48} radius={999} />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{a.name}</p>
                          <p className="text-xs text-white/45">{a.tracks.length} tracks</p>
                        </div>
                      </button>
                    ))}
                </div>
              </section>

              {/* Playlists */}
              <section>
                <p className="music-section-title mb-2">Playlists</p>
                <div className="space-y-2">
                  {playlists
                    .filter((p) => normalize(p.title).includes(normalize(search)))
                    .map((p) => (
                      <PlaylistRow
                        key={p.id}
                        playlist={p}
                        onOpen={() => onOpenPlaylist(p.id)}
                        onPlay={() => onPlayPlaylist(p.id)}
                      />
                    ))}
                </div>
              </section>
            </div>
          ) : tab === "explore" ? (
            <div className="mt-5">
              <p className="music-section-title mb-3">Playlists</p>
              {playlistsLoading ? (
                <div className="flex justify-center py-10"><Loader2 className="animate-spin" style={{ color: "var(--music-orange)" }} /></div>
              ) : playlists.length === 0 ? (
                <GenreMixFallback tracks={tracks} onPlay={onPlay} />
              ) : (
                <div className="space-y-2.5">
                  {playlists.map((p) => (
                    <PlaylistRow
                      key={p.id}
                      playlist={p}
                      onOpen={() => onOpenPlaylist(p.id)}
                      onPlay={() => onPlayPlaylist(p.id)}
                    />
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      ) : tab === "library" ? (
        <div className="px-4 pt-3" id="music-library">
          <SponsoredAdsLibraryBlock setLocation={setLocation} />
          <p className="music-section-title mb-3 mt-5">Favorites</p>
          {libraryTracks.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3 text-center">
              <Heart size={36} className="text-white/15" />
              <p className="text-sm text-white/40">Liked tracks show up here.</p>
            </div>
          ) : (
            <div className="space-y-1">
              {libraryTracks.map((track, i) => (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => onPlay(track, libraryTracks, i)}
                  className="music-track-row flex items-center gap-3 w-full px-2 py-2 text-left"
                >
                  <Cover src={track.cover_url} title={track.title} size={48} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{track.title}</p>
                    <p className="text-xs text-white/45 truncate">{track.artist}</p>
                  </div>
                  <Heart size={15} className="text-[var(--music-orange)] fill-[var(--music-orange)]" />
                </button>
              ))}
            </div>
          )}
        </div>
      ) : tab === "profile" ? (
        <div className="px-4 pt-4 space-y-4">
          <div className="rounded-2xl p-4" style={{ background: "var(--music-elevated)", border: "1px solid var(--music-line)" }}>
            <p className="text-lg font-black">{user?.name ?? user?.username ?? "Guest"}</p>
            <p className="text-xs text-white/45 mt-1">{liked.size} favorites</p>
          </div>
          {artistToolsAvailable && (
            <button
              type="button"
              onClick={onUpload}
              className="w-full rounded-2xl py-3.5 font-bold text-[#111]"
              style={{ background: "var(--music-orange)" }}
            >
              Add Music
            </button>
          )}
          <button
            type="button"
            onClick={() => setLocation("/music/earnings")}
            className="w-full rounded-2xl py-3 font-semibold text-white"
            style={{ background: "var(--music-forest)" }}
          >
            Artist studio
          </button>
          <button
            type="button"
            onClick={() => setLocation("/")}
            className="w-full text-sm text-white/50 underline"
          >
            Back to Flexa Market
          </button>
        </div>
      ) : (
        /* ── HOME ── */
        <>
          {/* Featured Track */}
          {featuredTrack && (
            <section className="relative mb-6" data-testid="music-featured-track">
              <div className="relative min-h-[240px] overflow-hidden">
                {featuredTrack.cover_url ? (
                  <img
                    src={featuredTrack.cover_url}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                ) : (
                  <div className="absolute inset-0" style={{ background: "var(--music-forest)" }} />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/45 to-black/20" />
                <div className="relative z-10 px-4 pt-16 pb-5 flex flex-col justify-end min-h-[240px]">
                  <p className="music-kicker mb-1.5">FEATURED TRACK</p>
                  <h1 className="text-3xl font-black leading-tight">{featuredTrack.title}</h1>
                  <p className="text-white/80 text-sm mt-1">{featuredTrack.artist}</p>
                  <div className="flex items-center gap-3 mt-4">
                    <button
                      type="button"
                      onClick={playFeatured}
                      className="music-hero-play inline-flex items-center gap-2 px-5 py-2.5 text-sm font-bold"
                      data-testid="music-featured-play"
                    >
                      <Play size={16} fill="currentColor" /> Play
                    </button>
                    <button
                      type="button"
                      aria-label="Favorite"
                      onClick={() => onToggleLike(featuredTrack.id)}
                      className="w-11 h-11 rounded-full flex items-center justify-center"
                      style={{ border: "1.5px solid rgba(255,255,255,0.55)", background: "rgba(0,0,0,0.25)" }}
                      data-testid="music-featured-favorite"
                    >
                      <Heart
                        size={18}
                        className={liked.has(featuredTrack.id) ? "text-[var(--music-orange)] fill-[var(--music-orange)]" : "text-white"}
                      />
                    </button>
                  </div>
                  {featured.length > 1 && (
                    <div className="flex gap-1.5 mt-4">
                      {featured.map((_, i) => (
                        <button
                          key={i}
                          type="button"
                          aria-label={`Featured ${i + 1}`}
                          onClick={() => setFeaturedIdx(i)}
                          className="h-1.5 rounded-full transition-all"
                          style={{
                            width: i === featuredIdx % featured.length ? 16 : 6,
                            background: i === featuredIdx % featured.length ? "var(--music-orange)" : "rgba(255,255,255,0.35)",
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Recently Played */}
          <section className="mb-6">
            <div className="flex items-center justify-between px-4 mb-3">
              <p className="music-section-title">Recently Played</p>
              <button type="button" className="music-see-all" onClick={() => setTab("library")}>
                See All &gt;
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto pl-4 pr-4 pb-1 scrollbar-hide">
              {recentlyPlayed.map((track) => (
                <div key={track.id} className="shrink-0" style={{ width: 132 }}>
                  <div className="relative">
                    <button type="button" onClick={() => onPlay(track, recentlyPlayed, recentlyPlayed.indexOf(track))} className="block w-full text-left">
                      <Cover src={track.cover_url} title={track.title} size={132} />
                    </button>
                    <button
                      type="button"
                      aria-label={`Play ${track.title}`}
                      onClick={() => onPlay(track, recentlyPlayed, recentlyPlayed.indexOf(track))}
                      className="absolute bottom-2 right-2 w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ background: "rgba(255,255,255,0.92)", color: "#111" }}
                    >
                      <Play size={13} fill="currentColor" className="ml-0.5" />
                    </button>
                  </div>
                  <p className="text-white text-xs font-bold truncate mt-1.5">{track.title}</p>
                  <p className="text-white/45 text-[10px] truncate">{track.artist}</p>
                </div>
              ))}
            </div>
          </section>

          {/* New Releases */}
          <section className="mb-6">
            <div className="flex items-center justify-between px-4 mb-3">
              <p className="music-section-title">New Releases</p>
              <button type="button" className="music-see-all" onClick={() => { setSearch(""); onSearch(""); setTab("explore"); }}>
                See All &gt;
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto pl-4 pr-4 pb-1 scrollbar-hide">
              {newReleases.map((track) => (
                <button
                  key={track.id}
                  type="button"
                  onClick={() => onPlay(track, newReleases, newReleases.indexOf(track))}
                  className="shrink-0 text-left"
                  style={{ width: 132 }}
                >
                  <Cover src={track.cover_url} title={track.title} size={132} />
                  <p className="text-white text-xs font-bold truncate mt-1.5">{track.title}</p>
                  <p className="text-white/45 text-[10px] truncate">{track.artist}</p>
                </button>
              ))}
            </div>
          </section>

          {/* Playlists — vertical list (replaces merch cards) */}
          <section className="px-4 mb-4" data-testid="music-playlists-list">
            <div className="flex items-center justify-between mb-3">
              <p className="music-section-title">Playlists</p>
              <button type="button" className="music-see-all" onClick={() => setTab("explore")}>
                See All &gt;
              </button>
            </div>
            {playlistsLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin" style={{ color: "var(--music-orange)" }} /></div>
            ) : playlists.length === 0 ? (
              <GenreMixFallback tracks={tracks} onPlay={onPlay} />
            ) : (
              <div className="space-y-2.5">
                {playlists.slice(0, 8).map((p) => (
                  <PlaylistRow
                    key={p.id}
                    playlist={p}
                    onOpen={() => onOpenPlaylist(p.id)}
                    onPlay={() => onPlayPlaylist(p.id)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Bottom nav — Home / Explore / Library / Profile */}
      <nav className="music-bottom-nav md:hidden" aria-label="Flexa Music">
        {(
          [
            ["home", Home, "Home"],
            ["explore", Compass, "Explore"],
            ["library", Library, "Library"],
            ["profile", User, "Profile"],
          ] as const
        ).map(([key, Icon, label]) => (
          <button
            key={key}
            type="button"
            className={`music-bottom-nav-item ${tab === key && !search.trim() ? "active" : ""}`}
            onClick={() => {
              setSearch("");
              onSearch("");
              setSearchOpen(false);
              setTab(key);
              if (key === "explore") setTimeout(() => searchInputRef.current?.focus(), 40);
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            <Icon size={19} fill={tab === key && key === "home" ? "currentColor" : "none"} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}

function PlaylistRow({
  playlist,
  onOpen,
  onPlay,
}: {
  playlist: MusicPlaylistCard;
  onOpen: () => void;
  onPlay: () => void;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-2xl px-2.5 py-2"
      style={{ background: "var(--music-elevated)", border: "1px solid var(--music-line)" }}
    >
      <button type="button" onClick={onOpen} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        <Cover src={playlist.cover_url} title={playlist.title} size={56} />
        <div className="min-w-0">
          <p className="text-sm font-bold truncate text-white">{playlist.title}</p>
          <p className="text-xs text-white/45">{playlist.track_count} tracks</p>
        </div>
      </button>
      <button
        type="button"
        onClick={onPlay}
        className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "var(--music-orange)", color: "#111" }}
        aria-label={`Play ${playlist.title}`}
      >
        <Play size={15} fill="currentColor" className="ml-0.5" />
      </button>
    </div>
  );
}

function SponsoredAdsLibraryBlock({ setLocation }: { setLocation: (path: string) => void }) {
  const [banner, setBanner] = useState(() => getSponsoredBannerCount());
  const [historyCount, setHistoryCount] = useState(() => getSponsoredHistory().length);

  useEffect(() => {
    const refresh = () => {
      setBanner(getSponsoredBannerCount());
      setHistoryCount(getSponsoredHistory().length);
    };
    refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", refresh);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  return (
    <div className="space-y-3" data-testid="music-library-sponsored">
      {banner > 0 ? (
        <div
          className="flex items-center gap-2 rounded-2xl px-3 py-2.5"
          style={{ background: "var(--music-forest)", border: "1px solid var(--music-line)" }}
        >
          <button
            type="button"
            className="flex-1 text-left min-w-0"
            onClick={() => {
              dismissSponsoredBanner();
              setBanner(0);
              setLocation("/music/sponsored-ads");
            }}
          >
            <p className="text-sm font-bold text-white">
              {banner} ad{banner === 1 ? "" : "s"} you heard
            </p>
            <p className="text-[11px] text-white/45">Tap to watch from Recent Sponsored Ads</p>
          </button>
          <button
            type="button"
            className="text-white/50 px-2 text-lg leading-none"
            aria-label="Dismiss"
            onClick={() => {
              dismissSponsoredBanner();
              setBanner(0);
            }}
          >
            ×
          </button>
        </div>
      ) : null}

      <button
        type="button"
        onClick={() => setLocation("/music/sponsored-ads")}
        className="w-full flex items-center justify-between rounded-2xl px-3.5 py-3.5 text-left"
        style={{ background: "var(--music-elevated)", border: "1px solid var(--music-line)" }}
      >
        <div>
          <p className="text-sm font-bold text-white">Recent Sponsored Ads</p>
          <p className="text-xs text-white/45 mt-0.5">
            {historyCount > 0
              ? `${historyCount} saved · heard while listening`
              : "Ads heard in the background"}
          </p>
        </div>
        <span className="text-[var(--music-orange)] text-sm font-bold">Open</span>
      </button>
    </div>
  );
}

function GenreMixFallback({
  tracks,
  onPlay,
}: {
  tracks: MusicHomeTrack[];
  onPlay: (t: MusicHomeTrack, q: MusicHomeTrack[], i: number) => void;
}) {
  const genres = [...new Set(tracks.map((t) => t.genre).filter(Boolean))] as string[];
  if (!genres.length) {
    return (
      <div className="flex flex-col items-center py-10 gap-2 text-white/35">
        <Music2 size={32} />
        <p className="text-sm">Playlists coming soon</p>
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {genres.slice(0, 8).map((genre) => {
        const list = tracks.filter((t) => t.genre === genre);
        const cover = list[0]?.cover_url ?? null;
        return (
          <div
            key={genre}
            className="flex items-center gap-3 rounded-2xl px-2.5 py-2"
            style={{ background: "var(--music-elevated)", border: "1px solid var(--music-line)" }}
          >
            <button
              type="button"
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
              onClick={() => list[0] && onPlay(list[0], list, 0)}
            >
              <Cover src={cover} title={genre} size={56} />
              <div className="min-w-0">
                <p className="text-sm font-bold truncate">{genre}</p>
                <p className="text-xs text-white/45">{list.length} tracks</p>
              </div>
            </button>
            <button
              type="button"
              onClick={() => list[0] && onPlay(list[0], list, 0)}
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: "var(--music-orange)", color: "#111" }}
            >
              <Play size={15} fill="currentColor" className="ml-0.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
