import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Tv, Play, Clock, Calendar, Eye, Radio, Film, List, X,
  Maximize, Minimize, Volume2, VolumeX, Pause, ShoppingBag, Search,
} from "lucide-react";

// Auto-gradient thumbnail fallback — unique colour per title
function titleGradient(title: string): string {
  const gs = [
    "from-violet-600 to-purple-700",
    "from-blue-600 to-cyan-700",
    "from-red-600 to-orange-700",
    "from-green-600 to-emerald-700",
    "from-pink-600 to-rose-700",
    "from-amber-600 to-yellow-700",
    "from-teal-600 to-cyan-700",
    "from-indigo-600 to-violet-700",
  ];
  const hash = title.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return gs[hash % gs.length];
}
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useBroadcast } from "@/contexts/broadcast";

// ── Types ─────────────────────────────────────────────────────────────────────
type TvProgram = {
  id: number;
  title: string;
  description: string | null;
  type: "film" | "series" | "program" | "news" | "live";
  videoUrl: string | null;
  videoKey: string | null;
  thumbnailUrl: string | null;
  durationMinutes: number | null;
  scheduledAt: string | null;
  endsAt: string | null;
  seriesId: number | null;
  episodeNumber: number | null;
  seasonNumber: number | null;
  isFeatured: boolean;
  viewCount: number;
  seriesTitle?: string | null;
};

type TvSeries = { id: number; title: string; description: string | null; thumbnailUrl: string | null };

type BoostedListing = {
  id: number;
  title: string;
  price: number;
  currency: string;
  images: string[];
  thumbnailUrl?: string;
  sellerName?: string;
};

// ── URL helpers ────────────────────────────────────────────────────────────────
function getYouTubeId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("?")[0];
    if (u.hostname.includes("youtube.com")) {
      const liveMatch = u.pathname.match(/\/live\/([^/?]+)/);
      if (liveMatch) return liveMatch[1];
      const v = u.searchParams.get("v");
      if (v) return v;
      const embedMatch = u.pathname.match(/\/embed\/([^/?]+)/);
      if (embedMatch) return embedMatch[1];
    }
  } catch { /* ignore */ }
  return null;
}

function isYouTubeLive(url: string) {
  return url.includes("/live/") || url.includes("live=1");
}

type EmbedInfo = { url: string; isIframe: boolean; isDirect: boolean };

function getEmbedInfo(program: TvProgram): EmbedInfo | null {
  if (program.videoUrl) {
    const ytId = getYouTubeId(program.videoUrl);
    if (ytId) {
      const params = new URLSearchParams({ autoplay: "1", rel: "0", modestbranding: "1", controls: "1", playsinline: "1" });
      return { url: `https://www.youtube.com/embed/${ytId}?${params}`, isIframe: true, isDirect: false };
    }
    const vm = program.videoUrl.match(/vimeo\.com\/(\d+)/);
    if (vm) return { url: `https://player.vimeo.com/video/${vm[1]}?autoplay=1`, isIframe: true, isDirect: false };
    // Archive.org embed pages must be rendered in an iframe, not a <video> tag
    if (program.videoUrl.includes("archive.org/embed/")) return { url: program.videoUrl, isIframe: true, isDirect: false };
    return { url: program.videoUrl, isIframe: false, isDirect: true };
  }
  if (program.videoKey) return { url: `/api/storage/objects/${program.videoKey}`, isIframe: false, isDirect: true };
  return null;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-HT", { hour: "2-digit", minute: "2-digit" });
}

// ── Pre-roll Ad Overlay ───────────────────────────────────────────────────────
// ── Sponsored banner (inline, below player) ───────────────────────────────────
function AdBanner({ listing, onDone }: { listing: BoostedListing; onDone: () => void }) {
  const img = listing.images?.[0] ?? listing.thumbnailUrl ?? null;
  return (
    <div className="flex items-center gap-3 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-950/40 dark:to-amber-950/40 border border-yellow-200 dark:border-yellow-800/50 rounded-xl px-3 py-2.5 mb-3">
      {img && (
        <img src={img} alt={listing.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0 border border-yellow-200 dark:border-yellow-800/50" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 mb-0.5">
          <ShoppingBag size={10} className="text-yellow-600 dark:text-yellow-400" />
          <span className="text-[10px] text-yellow-600 dark:text-yellow-400 font-semibold uppercase tracking-wide">Sponsore</span>
        </div>
        <p className="font-semibold text-sm text-foreground truncate">{listing.title}</p>
        {listing.price > 0 && (
          <p className="text-xs text-yellow-700 dark:text-yellow-300 font-bold">
            {listing.currency} {listing.price.toFixed(2)}
          </p>
        )}
      </div>
      <button
        onClick={onDone}
        className="flex-shrink-0 text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-black/10 transition-colors"
        aria-label="Fèmen"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// kept for backward compatibility — no longer used as fullscreen overlay
function AdOverlay({ listing, onDone }: { listing: BoostedListing; onDone: () => void }) {
  const [countdown, setCountdown] = useState(5);
  const img = listing.images?.[0] ?? listing.thumbnailUrl ?? null;

  useEffect(() => {
    const t = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) { clearInterval(t); onDone(); return 0; }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 bg-black/70 rounded-full px-3 py-1">
        <ShoppingBag size={11} className="text-yellow-400" />
        <span className="text-[11px] text-white font-semibold">Piblisite · Flexa Market</span>
      </div>
      <div className="absolute top-3 right-3 z-10">
        {countdown > 0 ? (
          <div className="bg-black/70 text-white text-xs px-3 py-1.5 rounded-full font-medium">Skip nan {countdown}s</div>
        ) : (
          <button onClick={onDone} className="bg-white text-black text-xs px-4 py-1.5 rounded-full font-bold hover:bg-gray-100">Skip →</button>
        )}
      </div>
      <div className="flex-1 relative">
        {img ? (
          <img src={img} alt={listing.title} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-violet-900 to-purple-900 flex items-center justify-center">
            <ShoppingBag size={80} className="text-white/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/20" />
      </div>
      <div className="absolute bottom-6 left-0 right-0 px-5">
        <p className="text-white font-bold text-xl drop-shadow-lg">{listing.title}</p>
        {listing.price > 0 && (
          <p className="text-yellow-300 font-semibold text-base mt-0.5">
            {listing.currency} {listing.price.toFixed(2)}
          </p>
        )}
        <p className="text-white/70 text-xs mt-1">Disponib sou Flexa Market</p>
        <div className="mt-3 w-full bg-white/20 rounded-full h-1">
          <div
            className="bg-yellow-400 h-1 rounded-full transition-all duration-1000"
            style={{ width: `${((5 - countdown) / 5) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Broadcast Video Player (viewer-locked, no controls) ──────────────────────
function BroadcastPlayer({ videoUrl, videoKey, title, isPaused }: {
  videoUrl: string | null; videoKey: string | null; title: string | null; isPaused: boolean;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    document.addEventListener("webkitfullscreenchange", h);
    return () => { document.removeEventListener("fullscreenchange", h); document.removeEventListener("webkitfullscreenchange", h); };
  }, []);

  const toggleFS = useCallback(async () => {
    const el = wrapperRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await (el.requestFullscreen?.() ?? (el as any).webkitRequestFullscreen?.());
      else await (document.exitFullscreen?.() ?? (document as any).webkitExitFullscreen?.());
    } catch { /* ignore */ }
  }, []);

  let embedUrl: string | null = null;
  let isDirect = false;
  if (videoUrl) {
    const ytId = (() => {
      try {
        const u = new URL(videoUrl);
        if (u.hostname.includes("youtu.be")) return u.pathname.slice(1).split("?")[0];
        if (u.hostname.includes("youtube.com")) {
          const live = u.pathname.match(/\/live\/([^/?]+)/); if (live) return live[1];
          const v = u.searchParams.get("v"); if (v) return v;
        }
      } catch { return null; }
      return null;
    })();
    if (ytId) embedUrl = `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1&controls=1&playsinline=1`;
    else if (videoUrl.includes("archive.org/embed/")) { embedUrl = videoUrl; isDirect = false; }
    else { embedUrl = videoUrl; isDirect = true; }
  } else if (videoKey) { embedUrl = `/api/storage/objects/${videoKey}`; isDirect = true; }

  return (
    <div
      ref={wrapperRef}
      className={cn("relative w-full bg-black rounded-xl overflow-hidden", isFullscreen ? "fixed inset-0 z-[9999] rounded-none" : "")}
      style={isFullscreen ? undefined : { paddingBottom: "56.25%" }}
    >
      {/* Live badge */}
      <div className="absolute top-3 left-3 z-30 flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg animate-pulse pointer-events-none">
        <Radio size={10} /> LIVE
      </div>
      {/* Fullscreen button */}
      <button onClick={toggleFS} className="absolute top-2 right-2 z-30 bg-black/60 rounded-full p-1.5 text-white hover:bg-black/80">
        {isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}
      </button>

      {/* Paused overlay */}
      {isPaused && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/80 gap-4">
          <img src="/flexa-tv-logo.png" alt="Flexa TV" className="w-24 h-24 object-contain opacity-80" />
          <div className="flex items-center gap-2 text-white">
            <Pause size={20} className="text-red-400" />
            <p className="text-sm font-semibold">Transmisyon an sispann…</p>
          </div>
        </div>
      )}

      {/* Controls are now enabled — users can play/pause/seek freely */}

      {embedUrl ? (
        isDirect ? (
          <video src={embedUrl} autoPlay playsInline className="absolute inset-0 w-full h-full object-contain" />
        ) : (
          <iframe src={embedUrl} className="absolute inset-0 w-full h-full" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen title={title ?? ""} style={{ border: "none" }} />
        )
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <img src="/flexa-tv-logo.png" alt="Flexa TV" className="w-28 h-28 object-contain opacity-60" />
        </div>
      )}
    </div>
  );
}

// ── Video Player with Fullscreen (for regular on-demand viewing) ──────────────
function VideoPlayer({ program, onClose, noVideoLabel }: {
  program: TvProgram; onClose?: () => void; noVideoLabel?: string;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  const embed = getEmbedInfo(program);
  const isLinear = program.type === "live" || (embed?.isDirect ?? false);
  const isLive = program.type === "live" || (program.videoUrl ? isYouTubeLive(program.videoUrl) : false);

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    document.addEventListener("webkitfullscreenchange", handler);
    return () => { document.removeEventListener("fullscreenchange", handler); document.removeEventListener("webkitfullscreenchange", handler); };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const el = wrapperRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await (el.requestFullscreen?.() ?? (el as any).webkitRequestFullscreen?.());
      else await (document.exitFullscreen?.() ?? (document as any).webkitExitFullscreen?.());
    } catch { /* Safari */ }
  }, []);

  const togglePlay = useCallback(() => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) { videoRef.current.play(); setIsPlaying(true); }
    else { videoRef.current.pause(); setIsPlaying(false); }
  }, []);

  const toggleMute = useCallback(() => {
    if (!videoRef.current) return;
    videoRef.current.muted = !videoRef.current.muted;
    setIsMuted(videoRef.current.muted);
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={cn("relative w-full bg-black rounded-xl overflow-hidden group", isFullscreen ? "fixed inset-0 z-[9999] rounded-none" : "")}
      style={isFullscreen ? undefined : { paddingBottom: "56.25%" }}
    >
      {isLive && <div className="absolute top-3 left-3 z-20 flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg animate-pulse pointer-events-none"><Radio size={10} /> LIVE</div>}
      <div className={cn("absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity", isFullscreen && "opacity-100")}>
        {embed?.isDirect && (
          <>
            <button onClick={toggleMute} className="bg-black/60 rounded-full p-1.5 text-white hover:bg-black/80">{isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
            <button onClick={togglePlay} className="bg-black/60 rounded-full p-1.5 text-white hover:bg-black/80">{isPlaying ? <Pause size={14} /> : <Play size={14} />}</button>
          </>
        )}
        <button onClick={toggleFullscreen} className="bg-black/60 rounded-full p-1.5 text-white hover:bg-black/80">{isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}</button>
        {onClose && !isFullscreen && <button onClick={onClose} className="bg-black/60 rounded-full p-1.5 text-white hover:bg-black/80"><X size={14} /></button>}
        {isFullscreen && <button onClick={toggleFullscreen} className="bg-black/60 rounded-full p-1.5 text-white hover:bg-black/80"><X size={14} /></button>}
      </div>
      {embed ? (
        embed.isIframe ? (
          <iframe src={embed.url} className="absolute inset-0 w-full h-full" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowFullScreen title={program.title} style={{ border: "none" }} />
        ) : (
          <video ref={videoRef} src={embed.url} autoPlay playsInline controls={!isLinear} onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)} className="absolute inset-0 w-full h-full object-contain" />
        )
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-white/40 gap-3"><Tv size={56} /><p className="text-sm">{noVideoLabel ?? "—"}</p></div>
      )}
    </div>
  );
}

// ── Program Card ─────────────────────────────────────────────────────────────
function ProgramCard({ program, onClick, compact, typeLabel, viewsLabel, minLabel }: {
  program: TvProgram; onClick: () => void; compact?: boolean;
  typeLabel?: (t: string) => string; viewsLabel?: string; minLabel?: string;
}) {
  const isLive = program.type === "live";
  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex gap-3 rounded-xl overflow-hidden bg-card border hover:border-violet-500/50 transition-all text-left",
        isLive ? "border-red-400/60" : "border-border",
        compact ? "p-2" : "p-3"
      )}
    >
      <div className={cn("relative flex-shrink-0 rounded-lg overflow-hidden bg-muted", compact ? "w-16 h-10" : "w-24 h-16")}>
        {program.thumbnailUrl ? (
          <img src={program.thumbnailUrl} alt={program.title} className="w-full h-full object-cover" />
        ) : (
          <div className={cn("w-full h-full bg-gradient-to-br flex items-center justify-center", titleGradient(program.title))}>
            <span className="text-white font-bold drop-shadow" style={{ fontSize: compact ? 14 : 20 }}>
              {program.title[0]?.toUpperCase() ?? "📺"}
            </span>
          </div>
        )}
        {isLive && (
          <div className="absolute top-1 left-1 flex items-center gap-0.5 bg-red-600 text-white text-[9px] font-bold px-1 py-0.5 rounded animate-pulse">
            <Radio size={7} /> LIVE
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center">
          <Play size={compact ? 12 : 16} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className={cn("font-semibold truncate", compact ? "text-xs" : "text-sm")}>{program.title}</p>
        <p className={cn("text-xs truncate", isLive ? "text-red-500 font-semibold" : "text-muted-foreground")}>
          {typeLabel ? typeLabel(program.type) : program.type}
        </p>
        {program.durationMinutes && !isLive && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Clock size={10} /> {program.durationMinutes} {minLabel ?? "min"}
          </p>
        )}
        {program.viewCount > 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Eye size={10} /> {program.viewCount.toLocaleString()} {viewsLabel ?? ""}
          </p>
        )}
      </div>
    </button>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function FlexaTV() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"live" | "schedule" | "films" | "series" | "programs">("live");
  const [playing, setPlaying] = useState<TvProgram | null>(null);
  const [now, setNow] = useState(new Date());
  const [adListing, setAdListing] = useState<BoostedListing | null>(null);
  const [adDone, setAdDone] = useState(false);
  const [search, setSearch] = useState("");
  const viewedRef = useRef<Set<number>>(new Set());

  const tlabel = (type: string) => ({
    film: t("tv.typeFilm"), series: t("tv.typeSeries"),
    program: t("tv.typeProgram"), news: t("tv.typeNews"), live: "🔴 LIVE",
  }[type] ?? type);

  // ── Broadcast state — shared from global BroadcastContext (no extra polling) ──
  const bs = useBroadcast();
  const broadcastActive = bs.state === "playing" || bs.state === "paused";

  // Update clock
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Fetch a random boosted listing for pre-roll ad
  useEffect(() => {
    fetch("/api/listings/boosted-feed?limit=5")
      .then(r => r.json())
      .then(d => {
        const list: any[] = d.listings ?? d.items ?? [];
        if (list.length > 0) {
          const pick = list[Math.floor(Math.random() * list.length)];
          setAdListing({
            id: pick.id,
            title: pick.title,
            price: pick.price ?? 0,
            currency: pick.currency ?? "HTG",
            images: pick.images ?? [],
            thumbnailUrl: pick.thumbnailUrl ?? pick.images?.[0] ?? null,
          });
        } else {
          setAdDone(true);
        }
      })
      .catch(() => setAdDone(true));
  }, []);

  const { data: nowPlaying } = useQuery<TvProgram | null>({
    queryKey: ["/tv/now-playing"],
    queryFn: () => fetch("/api/tv/now-playing").then(r => r.json()).then(d => d.program ?? null),
    refetchInterval: 60_000,
  });

  const { data: schedule } = useQuery<TvProgram[]>({
    queryKey: ["/tv/schedule"],
    queryFn: () => fetch("/api/tv/schedule").then(r => r.json()).then(d => d.schedule ?? []),
    refetchInterval: 120_000,
  });

  const { data: programs } = useQuery<TvProgram[]>({
    queryKey: ["/tv/programs"],
    queryFn: () => fetch("/api/tv/programs").then(r => r.json()).then(d => d.programs ?? []),
  });

  const { data: series } = useQuery<TvSeries[]>({
    queryKey: ["/tv/series"],
    queryFn: () => fetch("/api/tv/series").then(r => r.json()).then(d => d.series ?? []),
  });

  const viewMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/tv/programs/${id}/view`, { method: "POST" }),
  });

  function play(program: TvProgram) {
    setPlaying(program);
    if (!viewedRef.current.has(program.id)) {
      viewedRef.current.add(program.id);
      viewMutation.mutate(program.id);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Auto-play on first load
  useEffect(() => {
    if (!playing) {
      const liveProg = programs?.find(p => p.type === "live");
      if (liveProg) { play(liveProg); return; }
      if (nowPlaying) { play(nowPlaying); return; }
      const featured = programs?.find(p => p.isFeatured);
      if (featured) play(featured);
    }
  }, [nowPlaying, programs]); // eslint-disable-line

  const sq = search.toLowerCase().trim();
  const matchSearch = (p: TvProgram) => !sq || p.title.toLowerCase().includes(sq) || (p.description ?? "").toLowerCase().includes(sq);
  const matchSearchSched = (p: TvProgram) => !sq || p.title.toLowerCase().includes(sq);

  const livePrograms = (programs?.filter(p => p.type === "live") ?? []).filter(matchSearch);
  const films = (programs?.filter(p => p.type === "film") ?? []).filter(matchSearch);
  const episodeList = (programs?.filter(p => p.type === "series") ?? []).filter(matchSearch);
  const programList = (programs?.filter(p => p.type === "program" || p.type === "news") ?? []).filter(matchSearch);
  const upcoming = (schedule?.filter(p => p.scheduledAt && new Date(p.scheduledAt) > now) ?? []).filter(matchSearchSched).slice(0, 10);

  const currentAiring = schedule?.find(p => {
    if (!p.scheduledAt) return false;
    const start = new Date(p.scheduledAt).getTime();
    const end = p.endsAt ? new Date(p.endsAt).getTime() : start + (p.durationMinutes ?? 60) * 60_000;
    return now.getTime() >= start && now.getTime() <= end;
  });

  const tabs = [
    { key: "live",     label: "🔴 Live", show: livePrograms.length > 0 },
    { key: "schedule", label: t("tv.tabSchedule") },
    { key: "films",    label: t("tv.tabFilms") },
    { key: "series",   label: t("tv.tabSeries") },
    { key: "programs", label: t("tv.tabPrograms") },
  ];

  // Show pre-roll ad overlay
  const showAd = adListing !== null && !adDone;

  return (
    <>
      <div className="max-w-5xl mx-auto px-3 py-4 pb-24">
        {/* ── Header ── */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Tv size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              {t("tv.pageTitle")}
              <span className="inline-flex items-center gap-1 text-xs bg-red-500 text-white px-2 py-0.5 rounded-full font-semibold animate-pulse">
                <Radio size={10} /> {t("tv.live")}
              </span>
            </h1>
            <p className="text-xs text-muted-foreground">{t("tv.pageSubtitle")}</p>
          </div>
        </div>

        {/* ── Player ── */}
        <div className="mb-3">
          {broadcastActive ? (
            /* ── BROADCAST MODE ──────────────────────────────────────────────
               GlobalBroadcastPlayer (persistent iframe, never unmounts) tracks
               this placeholder div via getBoundingClientRect + ResizeObserver
               and positions itself exactly over it as a fixed overlay (z-8000).
               The overlays here (LIVE badge, paused screen) sit above it at z-8500.
            ── */
            <>
              {/* ── Player slot OR "TV off" placeholder ── */}
              {bs.dismissed ? (
                /* TV is OFF — viewer tapped the power button */
                <div
                  className="relative w-full bg-[#0d0d1a] rounded-xl flex flex-col items-center justify-center gap-3 border border-border"
                  style={{ paddingBottom: "56.25%" }}
                >
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="w-16 h-16 rounded-full bg-black/60 border border-white/10 flex items-center justify-center">
                      <img src="/flexa-tv-logo.png" alt="Flexa TV" className="w-10 h-10 object-contain opacity-40" />
                    </div>
                    <p className="text-white/40 text-xs">TV éteinte</p>
                    <button
                      onClick={() => bs.setDismissed(false)}
                      className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-4 py-2 rounded-full transition-colors"
                    >
                      <Radio size={12} /> Rallimen TV
                    </button>
                  </div>
                </div>
              ) : (
                /* Normal — GlobalBroadcastPlayer (z-8000) renders over this transparent slot */
                <div
                  id="broadcast-player-slot"
                  className="relative w-full rounded-xl"
                  style={{ paddingBottom: "56.25%", zIndex: 8500, position: "relative" }}
                >
                  {/* LIVE badge */}
                  <div className="absolute top-3 left-3 z-10 flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg animate-pulse pointer-events-none">
                    <Radio size={10} /> LIVE
                  </div>

                  {/* Power OFF button — top right */}
                  <button
                    onClick={() => bs.setDismissed(true)}
                    className="absolute top-2 right-2 z-20 w-8 h-8 rounded-full bg-black/60 hover:bg-black/90 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                    title="Étein TV"
                  >
                    {/* ⏻ power symbol */}
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M12 3v6" />
                      <path d="M6.3 5.7A8 8 0 1 0 17.7 5.7" />
                    </svg>
                  </button>

                  {/* Paused overlay */}
                  {bs.state === "paused" && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 gap-4">
                      <img src="/flexa-tv-logo.png" alt="Flexa TV" className="w-24 h-24 object-contain opacity-80" />
                      <div className="flex items-center gap-2 text-white">
                        <Pause size={20} className="text-red-400" />
                        <p className="text-sm font-semibold">Transmisyon an sispann…</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-2 px-1 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
                  <Radio size={8} /> LIVE
                </span>
                <p className="font-semibold text-sm">{bs.programTitle ?? "Flexa TV Live"}</p>
              </div>
            </>
          ) : playing ? (
            /* ── ON-DEMAND MODE: normal viewing ── */
            <>
              <VideoPlayer program={playing} onClose={() => setPlaying(null)} noVideoLabel={t("tv.noFilms")} />
              <div className="mt-2 px-1 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="font-semibold text-base">{playing.title}</h2>
                    {playing.type === "live" && (
                      <span className="inline-flex items-center gap-1 text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
                        <Radio size={8} /> LIVE
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {tlabel(playing.type)}{playing.durationMinutes && playing.type !== "live" ? ` · ${playing.durationMinutes} ${t("tv.min")}` : ""}
                  </p>
                  {playing.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{playing.description}</p>}
                </div>
              </div>
            </>
          ) : (
            <div className="aspect-video bg-[#0d0d1a] rounded-xl flex flex-col items-center justify-center gap-4 border border-border overflow-hidden relative">
              {/* Animated glow background */}
              <div className="absolute inset-0 bg-gradient-to-br from-violet-900/30 via-transparent to-blue-900/30 animate-pulse" />
              <img
                src="/flexa-tv-logo.png"
                alt="Flexa TV"
                className="w-36 h-36 object-contain relative z-10 drop-shadow-2xl"
                style={{ filter: "drop-shadow(0 0 24px rgba(139,92,246,0.6))" }}
              />
              <p className="text-sm text-white/50 relative z-10">{t("tv.clickToWatch")}</p>
            </div>
          )}
        </div>

        {/* ── Sponsored product banner (inline, below player) ── */}
        {showAd && <AdBanner listing={adListing!} onDone={() => setAdDone(true)} />}

        {/* ── Now-on-air banner ── */}
        {currentAiring && currentAiring.id !== playing?.id && (
          <button
            onClick={() => play(currentAiring)}
            className="w-full mb-4 flex items-center gap-3 bg-gradient-to-r from-violet-600 to-purple-700 text-white rounded-xl px-4 py-3 shadow-lg shadow-violet-500/20 hover:opacity-90 transition-opacity"
          >
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
              <Radio size={16} className="animate-pulse" />
            </div>
            <div className="flex-1 min-w-0 text-left">
              <p className="text-xs font-medium opacity-80">{t("tv.nowPlayingBanner")}</p>
              <p className="font-bold truncate">{currentAiring.title}</p>
            </div>
            <Play size={20} className="flex-shrink-0 opacity-80" />
          </button>
        )}

        {/* ── Cast tip — only when something is playing ── */}
        {(broadcastActive || !!playing) && (
          <div className="mb-4 flex items-center gap-2 text-xs text-muted-foreground bg-muted/60 rounded-xl px-3 py-2 border border-border">
            <Tv size={14} className="shrink-0 text-violet-500" />
            <p>💡 <strong>Smart TV / Chromecast / AirPlay:</strong> {t("tv.castTip")}</p>
          </div>
        )}

        {/* ── Search bar ── */}
        <div className="relative mb-3">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechèche pwogram, fim, seri…"
            className="w-full pl-8 pr-8 py-2 text-sm bg-muted/60 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/40 transition-all"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={13} />
            </button>
          )}
        </div>

        {/* ── Tabs ── */}
        <div className="flex gap-1 bg-muted rounded-xl p-1 mb-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {tabs.filter(tab => tab.show !== false).map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={cn(
                "flex-shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-all whitespace-nowrap",
                activeTab === tab.key
                  ? tab.key === "live"
                    ? "bg-red-500 text-white shadow-sm"
                    : "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* ── Live Tab ── */}
        {activeTab === "live" && (
          <div className="space-y-2">
            {livePrograms.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Radio size={40} className="mx-auto mb-3 opacity-30" />
                <p>{t("tv.noLive")}</p>
              </div>
            ) : livePrograms.map(p => (
              <ProgramCard key={p.id} program={p} onClick={() => play(p)} typeLabel={tlabel} viewsLabel={t("tv.views")} minLabel={t("tv.min")} />
            ))}
          </div>
        )}

        {/* ── Schedule Tab ── */}
        {activeTab === "schedule" && (
          <div className="space-y-2">
            {upcoming.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar size={40} className="mx-auto mb-3 opacity-30" />
                <p>{t("tv.noSchedule")}</p>
              </div>
            ) : upcoming.map(p => (
              <button
                key={p.id}
                onClick={() => play(p)}
                className="w-full flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-violet-500/50 transition-all text-left"
              >
                {p.thumbnailUrl ? (
                  <img src={p.thumbnailUrl} alt={p.title} className="w-14 h-10 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className="w-14 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                    <Film size={16} className="text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">{p.title}</p>
                  <p className="text-xs text-muted-foreground">{tlabel(p.type)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-xs font-mono font-bold text-violet-500">{p.scheduledAt ? formatTime(p.scheduledAt) : ""}</p>
                  <p className="text-xs text-muted-foreground">{p.durationMinutes ? `${p.durationMinutes}${t("tv.min")}` : ""}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* ── Films Tab ── */}
        {activeTab === "films" && (
          <div className="space-y-2">
            {films.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Film size={40} className="mx-auto mb-3 opacity-30" />
                <p>{t("tv.noFilms")}</p>
              </div>
            ) : films.map(p => (
              <ProgramCard key={p.id} program={p} onClick={() => play(p)} typeLabel={tlabel} viewsLabel={t("tv.views")} minLabel={t("tv.min")} />
            ))}
          </div>
        )}

        {/* ── Series Tab ── */}
        {activeTab === "series" && (
          <div className="space-y-4">
            {(series ?? []).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <List size={40} className="mx-auto mb-3 opacity-30" />
                <p>{t("tv.noSeries")}</p>
              </div>
            ) : (series ?? []).map(s => {
              const eps = episodeList.filter(p => p.seriesId === s.id).sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0));
              return (
                <div key={s.id}>
                  <div className="flex items-center gap-2 mb-2">
                    {s.thumbnailUrl && <img src={s.thumbnailUrl} alt={s.title} className="w-8 h-8 rounded-lg object-cover" />}
                    <div>
                      <p className="font-bold text-sm">{s.title}</p>
                      {s.description && <p className="text-xs text-muted-foreground">{s.description}</p>}
                    </div>
                  </div>
                  <div className="space-y-1 pl-2 border-l-2 border-violet-500/30">
                    {eps.map(ep => <ProgramCard key={ep.id} program={ep} onClick={() => play(ep)} compact typeLabel={tlabel} viewsLabel={t("tv.views")} minLabel={t("tv.min")} />)}
                    {eps.length === 0 && <p className="text-xs text-muted-foreground py-2">{t("tv.noEpisodes")}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Programs Tab ── */}
        {activeTab === "programs" && (
          <div className="space-y-2">
            {programList.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Radio size={40} className="mx-auto mb-3 opacity-30" />
                <p>{t("tv.noPrograms")}</p>
              </div>
            ) : programList.map(p => (
              <ProgramCard key={p.id} program={p} onClick={() => play(p)} typeLabel={tlabel} viewsLabel={t("tv.views")} minLabel={t("tv.min")} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
