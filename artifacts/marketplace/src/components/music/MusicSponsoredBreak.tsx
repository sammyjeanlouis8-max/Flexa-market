/**
 * Flexa Music sponsored ad break — foreground video + background audio handoff.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { ExternalLink, Maximize2, Pause, Volume2, VolumeX } from "lucide-react";
import {
  finishMusicAdBreak,
  productPathForMusicAd,
  recordSponsoredAdHeard,
  subscribeMusicAdBreak,
  trackMusicAdEvent,
  type AdBreakRequest,
  type MusicSponsoredAd,
} from "@/lib/musicAdBreak";
import {
  getMusicState,
  musicRequestPause,
  subscribeMusicState,
} from "@/lib/musicStore";

function fmt(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const COMPACT_ROUTES = [
  /^\/checkout(?:\/|$)/,
  /^\/orders\/\d+/,
  /^\/sell(?:\/|$)/,
  /^\/listings\/create/,
  /^\/wallet(?:\/|$)/,
  /^\/booster\/create/,
  /^\/auth\//,
];

function needsCompact(path: string): boolean {
  return COMPACT_ROUTES.some((rx) => rx.test(path));
}

type Active = AdBreakRequest & { startedAt: number };

export default function MusicSponsoredBreakHost() {
  const [location, setLocation] = useLocation();
  const [active, setActive] = useState<Active | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [musicSnap, setMusicSnap] = useState(() => getMusicState());

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const bgAudioRef = useRef<HTMLAudioElement | null>(null);
  const positionRef = useRef(0);
  const impressionRef = useRef(false);
  const finishedRef = useRef(false);
  const userStoppedRef = useRef(false);
  const activeRef = useRef<Active | null>(null);
  activeRef.current = active;

  useEffect(() => subscribeMusicState(() => setMusicSnap(getMusicState())), []);

  const complete = useCallback((continuePlayback: boolean) => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    const v = videoRef.current;
    const a = bgAudioRef.current;
    try { v?.pause(); } catch { /* */ }
    try { a?.pause(); } catch { /* */ }
    if (a) {
      try { a.removeAttribute("src"); a.load(); } catch { /* */ }
      bgAudioRef.current = null;
    }
    setActive(null);
    setExpanded(false);
    finishMusicAdBreak({ continuePlayback: continuePlayback && !userStoppedRef.current });
  }, []);

  const recordImpression = useCallback((ad: MusicSponsoredAd, background: boolean) => {
    if (impressionRef.current) return;
    impressionRef.current = true;
    recordSponsoredAdHeard(ad, { background });
    trackMusicAdEvent(ad.id, "video_view");
  }, []);

  useEffect(() => {
    return subscribeMusicAdBreak((req) => {
      finishedRef.current = false;
      impressionRef.current = false;
      userStoppedRef.current = false;
      positionRef.current = 0;
      setCurrent(0);
      setDuration(0);
      setPaused(false);
      setMuted(false);
      setExpanded(false);
      musicRequestPause();
      setActive({ ...req, startedAt: Date.now() });
    });
  }, []);

  // Dev/manual QA: allow forcing the break UI without waiting for 10 songs.
  useEffect(() => {
    (window as any).__flexaShowMusicAdBreak = (ad?: Partial<MusicSponsoredAd>) => {
      const listing: MusicSponsoredAd = {
        id: ad?.id ?? 900001,
        title: ad?.title ?? "Café haïtien d'exception",
        price: ad?.price ?? 0,
        thumbnail: ad?.thumbnail ?? "https://images.unsplash.com/photo-1447933601403-0c6688de566e?auto=format&fit=crop&w=400&q=60",
        boostVideoUrl: ad?.boostVideoUrl ?? "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
        sellerName: ad?.sellerName ?? "Kafe Lakay",
        boostCtaType: "view_product",
        boostExternalLink: null,
        boostWhatsappNumber: null,
        boostCtaText: "View product",
        status: "available",
        isVideoOnly: false,
      };
      finishedRef.current = false;
      impressionRef.current = false;
      userStoppedRef.current = false;
      positionRef.current = 0;
      musicRequestPause();
      setActive({
        hasNextSong: true,
        onContinue: () => {},
        ad: listing,
        startedAt: Date.now(),
      });
    };
    return () => {
      try { delete (window as any).__flexaShowMusicAdBreak; } catch { /* */ }
    };
  }, []);

  // Foreground video vs background audio handoff at the same position.
  useEffect(() => {
    if (!active?.ad.boostVideoUrl) return;
    const url = active.ad.boostVideoUrl;

    const ensureBgAudio = () => {
      let a = bgAudioRef.current;
      if (!a) {
        a = new Audio();
        a.preload = "auto";
        a.setAttribute("playsinline", "");
        bgAudioRef.current = a;
      }
      if (a.src !== new URL(url, window.location.origin).href && !a.src.endsWith(url)) {
        a.src = url;
      }
      return a;
    };

    const onVis = () => {
      const v = videoRef.current;
      const hidden = document.visibilityState === "hidden";
      const pos = positionRef.current;
      if (hidden) {
        try { v?.pause(); } catch { /* */ }
        const a = ensureBgAudio();
        try {
          if (Math.abs((a.currentTime || 0) - pos) > 0.35) a.currentTime = pos;
        } catch { /* */ }
        a.muted = muted;
        a.play().catch(() => {});
        recordImpression(active.ad, true);
        if ("mediaSession" in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({
            title: active.ad.title,
            artist: active.ad.sellerName ? `${active.ad.sellerName} · Sponsored` : "Sponsored",
            artwork: active.ad.thumbnail
              ? [{ src: active.ad.thumbnail, sizes: "512x512", type: "image/jpeg" }]
              : [],
          });
          navigator.mediaSession.playbackState = "playing";
          navigator.mediaSession.setActionHandler("pause", () => {
            userStoppedRef.current = true;
            try { a.pause(); } catch { /* */ }
            try { v?.pause(); } catch { /* */ }
            setPaused(true);
          });
          navigator.mediaSession.setActionHandler("play", () => {
            userStoppedRef.current = false;
            a.play().catch(() => {});
            setPaused(false);
          });
          navigator.mediaSession.setActionHandler("stop", () => {
            userStoppedRef.current = true;
            complete(false);
          });
        }
      } else {
        const a = bgAudioRef.current;
        const handoff = a && !a.paused ? a.currentTime : pos;
        positionRef.current = handoff;
        setCurrent(handoff);
        try { a?.pause(); } catch { /* */ }
        if (v) {
          try {
            if (Math.abs((v.currentTime || 0) - handoff) > 0.35) v.currentTime = handoff;
          } catch { /* */ }
          v.muted = muted;
          if (!userStoppedRef.current) {
            v.play().catch(() => {});
            setPaused(false);
          }
        }
        recordImpression(active.ad, false);
      }
    };

    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [active, muted, complete, recordImpression]);

  // Wire video element events when active
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !active) return;
    const url = active.ad.boostVideoUrl!;
    if (v.getAttribute("src") !== url) {
      v.src = url;
      v.load();
    }
    const onTime = () => {
      positionRef.current = v.currentTime;
      setCurrent(v.currentTime);
      if (v.currentTime > 0.4) {
        recordImpression(active.ad, document.visibilityState === "hidden");
      }
    };
    const onMeta = () => {
      if (Number.isFinite(v.duration)) setDuration(v.duration);
    };
    const onEnded = () => complete(true);
    const onErr = () => complete(true); // fail open → next song
    const onPlay = () => setPaused(false);
    const onPause = () => {
      if (document.visibilityState === "visible") setPaused(true);
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("ended", onEnded);
    v.addEventListener("error", onErr);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    if (document.visibilityState === "visible" && !userStoppedRef.current) {
      v.play().catch(() => {
        // Autoplay blocked — try muted then unmute on gesture is handled by controls
        v.muted = true;
        setMuted(true);
        v.play().catch(() => complete(true));
      });
    }
    // Fail-open if video never starts within 3s
    const startTimer = window.setTimeout(() => {
      if (!impressionRef.current && (v.currentTime || 0) < 0.2 && v.paused) {
        complete(true);
      }
    }, 3000);
    return () => {
      window.clearTimeout(startTimer);
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("ended", onEnded);
      v.removeEventListener("error", onErr);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [active, complete, recordImpression]);

  // Background audio ended
  useEffect(() => {
    const a = bgAudioRef.current;
    if (!a || !active) return;
    const onEnded = () => complete(true);
    const onTime = () => {
      positionRef.current = a.currentTime;
      if (document.visibilityState === "hidden") setCurrent(a.currentTime);
    };
    const onErr = () => complete(true);
    a.addEventListener("ended", onEnded);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("error", onErr);
    return () => {
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("error", onErr);
    };
  }, [active, complete]);

  if (!active) return null;

  const compact = needsCompact(location) && !expanded;
  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  const productPath = productPathForMusicAd(active.ad);
  const ctaLabel = active.ad.boostCtaText?.trim() || "View product";
  const showCta = !!(productPath || active.ad.boostExternalLink);

  const openProduct = () => {
    trackMusicAdEvent(active.ad.id, "click");
    if (productPath) setLocation(productPath);
    else if (active.ad.boostExternalLink) window.open(active.ad.boostExternalLink, "_blank", "noopener");
  };

  const togglePlay = () => {
    const v = videoRef.current;
    const a = bgAudioRef.current;
    if (paused) {
      userStoppedRef.current = false;
      if (document.visibilityState === "hidden") a?.play().catch(() => {});
      else v?.play().catch(() => {});
      setPaused(false);
    } else {
      userStoppedRef.current = true;
      try { v?.pause(); } catch { /* */ }
      try { a?.pause(); } catch { /* */ }
      setPaused(true);
    }
  };

  const body = compact ? (
    <div
      className="fixed z-[90] left-3 right-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6 md:left-auto md:right-6 md:w-[360px]"
      data-testid="music-sponsored-compact"
    >
      <div
        className="rounded-2xl overflow-hidden border border-white/10 shadow-xl"
        style={{ background: "#121212" }}
      >
        <div className="flex items-center gap-3 p-3">
          <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-black shrink-0">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted={muted}
            />
            <span className="absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "#FF6B00", color: "#111" }}>
              Sponsored
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white text-sm font-bold truncate">{active.ad.sellerName || active.ad.title}</p>
            <p className="text-white/50 text-xs truncate">{active.ad.title}</p>
            <div className="mt-1.5 h-1 rounded-full bg-white/15 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "#FF6B00" }} />
            </div>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white/80"
            aria-label="Expand ad"
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </div>
    </div>
  ) : (
    <div
      className="fixed inset-0 z-[95] flex flex-col"
      style={{ background: "#0A0A0A", paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      data-testid="music-sponsored-break"
    >
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex items-end gap-0.5 h-5">
            <span className="w-1 rounded-sm bg-[#FF6B00]" style={{ height: 8 }} />
            <span className="w-1 rounded-sm bg-[#FF6B00]" style={{ height: 14 }} />
            <span className="w-1 rounded-sm bg-[#FF6B00]" style={{ height: 10 }} />
          </div>
          <span className="text-white font-black tracking-tight">Flexa Music</span>
        </div>
      </header>

      <div className="flex-1 flex flex-col px-4 min-h-0">
        <div className="relative flex-1 min-h-[200px] rounded-xl overflow-hidden bg-black">
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-contain"
            playsInline
            muted={muted}
          />
          <span
            className="absolute top-3 left-3 text-[11px] font-extrabold uppercase tracking-wide px-2 py-1 rounded"
            style={{ background: "#FF6B00", color: "#111" }}
          >
            Sponsored
          </span>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-8">
            <div className="flex items-center gap-2 text-white">
              <button type="button" onClick={togglePlay} aria-label={paused ? "Play" : "Pause"}>
                {paused ? (
                  <span className="inline-block w-0 h-0 border-y-[6px] border-y-transparent border-l-[10px] border-l-white" />
                ) : (
                  <Pause size={18} fill="white" />
                )}
              </button>
              <span className="text-xs tabular-nums text-white/80">
                {fmt(current)} / {fmt(duration)}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-white/25 overflow-hidden">
                <div className="h-full rounded-full bg-white relative" style={{ width: `${pct}%` }}>
                  <span className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full" style={{ background: "#FF6B00" }} />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const next = !muted;
                  setMuted(next);
                  if (videoRef.current) videoRef.current.muted = next;
                  if (bgAudioRef.current) bgAudioRef.current.muted = next;
                }}
                aria-label={muted ? "Unmute" : "Mute"}
              >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 py-3">
          <div
            className="w-11 h-11 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
            style={{ background: "#0B3022" }}
          >
            {active.ad.thumbnail ? (
              <img src={active.ad.thumbnail} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-[#FF6B00] font-black text-sm">
                {(active.ad.sellerName || "Ad")[0]}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-white font-bold truncate">{active.ad.sellerName || "Sponsored"}</p>
            <p className="text-white/45 text-xs truncate">{active.ad.title}</p>
          </div>
          {showCta ? (
            <button
              type="button"
              onClick={openProduct}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-extrabold"
              style={{ background: "#FF6B00", color: "#111" }}
              data-testid="music-sponsored-cta"
            >
              {ctaLabel}
              <ExternalLink size={14} />
            </button>
          ) : null}
        </div>
      </div>

      <div
        className="mx-4 mb-3 flex items-center gap-3 rounded-2xl px-3 py-2.5"
        style={{ background: "#0B3022", border: "1px solid rgba(255,255,255,0.1)" }}
      >
        <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-black/40">
          {musicSnap.track?.cover_url ? (
            <img src={musicSnap.track.cover_url} alt="" className="w-full h-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold" style={{ color: "#A3A3A3" }}>Music paused</p>
          <p className="text-white text-sm font-bold truncate">
            {musicSnap.track?.title || "Flexa Music"}
          </p>
        </div>
        <Pause size={16} className="text-white/40" />
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
