/**
 * Recent Sponsored Ads — ads heard in the background while listening.
 */
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Headphones, Play, Trash2, X } from "lucide-react";
import {
  clearSponsoredHistory,
  dismissSponsoredBanner,
  getSponsoredHistory,
  type MusicSponsoredHistoryItem,
} from "@/lib/musicAdBreak";
import {
  getMusicState,
  musicRequestPause,
  musicRequestPlay,
  musicSeek,
} from "@/lib/musicStore";

function timeAgo(ms: number): string {
  const d = Date.now() - ms;
  if (d < 60_000) return "Just now";
  if (d < 3_600_000) return `${Math.floor(d / 60_000)}m ago`;
  if (d < 86_400_000) return `${Math.floor(d / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString();
}

export default function MusicSponsoredAds() {
  const [, setLocation] = useLocation();
  const [items, setItems] = useState<MusicSponsoredHistoryItem[]>(() => getSponsoredHistory());
  const [watch, setWatch] = useState<MusicSponsoredHistoryItem | null>(null);
  const [expired, setExpired] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const resumeRef = useRef<{ time: number; shouldResume: boolean } | null>(null);

  useEffect(() => {
    dismissSponsoredBanner();
    setItems(getSponsoredHistory());
  }, []);

  const openWatch = (item: MusicSponsoredHistoryItem) => {
    const s = getMusicState();
    resumeRef.current = {
      time: s.currentTime,
      shouldResume: s.playing || (!!s.track && !s.playing),
    };
    // Pause music only when replay starts; remember if user already paused.
    const wasPlaying = s.playing;
    resumeRef.current.shouldResume = wasPlaying;
    if (wasPlaying) musicRequestPause();
    setExpired(false);
    setWatch(item);
  };

  const closeWatch = () => {
    setWatch(null);
    setExpired(false);
    const resume = resumeRef.current;
    resumeRef.current = null;
    if (!resume) return;
    try {
      musicSeek(resume.time);
    } catch { /* */ }
    if (resume.shouldResume) {
      musicRequestPlay().catch(() => {});
    }
  };

  const onClear = () => {
    if (!items.length) return;
    if (!window.confirm("Clear recent sponsored ads history?")) return;
    clearSponsoredHistory();
    setItems([]);
  };

  return (
    <div
      className="min-h-[100dvh] text-white"
      style={{ background: "#121212", paddingBottom: "env(safe-area-inset-bottom)" }}
      data-testid="music-sponsored-ads"
    >
      <header
        className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 border-b border-white/10"
        style={{ background: "rgba(18,18,18,0.94)", paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
      >
        <button
          type="button"
          onClick={() => setLocation("/music")}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white/80"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="flex items-end gap-0.5 h-4">
            <span className="w-1 rounded-sm bg-[#FF6B00]" style={{ height: 6 }} />
            <span className="w-1 rounded-sm bg-[#FF6B00]" style={{ height: 12 }} />
            <span className="w-1 rounded-sm bg-[#FF6B00]" style={{ height: 8 }} />
          </div>
          <span className="font-black tracking-tight">Flexa Music</span>
        </div>
        {items.length > 0 ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[#FF6B00] text-sm font-bold inline-flex items-center gap-1"
          >
            <Trash2 size={14} /> Clear
          </button>
        ) : null}
      </header>

      <div className="px-4 pt-5 pb-2">
        <h1 className="text-2xl font-black tracking-tight">Recent Sponsored Ads</h1>
        <p className="text-white/45 text-sm mt-1">Heard while listening</p>
      </div>

      <div className="px-4 pb-24 space-y-3 mt-2">
        {items.length === 0 ? (
          <p className="text-white/40 text-sm py-10 text-center">
            Ads you hear while Flexa Music runs in the background will show up here.
          </p>
        ) : (
          items.map((item) => (
            <div
              key={item.entryId}
              className="flex items-center gap-3 rounded-2xl p-2.5"
              style={{ background: "#1A1A1A", border: "1px solid rgba(255,255,255,0.08)" }}
            >
              <div className="w-[72px] h-[52px] rounded-lg overflow-hidden bg-black/50 shrink-0">
                {item.thumbnail ? (
                  <img src={item.thumbnail} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/30 text-xs">Ad</div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-sm truncate">{item.sellerName || item.title}</p>
                <p className="text-white/45 text-xs flex items-center gap-1 mt-0.5">
                  <Headphones size={12} />
                  {item.background ? "Heard in background" : "Heard"} · {timeAgo(item.heardAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => openWatch(item)}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-extrabold"
                style={{ background: "#FF6B00", color: "#111" }}
                data-testid="music-sponsored-watch"
              >
                <Play size={14} fill="#111" /> Watch
              </button>
            </div>
          ))
        )}
      </div>

      {watch ? (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-black/95"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
          data-testid="music-sponsored-replay"
        >
          <div className="flex justify-end px-4 py-3">
            <button type="button" onClick={closeWatch} className="text-white p-2" aria-label="Close">
              <X size={24} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center px-4 min-h-0">
            {expired ? (
              <p className="text-white/60 text-center text-sm max-w-xs">
                This campaign is no longer available. It has been removed from your history.
              </p>
            ) : (
              <video
                ref={videoRef}
                key={watch.entryId}
                src={watch.boostVideoUrl}
                className="max-h-[70vh] w-full max-w-lg rounded-xl bg-black"
                controls
                playsInline
                autoPlay
                onEnded={closeWatch}
                onError={() => {
                  setExpired(true);
                  setItems((prev) => {
                    const next = prev.filter((x) => x.entryId !== watch.entryId);
                    try {
                      localStorage.setItem("flexa_music_sponsored_history_v1", JSON.stringify(next));
                    } catch { /* */ }
                    return next;
                  });
                }}
              />
            )}
          </div>
          <p className="text-center text-white/40 text-xs pb-8 px-6">
            Manual replays do not affect your listening ad schedule.
          </p>
        </div>
      ) : null}
    </div>
  );
}
