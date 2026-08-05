import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Tv, Play, Clock, Calendar, Eye, Radio, Film, List, X,
  Maximize, Minimize, Volume2, VolumeX, Pause, ShoppingBag, Search,
  Share2, Monitor, Copy, Check, Airplay, Loader2, Star, ChevronDown,
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

type YtsMovie = {
  imdbCode: string;
  title: string;
  description: string;
  year: number | null;
  durationMinutes: number | null;
  rating: number | null;
  genres: string[];
  thumbnailUrl: string;
  videoUrl: string | null;
};

const YTS_GENRES = ["All","Action","Adventure","Animation","Comedy","Crime","Drama","Horror","Romance","Sci-Fi","Thriller"] as const;
type YtsGenre = typeof YTS_GENRES[number];

function ytsToProgram(m: YtsMovie): TvProgram {
  return {
    id: -1,
    title: m.title,
    description: m.description || null,
    type: "film",
    videoUrl: m.videoUrl,
    videoKey: null,
    thumbnailUrl: m.thumbnailUrl || null,
    durationMinutes: m.durationMinutes,
    scheduledAt: null,
    endsAt: null,
    seriesId: null,
    episodeNumber: null,
    seasonNumber: null,
    isFeatured: false,
    viewCount: 0,
  };
}

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

// Facebook/Instagram block iframe embedding via X-Frame-Options — return null so
// VideoPlayer shows the "no video" placeholder instead of the Facebook error page.
function isBlockedEmbedUrl(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h.includes("facebook.com") || h.includes("instagram.com") ||
           h.includes("fb.watch") || h.includes("fb.com");
  } catch { return false; }
}

function getEmbedInfo(program: TvProgram): EmbedInfo | null {
  if (program.videoUrl && isBlockedEmbedUrl(program.videoUrl)) return null;
  if (program.videoUrl) {
    const ytId = getYouTubeId(program.videoUrl);
    if (ytId) {
      const params = new URLSearchParams({ autoplay: "1", rel: "0", modestbranding: "1", controls: "1", playsinline: "1" });
      return { url: `https://www.youtube.com/embed/${ytId}?${params}`, isIframe: true, isDirect: false };
    }
    const vm = program.videoUrl.match(/vimeo\.com\/(\d+)/);
    if (vm) return { url: `https://player.vimeo.com/video/${vm[1]}?autoplay=1`, isIframe: true, isDirect: false };
    // Archive.org — iframe with autoplay=1 so film starts immediately
    if (program.videoUrl.includes("archive.org/embed/")) {
      const sep = program.videoUrl.includes("?") ? "&" : "?";
      return { url: `${program.videoUrl}${sep}autoplay=1&start=0`, isIframe: true, isDirect: false };
    }
    // Dailymotion — ensure autoplay param
    if (program.videoUrl.includes("dailymotion.com/embed/")) {
      const sep = program.videoUrl.includes("?") ? "&" : "?";
      const url = program.videoUrl.includes("autoplay=1") ? program.videoUrl : `${program.videoUrl}${sep}autoplay=1`;
      return { url, isIframe: true, isDirect: false };
    }
    // vidsrc.to / vidsrc.me — IMDB/TMDB embed (iframe, no autoplay param needed)
    if (program.videoUrl.includes("vidsrc.to/embed/") || program.videoUrl.includes("vidsrc.me/embed/")) {
      return { url: program.videoUrl, isIframe: true, isDirect: false };
    }
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

// ── Smart TV / Share Action Bar ───────────────────────────────────────────────
function PlayerActions({ title, videoUrl }: { title: string; videoUrl?: string | null }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const shareUrl = "https://flexamarket.com/tv";
  const qrUrl    = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(shareUrl)}&color=7c3aed&bgcolor=ffffff`;

  async function handleShare() {
    const data = { title, text: `${title} — Flexa TV`, url: shareUrl };
    try {
      if (navigator.share && navigator.canShare?.(data)) {
        await navigator.share(data);
      } else {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch { /* user cancelled */ }
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      {/* ── Action bar ── */}
      <div className="flex items-center gap-2 mt-2 mb-3">
        {/* Share button */}
        <button
          onClick={handleShare}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border bg-muted/60 hover:bg-muted text-sm font-semibold transition-colors"
        >
          <Share2 size={14} className="text-violet-500" />
          {t("tv.shareBtn")}
        </button>

        {/* Smart TV button */}
        <button
          onClick={() => setShowModal(true)}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl border border-border bg-muted/60 hover:bg-muted text-sm font-semibold transition-colors"
        >
          <Monitor size={14} className="text-violet-500" />
          {t("tv.smartTvBtn")}
        </button>
      </div>

      {/* ── Smart TV Modal ── */}
      {showModal && (
        <div
          className="fixed inset-0 z-[99999] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowModal(false)}
        >
          <div
            className="w-full max-w-lg bg-background rounded-t-3xl p-6 pb-10 space-y-4 shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor size={18} className="text-violet-500" />
                <h3 className="font-bold text-base">{t("tv.watchOnTv")}</h3>
              </div>
              <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground">
                <X size={20} />
              </button>
            </div>

            {/* QR code */}
            <div className="flex flex-col items-center gap-2 py-2">
              <img
                src={qrUrl}
                alt="QR flexamarket.com/tv"
                className="w-40 h-40 rounded-xl border border-border shadow"
              />
              <p className="text-xs text-muted-foreground text-center">{t("tv.qrScanTip")}</p>
              <code className="text-xs font-mono bg-muted px-3 py-1 rounded-lg text-violet-600 dark:text-violet-400 select-all">
                flexamarket.com/tv
              </code>
            </div>

            {/* Copy link */}
            <button
              onClick={handleCopy}
              className={cn(
                "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-colors",
                copied
                  ? "bg-green-500 text-white"
                  : "bg-violet-600 hover:bg-violet-700 text-white"
              )}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? t("tv.linkCopied") : t("tv.copyLink")}
            </button>

            {/* Platform tips */}
            <div className="space-y-2.5 pt-1">
              {[
                { icon: <Airplay size={14} className="text-blue-500" />,   text: t("tv.airplayTip") },
                { icon: <Monitor size={14} className="text-red-500" />,  text: t("tv.chromecastTip") },
                { icon: <Tv size={14} className="text-violet-500" />,    text: t("tv.smartTvOpenTip") },
              ].map((row, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="flex-shrink-0 mt-0.5">{row.icon}</span>
                  <span>{row.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
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
      {/* Controls — always visible (mobile has no hover state) */}
      <div className={cn("absolute top-2 right-2 z-20 flex gap-1", isFullscreen && "opacity-100")}>
        {embed?.isDirect && (
          <>
            <button onClick={toggleMute} className="bg-black/60 rounded-full p-1.5 text-white active:bg-black/90">{isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
            <button onClick={togglePlay} className="bg-black/60 rounded-full p-1.5 text-white active:bg-black/90">{isPlaying ? <Pause size={14} /> : <Play size={14} />}</button>
          </>
        )}
        <button onClick={toggleFullscreen} className="bg-black/60 rounded-full p-1.5 text-white active:bg-black/90">{isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />}</button>
        {onClose && !isFullscreen && <button onClick={onClose} className="bg-black/60 rounded-full p-1.5 text-white active:bg-black/90"><X size={14} /></button>}
        {isFullscreen && <button onClick={toggleFullscreen} className="bg-black/60 rounded-full p-1.5 text-white active:bg-black/90"><X size={14} /></button>}
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
  const [imgErr, setImgErr] = useState(false);
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
        {program.thumbnailUrl && !imgErr ? (
          <img src={program.thumbnailUrl} alt={program.title} onError={() => setImgErr(true)} className="w-full h-full object-cover" />
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

/** Netflix-style hero card for the first/top live stream — full-width landscape. */
function LiveHeroCard({ program, onClick }: { program: TvProgram; onClick: () => void }) {
  const { t } = useTranslation();
  const [imgErr, setImgErr] = useState(false);
  return (
    <button
      onClick={onClick}
      className="group relative w-full overflow-hidden rounded-2xl text-left focus:outline-none mb-2"
      style={{ paddingBottom: "52%" }}
    >
      <div className="absolute inset-0">
        {program.thumbnailUrl && !imgErr ? (
          <img
            src={program.thumbnailUrl}
            alt={program.title}
            onError={() => setImgErr(true)}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className={cn("w-full h-full bg-gradient-to-br", titleGradient(program.title))} />
        )}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
        {/* Live badge */}
        <div className="absolute top-3 left-3 flex items-center gap-1 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse shadow-lg">
          <Radio size={8} /> LIVE
        </div>
        {/* Views */}
        {program.viewCount > 0 && (
          <div className="absolute top-3 right-3 flex items-center gap-1 bg-black/60 text-white text-[9px] px-2 py-0.5 rounded-full">
            <Eye size={8} /> {program.viewCount.toLocaleString()}
          </div>
        )}
        {/* Bottom info */}
        <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
          <p className="text-white font-bold text-base line-clamp-2 drop-shadow mb-2">{program.title}</p>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 bg-white text-black text-xs font-bold px-4 py-1.5 rounded-full shadow-lg group-hover:bg-white/90 transition-colors">
              <Play size={12} className="fill-black" /> {t("tv.watchNow")}
            </span>
          </div>
        </div>
        {/* Hover vignette */}
        <div className="absolute inset-0 ring-2 ring-inset ring-white/0 group-hover:ring-white/20 rounded-2xl transition-all" />
      </div>
    </button>
  );
}

/** Netflix-style compact landscape card — used in the 2-col live grid. */
function LiveGridCard({ program, onClick }: { program: TvProgram; onClick: () => void }) {
  const [imgErr, setImgErr] = useState(false);
  return (
    <button
      onClick={onClick}
      className="group relative w-full overflow-hidden rounded-xl text-left focus:outline-none"
    >
      <div className="relative w-full overflow-hidden rounded-xl bg-[#141414]" style={{ paddingBottom: "56.25%" }}>
        <div className="absolute inset-0">
          {program.thumbnailUrl && !imgErr ? (
            <img
              src={program.thumbnailUrl}
              alt={program.title}
              onError={() => setImgErr(true)}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className={cn("w-full h-full bg-gradient-to-br", titleGradient(program.title))}>
              <span className="text-white font-bold text-lg drop-shadow m-auto">
                {program.title[0]?.toUpperCase() ?? "📺"}
              </span>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
          {/* LIVE badge */}
          <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 bg-red-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full animate-pulse">
            <Radio size={6} /> LIVE
          </div>
          {/* Views */}
          {program.viewCount > 0 && (
            <div className="absolute top-1.5 right-1.5 flex items-center gap-0.5 bg-black/60 text-white text-[8px] px-1.5 py-0.5 rounded-full">
              <Eye size={7} /> {program.viewCount.toLocaleString()}
            </div>
          )}
          {/* Play overlay */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
            <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow">
              <Play size={13} className="text-black fill-black ml-0.5" />
            </div>
          </div>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] font-semibold leading-tight line-clamp-2 text-foreground px-0.5">
        {program.title}
      </p>
    </button>
  );
}

/** Netflix-style vertical poster card — used in the Films grid. */
function PosterCard({ program, onClick, minLabel }: {
  program: TvProgram; onClick: () => void; minLabel?: string;
}) {
  const isLive = program.type === "live";
  const [imgErr, setImgErr] = useState(false);
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col text-left w-full focus:outline-none"
    >
      {/* Poster — 2:3 portrait ratio */}
      <div className="relative w-full overflow-hidden rounded-lg bg-[#141414]" style={{ paddingBottom: "150%" }}>
        <div className="absolute inset-0">
          {program.thumbnailUrl && !imgErr ? (
            <img
              src={program.thumbnailUrl}
              alt={program.title}
              onError={() => setImgErr(true)}
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className={cn("w-full h-full bg-gradient-to-br flex items-center justify-center", titleGradient(program.title))}>
              <span className="text-white font-bold text-2xl drop-shadow">
                {program.title[0]?.toUpperCase() ?? "🎬"}
              </span>
            </div>
          )}

          {/* Dark vignette at bottom for text legibility */}
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 to-transparent pointer-events-none" />

          {/* LIVE badge */}
          {isLive && (
            <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 bg-red-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded animate-pulse">
              <Radio size={6} /> LIVE
            </div>
          )}

          {/* Duration badge */}
          {program.durationMinutes && !isLive && (
            <div className="absolute bottom-1.5 left-1.5 text-[9px] text-white/80 font-medium bg-black/60 rounded px-1 py-0.5">
              {program.durationMinutes}{minLabel ?? "min"}
            </div>
          )}

          {/* Play overlay on hover */}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/30">
            <div className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
              <Play size={16} className="text-black fill-black ml-0.5" />
            </div>
          </div>
        </div>
      </div>

      {/* Title below poster */}
      <p className="mt-1.5 text-[11px] font-semibold leading-tight line-clamp-2 text-foreground px-0.5">
        {program.title}
      </p>
    </button>
  );
}

// ── Series Tab — Netflix-style 3-col poster grid ──────────────────────────────
function SeriesGrid({
  series,
  episodeList,
  selectedSeriesId,
  setSelectedSeriesId,
  play,
  tlabel,
}: {
  series: TvSeries[];
  episodeList: TvProgram[];
  selectedSeriesId: number | null;
  setSelectedSeriesId: (id: number | null) => void;
  play: (p: TvProgram) => void;
  tlabel: (type: string) => string;
}) {
  const { t } = useTranslation();
  const [sImgErr, setSImgErr] = useState<Record<number, boolean>>({});
  const selectedSeries = series.find(s => s.id === selectedSeriesId) ?? null;
  const selectedEps = selectedSeries
    ? episodeList.filter(p => p.seriesId === selectedSeries.id).sort((a, b) => (a.episodeNumber ?? 0) - (b.episodeNumber ?? 0))
    : [];

  if (series.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <List size={40} className="mx-auto mb-3 opacity-30" />
        <p>{t("tv.noSeries")}</p>
      </div>
    );
  }

  return (
    <div>
      {/* 3-column poster grid */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        {series.map(s => {
          const isSelected = s.id === selectedSeriesId;
          return (
            <button
              key={s.id}
              onClick={() => setSelectedSeriesId(isSelected ? null : s.id)}
              className="group relative flex flex-col text-left w-full focus:outline-none"
            >
              <div className="relative w-full overflow-hidden rounded-lg bg-[#141414]" style={{ paddingBottom: "150%" }}>
                <div className="absolute inset-0">
                  {s.thumbnailUrl && !sImgErr[s.id] ? (
                    <img
                      src={s.thumbnailUrl}
                      alt={s.title}
                      onError={() => setSImgErr(p => ({ ...p, [s.id]: true }))}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className={cn("w-full h-full bg-gradient-to-br flex items-center justify-center", titleGradient(s.title))}>
                      <span className="text-white font-bold text-xl drop-shadow">{s.title[0]?.toUpperCase() ?? "📺"}</span>
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 to-transparent" />
                  {isSelected && <div className="absolute inset-0 ring-2 ring-violet-500 rounded-lg" />}
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                    <div className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                      <Play size={16} className="text-black fill-black ml-0.5" />
                    </div>
                  </div>
                </div>
              </div>
              <p className="mt-1.5 text-[11px] font-semibold leading-tight line-clamp-2 text-foreground px-0.5">{s.title}</p>
            </button>
          );
        })}
      </div>

      {/* Episode list for selected series */}
      {selectedSeries && (
        <div className="bg-muted/40 rounded-2xl p-3 border border-border mb-4">
          <div className="flex items-center gap-2 mb-3">
            {selectedSeries.thumbnailUrl && (
              <img src={selectedSeries.thumbnailUrl} alt={selectedSeries.title} className="w-10 h-14 rounded-lg object-cover flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">{selectedSeries.title}</p>
              {selectedSeries.description && (
                <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{selectedSeries.description}</p>
              )}
            </div>
            <button onClick={() => setSelectedSeriesId(null)} className="text-muted-foreground hover:text-foreground flex-shrink-0">
              <X size={16} />
            </button>
          </div>
          <div className="space-y-1.5">
            {selectedEps.map(ep => (
              <ProgramCard key={ep.id} program={ep} onClick={() => play(ep)} compact typeLabel={tlabel} viewsLabel={t("tv.views")} minLabel={t("tv.min")} />
            ))}
            {selectedEps.length === 0 && (
              <p className="text-xs text-muted-foreground py-2 text-center">{t("tv.noEpisodes")}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function FlexaTV() {
  const { t } = useTranslation();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<"live" | "schedule" | "films" | "series" | "programs">("live");
  const [playing, setPlaying] = useState<TvProgram | null>(null);
  const [selectedSeriesId, setSelectedSeriesId] = useState<number | null>(null);
  const [now, setNow] = useState(new Date());
  const [adListing, setAdListing] = useState<BoostedListing | null>(null);
  const [adDone, setAdDone] = useState(false);
  const [search, setSearch] = useState("");
  const [movieGenre, setMovieGenre] = useState<YtsGenre>("All");
  const [moviePage, setMoviePage] = useState(1);
  const viewedRef = useRef<Set<number>>(new Set());

  const tlabel = (type: string) => ({
    film: t("tv.typeFilm"), series: t("tv.typeSeries"),
    program: t("tv.typeProgram"), news: t("tv.typeNews"), live: "🔴 LIVE",
  }[type] ?? type);

  // ── Broadcast state — shared from global BroadcastContext (no extra polling) ──
  const bs = useBroadcast();
  const broadcastActive = bs.state === "playing" || bs.state === "paused";

  // (popstate intercept removed — Layout.tsx handleBack navigates to "/" on /tv)

  // ── Suppress broadcast mini-player while a film is playing in VideoPlayer ────
  // When the user selects a film, the broadcast goes to mini mode and competes
  // with the film. Dismiss it so only the film plays. Restore when film closes.
  useEffect(() => {
    if (!broadcastActive) return;
    if (playing) {
      bs.setDismissed(true);
    } else {
      bs.setDismissed(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, broadcastActive]);

  // ── Resume film when mini-player is tapped while already on /tv ─────────────
  useEffect(() => {
    const handler = () => {
      const fp = bs.filmPlayer;
      if (!fp) return;
      setPlaying({
        id: fp.programId,
        title: fp.title,
        description: fp.description,
        type: fp.type as TvProgram["type"],
        videoUrl: fp.videoUrl,
        videoKey: fp.videoKey,
        thumbnailUrl: fp.thumbnailUrl,
        durationMinutes: null,
        scheduledAt: null,
        endsAt: null,
        seriesId: null,
        episodeNumber: null,
        seasonNumber: null,
        isFeatured: false,
        viewCount: 0,
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("flexa:resume-film", handler);
    return () => window.removeEventListener("flexa:resume-film", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs.filmPlayer]);

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

  const movieSearchQ = activeTab === "films" ? search : "";
  const { data: moviesData, isFetching: moviesFetching } = useQuery<{ numFound: number; page: number; results: YtsMovie[] }>({
    queryKey: ["/tv/movies", movieGenre, moviePage, movieSearchQ],
    queryFn: () => {
      const params = new URLSearchParams({ page: String(moviePage) });
      if (movieGenre !== "All") params.set("genre", movieGenre);
      if (movieSearchQ) params.set("q", movieSearchQ);
      return fetch(`/api/tv/movies?${params}`).then(r => r.json());
    },
    staleTime: 5 * 60_000,
    enabled: activeTab === "films",
  });

  const viewMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/tv/programs/${id}/view`, { method: "POST" }),
  });

  function play(program: TvProgram) {
    setPlaying(program);
    // Track in context so mini-player can continue if user navigates away
    bs.setFilmPlayer({
      videoUrl: program.videoUrl,
      videoKey: program.videoKey,
      title: program.title,
      description: program.description,
      type: program.type,
      programId: program.id,
      thumbnailUrl: program.thumbnailUrl,
    });
    if (!viewedRef.current.has(program.id)) {
      viewedRef.current.add(program.id);
      viewMutation.mutate(program.id);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Auto-play on first load only (run once when data first arrives)
  // Store a ref so we never re-trigger once the user has made a choice.
  const autoPlayedRef = useRef(false);
  useEffect(() => {
    if (autoPlayedRef.current || playing) return;
    // Skip live programs with blocked embed URLs (Facebook/Instagram) — they show an error page
    const liveProg = programs?.find(p => p.type === "live" && !isBlockedEmbedUrl(p.videoUrl ?? ""));
    if (liveProg) { autoPlayedRef.current = true; play(liveProg); return; }
    if (nowPlaying && !isBlockedEmbedUrl(nowPlaying.videoUrl ?? "")) { autoPlayedRef.current = true; play(nowPlaying); return; }
    const featured = programs?.find(p => p.isFeatured);
    if (featured) { autoPlayedRef.current = true; play(featured); }
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
          {playing ? (
            /* ── USER SELECTED A FILM — play it; broadcast becomes mini-player ── */
            <>
              {/* id lets GlobalBroadcastPlayer detect the VideoPlayer is active and suppress its own mini */}
              <div id="flexa-tv-video-player">
                <VideoPlayer
                  program={playing}
                  onClose={() => setPlaying(null)}
                  noVideoLabel={t("tv.noVideo")}
                />
              </div>
              <PlayerActions title={playing.title} videoUrl={playing.videoUrl} />
            </>
          ) : (broadcastActive || bs.filmPlayer !== null) ? (
            /* ── BROADCAST MODE ──────────────────────────────────────────────
               GlobalBroadcastPlayer (persistent iframe, never unmounts) tracks
               this placeholder div via getBoundingClientRect + setInterval(100ms)
               and positions itself exactly over it as a fixed overlay (z-8000).
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
                    <p className="text-white/40 text-xs">{t("tv.tvOff")}</p>
                    <button
                      onClick={() => bs.setDismissed(false)}
                      className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold px-4 py-2 rounded-full transition-colors"
                    >
                      <Radio size={12} /> {t("tv.turnOnTv")}
                    </button>
                  </div>
                </div>
              ) : (
                /* Spacing placeholder only — GlobalBroadcastPlayer (z-9000) renders
                   all UI (LIVE badge, power button, controls) as a fixed overlay. */
                <div
                  id="broadcast-player-slot"
                  className="w-full rounded-xl bg-black"
                  style={{ paddingBottom: "56.25%" }}
                />
              )}

              <div className="mt-2 px-1 flex items-center gap-2">
                {broadcastActive ? (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-red-500 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
                    <Radio size={8} /> LIVE
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] bg-purple-600 text-white px-2 py-0.5 rounded-full font-bold">
                    <Film size={8} /> Film
                  </span>
                )}
                <p className="font-semibold text-sm">
                  {broadcastActive ? (bs.programTitle ?? "Flexa TV Live") : (bs.filmPlayer?.title ?? "Flexa TV")}
                </p>
              </div>
              <PlayerActions title={broadcastActive ? (bs.programTitle ?? "Flexa TV Live") : (bs.filmPlayer?.title ?? "Flexa TV")} />
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

        {/* Cast tip removed — replaced by Share + Smart TV action buttons in PlayerActions */}

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

        {/* ── Live Tab — Netflix-style ── */}
        {activeTab === "live" && (
          <div>
            {livePrograms.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Radio size={40} className="mx-auto mb-3 opacity-30" />
                <p>{t("tv.noLive")}</p>
              </div>
            ) : (
              <>
                {/* Hero — first (most-viewed) live */}
                <LiveHeroCard program={livePrograms[0]} onClick={() => play(livePrograms[0])} />

                {/* 2-column grid for remaining live streams + inline ads every 4 cards */}
                {livePrograms.length > 1 && (() => {
                  const rest = livePrograms.slice(1);
                  const rows: React.ReactNode[] = [];
                  for (let i = 0; i < rest.length; i += 2) {
                    rows.push(
                      <div key={rest[i].id} className="grid grid-cols-2 gap-2 mb-2">
                        <LiveGridCard program={rest[i]} onClick={() => play(rest[i])} />
                        {rest[i + 1] && <LiveGridCard program={rest[i + 1]} onClick={() => play(rest[i + 1])} />}
                      </div>
                    );
                    // Repeat Flexa Market ad every 4 cards (after user dismissed the first)
                    if ((i + 2) % 4 === 0 && adListing) {
                      rows.push(<AdBanner key={`ad-${i}`} listing={adListing} onDone={() => {}} />);
                    }
                  }
                  return rows;
                })()}
              </>
            )}
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

        {/* ── Films Tab — genre filters + YTS HD movies ── */}
        {activeTab === "films" && (
          <div>
            {/* Genre chips */}
            <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3" style={{ scrollbarWidth: "none" }}>
              {YTS_GENRES.map(g => (
                <button
                  key={g}
                  onClick={() => { setMovieGenre(g); setMoviePage(1); }}
                  className={cn(
                    "flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all border",
                    movieGenre === g
                      ? "bg-violet-600 text-white border-violet-600 shadow"
                      : "bg-muted text-muted-foreground border-border hover:border-violet-400 hover:text-foreground"
                  )}
                >
                  {g}
                </button>
              ))}
            </div>

            {/* DB films (manually added) — shown first if any */}
            {films.length > 0 && (
              <div className="grid grid-cols-3 gap-2 mb-4">
                {films.map(p => (
                  <PosterCard key={p.id} program={p} onClick={() => play(p)} minLabel={t("tv.min")} />
                ))}
              </div>
            )}

            {/* YTS movie grid */}
            {moviesFetching && (moviesData?.results ?? []).length === 0 ? (
              <div className="flex flex-col items-center py-16 gap-3 text-muted-foreground">
                <Loader2 size={32} className="animate-spin opacity-50" />
                <p className="text-sm">Chaje fim yo…</p>
              </div>
            ) : (moviesData?.results ?? []).length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Film size={40} className="mx-auto mb-3 opacity-30" />
                <p className="text-sm">Pa gen rezilta pou {movieGenre}</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2">
                  {(moviesData?.results ?? []).map((m) => (
                    <button
                      key={m.imdbCode || m.title}
                      onClick={() => play(ytsToProgram(m))}
                      className="group relative flex flex-col text-left w-full focus:outline-none"
                    >
                      <div className="relative w-full overflow-hidden rounded-lg bg-[#141414]" style={{ paddingBottom: "150%" }}>
                        <div className="absolute inset-0">
                          {m.thumbnailUrl ? (
                            <img
                              src={m.thumbnailUrl}
                              alt={m.title}
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                              loading="lazy"
                            />
                          ) : (
                            <div className={cn("w-full h-full bg-gradient-to-br flex items-center justify-center", titleGradient(m.title))}>
                              <Film size={24} className="text-white/60" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                            <div className="w-9 h-9 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                              <Play size={16} className="text-black fill-black ml-0.5" />
                            </div>
                          </div>
                          {m.rating !== null && m.rating > 0 && (
                            <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-black/70 rounded px-1 py-0.5">
                              <Star size={8} className="text-yellow-400 fill-yellow-400" />
                              <span className="text-[9px] text-white font-bold">{m.rating.toFixed(1)}</span>
                            </div>
                          )}
                          {m.year && (
                            <div className="absolute bottom-1 left-1">
                              <span className="text-[9px] text-white/80 font-medium">{m.year}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <p className="mt-1.5 text-[11px] font-semibold leading-tight line-clamp-2 text-foreground px-0.5">{m.title}</p>
                    </button>
                  ))}
                </div>

                {/* Load more */}
                {(moviesData?.results.length ?? 0) >= 24 && (
                  <button
                    onClick={() => setMoviePage(p => p + 1)}
                    disabled={moviesFetching}
                    className="mt-4 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:border-violet-500 transition-all disabled:opacity-50"
                  >
                    {moviesFetching ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}
                    {moviesFetching ? "Chaje…" : "Wè plis fim"}
                  </button>
                )}
              </>
            )}
          </div>
        )}

        {/* ── Series Tab — Netflix-style poster grid ── */}
        {activeTab === "series" && (
          <SeriesGrid
            series={series ?? []}
            episodeList={episodeList}
            selectedSeriesId={selectedSeriesId}
            setSelectedSeriesId={setSelectedSeriesId}
            play={play}
            tlabel={tlabel}
          />
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
