/**
 * Flexa Music — dark SoundCloud-style streaming page
 * Views: "home" feed  ←→  "player" playlist/track detail
 * Audio: HTML5 + MediaSession API (background / lock-screen)
 * Likes: localStorage (Set<number>)
 * Mixes: auto-computed from DB tracks by genre
 * Impressions: logged after 31 s listen via /api/music/impression
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  Play, Pause, Heart, Search, SkipForward, SkipBack,
  Volume2, VolumeX, Shuffle, X, Download, MoreHorizontal,
  Bell, MessageCircle, ChevronLeft, ChevronDown, Plus, Loader2, Globe,
  Music2, UploadCloud, BarChart2, CheckCircle, AlertCircle, Image as ImageIcon,
  Pencil, Trash2, ShoppingBag, Send, Radio,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { useLocation } from "wouter";
import { useMusicUpload } from "@/contexts/MusicUpload";
import { gAudio, patchMusicState, setFlexaMusicMounted, musicPlayNext, musicPlayPrev, musicSeek } from "@/lib/musicStore";

// ── Types ──────────────────────────────────────────────────────────────────────
type Track = {
  id: number;
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  audio_url: string | null;
  cover_url: string | null;
  duration_seconds: number | null;
  type: string;
  monetization_type: string;      // "stream" | "sale"
  price_usd: number | null;       // only set when monetization_type === "sale"
  is_featured: boolean;
  play_count: number;
  valid_impressions: number;
  artist_user_id: number | null;
  lyrics?: string | null;         // song lyrics (optional, added later)
  is_artist_verified?: boolean;   // ✓ badge on track cards
};

type Mix = {
  id: string;
  label: string;       // "MIX 1" etc.
  subtitle: string;
  tracks: Track[];
  cover: string | null;
  gradient: string;
};

type MusicComment = {
  id: number;
  content: string;
  created_at: string;
  user_id: number;
  user_name: string;
  user_avatar: string | null;
  user_is_verified: boolean;
};

type View = "home" | "player" | "upload" | "artist-plan" | "paywall" | "artist";

// ── Constants ──────────────────────────────────────────────────────────────────
const LIKED_KEY = "flexa_music_liked_v2";
const MIX_GRADIENTS = [
  "linear-gradient(135deg,#1a0533,#4b0082)",
  "linear-gradient(135deg,#033a1a,#0a7a3a)",
  "linear-gradient(135deg,#1a1500,#7a5500)",
];

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDur(s: number | null): string {
  if (!s) return "0:00";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${m}:${String(sec).padStart(2,"0")}`;
}

function fmtTotal(tracks: Track[]): string {
  const total = tracks.reduce((s, t) => s + (t.duration_seconds ?? 0), 0);
  return fmtDur(total);
}

function fmtPlays(n: number): string {
  if (n >= 1_000_000) return `${(n / 1e6).toFixed(1)} M`;
  if (n >= 1_000)     return `${(n / 1000).toFixed(1)} k`;
  return String(n);
}

function getSessionId(): string {
  const key = "flexa_music_session";
  let id = sessionStorage.getItem(key);
  if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id); }
  return id;
}

function getLiked(): Set<number> {
  try { return new Set(JSON.parse(localStorage.getItem(LIKED_KEY) ?? "[]")); }
  catch { return new Set(); }
}
function saveLiked(set: Set<number>) {
  localStorage.setItem(LIKED_KEY, JSON.stringify([...set]));
}

// ── Impression tracker ─────────────────────────────────────────────────────────
const sentImpressions = new Set<number>();
async function logImpression(trackId: number, sec: number) {
  if (sentImpressions.has(trackId)) return;
  sentImpressions.add(trackId);
  try {
    await fetch("/api/music/impression", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trackId, sessionId: getSessionId(), listeningSeconds: sec }),
    });
  } catch { /* non-fatal */ }
}

// ── Download helper ────────────────────────────────────────────────────────────
// Paid tracks always go through the secure backend endpoint (which checks
// the music_purchases table).  Free tracks are fetched directly.
async function downloadTrack(track: Track) {
  const token = localStorage.getItem("flexamarket_token") ?? sessionStorage.getItem("flexamarket_token") ?? "";

  if (track.monetization_type === "sale") {
    // Secure download — server verifies purchase
    try {
      const res = await fetch(`/api/music/${track.id}/download`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 403) {
        alert("Ou dwe achte chante sa anvan ou ka downloade li.");
        return;
      }
      if (!res.ok) return;
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = Object.assign(document.createElement("a"), {
        href: url, download: `${track.title} - ${track.artist}.mp3`,
      });
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { /* silent — download UI already shows "not purchased" */ }
    return;
  }

  // Free track — direct blob download
  if (!track.audio_url) return;
  try {
    const res  = await fetch(track.audio_url);
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement("a"), {
      href: url, download: `${track.title} - ${track.artist}.mp3`,
    });
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch { window.open(track.audio_url, "_blank"); }
}

// ── Avatar placeholder ─────────────────────────────────────────────────────────
function Avatar({ src, name, size = 36, className = "" }: { src?: string | null; name?: string; size?: number; className?: string }) {
  const init = (name ?? "?")[0]?.toUpperCase() ?? "?";
  if (src) return <img src={src} alt={name} className={`rounded-full object-cover shrink-0 ${className}`} style={{ width: size, height: size }} />;
  return (
    <div className={`rounded-full flex items-center justify-center shrink-0 font-bold text-white ${className}`}
      style={{ width: size, height: size, background: "linear-gradient(135deg,#7c3aed,#c026d3)", fontSize: size * 0.38 }}>
      {init}
    </div>
  );
}

// ── Cover art ─────────────────────────────────────────────────────────────────
function CoverArt({ src, title, size = 48, radius = 8 }: { src?: string | null; title?: string; size?: number; radius?: number }) {
  return (
    <div className="shrink-0 overflow-hidden flex items-center justify-center bg-[#2a2a2a]"
      style={{ width: size, height: size, borderRadius: radius }}>
      {src
        ? <img src={src} alt={title} className="w-full h-full object-cover" />
        : <Music2 size={size * 0.4} className="text-[#555]" />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Bottom sheet "More" options
// ══════════════════════════════════════════════════════════════════════════════
function MoreSheet({ track, liked, onClose, onLike, onDownload, onBuy, isAdmin, onEdit, onDelete, canDownload = true }:
  { track: Track; liked: boolean; onClose: () => void; onLike: () => void; onDownload: () => void;
    onBuy?: () => void;
    isAdmin?: boolean; onEdit?: (t: Track) => void; onDelete?: (id: number) => void;
    /** false when track is "sale" and user has not purchased it yet */
    canDownload?: boolean; }) {
  const { t } = useTranslation();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isPaidLocked = track.monetization_type === "sale" && !canDownload;

  return (
    <div className="fixed inset-0 z-[60] flex items-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div className="relative w-full rounded-t-3xl overflow-hidden"
        style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)" }}
        onClick={e => e.stopPropagation()}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>
        {/* Track info */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-white/5">
          <CoverArt src={track.cover_url} title={track.title} size={44} radius={8} />
          <div className="min-w-0">
            <p className="text-white font-bold text-sm truncate">{track.title}</p>
            <p className="text-white/50 text-xs truncate">{track.artist}</p>
          </div>
        </div>
        {/* Buy CTA — shown only when track is locked */}
        {isPaidLocked && (
          <div className="px-5 py-3 border-b border-white/5">
            <button
              onClick={() => { onBuy?.(); onClose(); }}
              className="w-full rounded-2xl py-3.5 font-black text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
              style={{ background: "linear-gradient(135deg,#7c3aed,#c026d3)", color: "#fff",
                       boxShadow: "0 6px 20px rgba(124,58,237,0.4)" }}>
              <span>💳</span>
              <span>{t("music.buyTrack", { price: Number(track.price_usd ?? 0).toFixed(2) })}</span>
            </button>
          </div>
        )}
        {/* Options */}
        {[
          { icon: liked ? "❤️" : "🤍", label: liked ? t("music.removeFromFavorites") : t("music.addToFavorites"), action: () => { onLike(); onClose(); } },
          ...(isPaidLocked ? [] : [{ icon: "⬇️", label: t("music.download"), action: () => { onDownload(); onClose(); } }]),
          { icon: "🔗", label: t("music.shareTrack"),  action: () => {
            const url = `${window.location.origin}/music/play/${track.id}`;
            if (navigator.share) {
              navigator.share({ title: track.title, text: `${track.title} — ${track.artist}`, url }).catch(() => {});
            } else {
              navigator.clipboard.writeText(url).catch(() => {});
            }
            onClose();
          }},
          { icon: "🚩", label: t("music.reportTrack"), action: onClose },
        ].map(({ icon, label, action, locked }: { icon: string; label: string; action: () => void; locked?: boolean }) => (
          <button key={label} onClick={locked ? undefined : action}
            disabled={!!locked}
            className={`w-full flex items-center gap-4 px-5 py-4 text-left transition-colors ${locked ? "opacity-50 cursor-not-allowed" : "hover:bg-white/5"}`}>
            <span className="text-xl w-7 text-center">{icon}</span>
            <span className={`text-sm font-medium ${locked ? "text-white/40" : "text-white"}`}>{label}</span>
          </button>
        ))}
        {/* Admin-only actions */}
        {isAdmin && (
          <div className="border-t border-white/5 mt-1">
            <button onClick={() => { onEdit?.(track); onClose(); }}
              className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-white/5 transition-colors">
              <Pencil size={18} className="text-violet-400 w-7" />
              <span className="text-violet-300 text-sm font-medium">{t("music.editTrack")}</span>
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-3 px-5 py-3">
                <span className="text-white/60 text-sm flex-1">{t("music.confirmDeleteQ")}</span>
                <button onClick={() => { onDelete?.(track.id); onClose(); }}
                  className="px-4 py-2 rounded-full text-xs font-bold text-white"
                  style={{ background: "#dc2626" }}>
                  {t("music.confirmYes")}
                </button>
                <button onClick={() => setConfirmDelete(false)}
                  className="px-4 py-2 rounded-full text-xs font-bold text-white/60"
                  style={{ background: "rgba(255,255,255,0.08)" }}>
                  {t("music.confirmNo")}
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)}
                className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-red-900/20 transition-colors">
                <Trash2 size={18} className="text-red-400 w-7" />
                <span className="text-red-400 text-sm font-medium">{t("music.deleteTrack")}</span>
              </button>
            )}
          </div>
        )}
        <div className="pb-safe" style={{ height: 24 }} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Admin — quick edit modal
// ══════════════════════════════════════════════════════════════════════════════
function EditTrackModal({ track, onClose, onSaved }:
  { track: Track; onClose: () => void; onSaved: (updated: Track) => void }) {
  const [title,     setTitle]     = useState(track.title);
  const [artist,    setArtist]    = useState(track.artist);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(track.cover_url);
  const [saving,    setSaving]    = useState(false);
  const [errMsg,    setErrMsg]    = useState<string | null>(null);
  const coverRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  const onPickCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCoverFile(f);
    setCoverPreview(URL.createObjectURL(f));
  };

  const save = async () => {
    if (!title.trim()) { setErrMsg(t("upload.errTitle")); return; }
    setSaving(true);
    setErrMsg(null);
    try {
      const token = localStorage.getItem("flexamarket_token") ?? sessionStorage.getItem("flexamarket_token") ?? "";

      let coverUrl: string | undefined;

      // ── If a new cover was picked, upload it to Cloudinary first ──────────
      if (coverFile) {
        const sigRes = await fetch("/api/music/upload-signature", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!sigRes.ok) throw new Error("Cloudinary signature failed");
        const sig = await sigRes.json();
        const fd = new FormData();
        fd.append("file", coverFile);
        fd.append("api_key", sig.apiKey);
        fd.append("timestamp", String(sig.timestamp));
        fd.append("signature", sig.cover.signature);
        fd.append("folder",    sig.cover.folder);
        fd.append("format",    sig.cover.format ?? "jpg");
        const cldRes = await fetch(
          `https://api.cloudinary.com/v1_1/${sig.cloudName}/image/upload`,
          { method: "POST", body: fd }
        );
        const cld = await cldRes.json();
        if (!cld.secure_url) throw new Error(cld.error?.message ?? "Cover upload failed");
        coverUrl = cld.secure_url;
      }

      const res = await fetch(`/api/admin/music/${track.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          title:  title.trim(),
          artist: artist.trim(),
          ...(coverUrl ? { cover_url: coverUrl } : {}),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      const data = await res.json();
      onSaved({
        ...track, ...data.track,
        title:     title.trim(),
        artist:    artist.trim(),
        cover_url: coverUrl ?? track.cover_url,
      });
      onClose();
    } catch (e: any) {
      setErrMsg(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm mx-4 mb-8 sm:mb-0 rounded-2xl p-5 space-y-4"
        style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)" }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between">
          <p className="text-white font-bold text-base">{t("music.editTrack")}</p>
          <button onClick={onClose}><X size={18} className="text-white/40" /></button>
        </div>

        {/* ── Cover picker ── */}
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => coverRef.current?.click()}
            className="w-16 h-16 rounded-xl overflow-hidden shrink-0 flex items-center justify-center relative group"
            style={{ background: "#2a2a2a", border: "2px dashed rgba(255,255,255,0.12)" }}>
            {coverPreview
              ? <img src={coverPreview} alt="" className="w-full h-full object-cover" />
              : <ImageIcon size={22} className="text-white/20" />}
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
              <ImageIcon size={16} className="text-white" />
            </div>
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-white/60 text-xs font-semibold">{t("upload.coverImage")}</p>
            <button type="button" onClick={() => coverRef.current?.click()}
              className="text-violet-400 text-xs font-bold mt-0.5">
              {coverPreview ? t("upload.changeCover") : t("upload.addCoverPhoto")}
            </button>
          </div>
          <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={onPickCover} />
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/40 mb-1 block">{t("upload.trackTitle")}</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full bg-white/5 text-white text-sm rounded-xl px-3 py-2.5 outline-none border border-white/10 focus:border-violet-500"
            />
          </div>
          <div>
            <label className="text-xs text-white/40 mb-1 block">{t("upload.artistName")}</label>
            <input value={artist} onChange={e => setArtist(e.target.value)}
              className="w-full bg-white/5 text-white text-sm rounded-xl px-3 py-2.5 outline-none border border-white/10 focus:border-violet-500"
            />
          </div>
        </div>

        {errMsg && (
          <div className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <AlertCircle size={14} className="text-red-400 shrink-0" />
            <p className="text-red-400 text-xs">{errMsg}</p>
          </div>
        )}

        <button disabled={saving || !title.trim()} onClick={save}
          className="w-full py-3 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-40"
          style={{ background: "linear-gradient(135deg,#7c3aed,#c026d3)" }}>
          {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : t("music.save")}
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Animated "Now Playing" bars — used in mini player & track list
// ══════════════════════════════════════════════════════════════════════════════
function NowPlayingBars({ playing, size = "sm" }: { playing: boolean; size?: "sm" | "xs" }) {
  const h  = size === "xs" ? [7, 11, 8, 13, 6] : [9, 15, 11, 17, 8];
  const px = size === "xs" ? 1.5 : 2;
  const w  = size === "xs" ? 2 : 2.5;
  return (
    <div className="flex items-end" style={{ gap: `${px}px`, height: `${h[3]}px` }}>
      {h.map((maxH, i) => (
        <div key={i} style={{
          width: `${w}px`, borderRadius: "2px",
          background: "linear-gradient(to top,#8b5cf6,#c026d3)",
          animation: playing ? `bar${i} 0.${6 + i * 2}s ease-in-out ${i * 0.07}s infinite alternate` : "none",
          height: playing ? `${maxH}px` : `${Math.round(maxH * 0.3)}px`,
          transition: playing ? "none" : "height 0.3s",
        }} />
      ))}
      <style>{`
        @keyframes bar0 { from{height:3px} to{height:${h[0]}px} }
        @keyframes bar1 { from{height:4px} to{height:${h[1]}px} }
        @keyframes bar2 { from{height:3px} to{height:${h[2]}px} }
        @keyframes bar3 { from{height:5px} to{height:${h[3]}px} }
        @keyframes bar4 { from{height:3px} to{height:${h[4]}px} }
      `}</style>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Mini Player (bottom bar)
// ══════════════════════════════════════════════════════════════════════════════
interface PlayerState { track: Track | null; playing: boolean; currentTime: number; duration: number; muted: boolean; volume: number; }

function MiniPlayer({ state, audioRef, onPrev, onNext, onClose, onToggle, onMute, onSeek, onExpand }:
  { state: PlayerState; audioRef: React.RefObject<HTMLAudioElement>;
    onPrev: () => void; onNext: () => void; onClose: () => void;
    onToggle: () => void; onMute: () => void;
    onSeek: (t: number) => void; onExpand: () => void; }) {
  const { track, playing, currentTime, duration, muted } = state;
  const isDragging = useRef(false);

  if (!track) return null;
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  // ── Seek helpers (works for both mouse and touch) ──────────────────────────
  const seekFromX = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
    onSeek(ratio * (duration || 0));
  };

  return (
    <div
      className="fixed left-0 right-0 mx-3 z-40 rounded-2xl select-none"
      style={{
        bottom: "calc(4rem + env(safe-area-inset-bottom, 0px) + 8px)",
        background: "linear-gradient(135deg,#1c0934,#2a1648)",
        border: "1px solid rgba(139,92,246,0.45)",
        boxShadow: "0 -4px 32px rgba(100,50,200,0.25), 0 8px 32px rgba(0,0,0,0.6)",
        overflow: "visible",
      }}>

      {/* ── NOW PLAYING pill badge ── */}
      {playing && (
        <div className="absolute -top-3 left-4 flex items-center gap-1.5 px-2 py-0.5 rounded-full"
          style={{ background: "linear-gradient(90deg,#7c3aed,#c026d3)", boxShadow: "0 2px 8px rgba(124,58,237,0.6)" }}>
          <NowPlayingBars playing={playing} size="xs" />
          <span className="text-[9px] font-black text-white tracking-widest uppercase">Now Playing</span>
        </div>
      )}

      {/* Rounded container for inner content */}
      <div className="rounded-2xl overflow-hidden">
        {/* ── Draggable progress bar — tall touch target, thin visual bar ── */}
        <div
          className="h-5 flex items-center cursor-pointer relative"
          style={{ touchAction: "none" }}
          onClick={e => seekFromX(e.clientX, e.currentTarget)}
          onTouchStart={e => {
            isDragging.current = true;
            seekFromX(e.touches[0].clientX, e.currentTarget);
          }}
          onTouchMove={e => {
            if (!isDragging.current) return;
            e.preventDefault();
            seekFromX(e.touches[0].clientX, e.currentTarget);
          }}
          onTouchEnd={() => { isDragging.current = false; }}
        >
          <div className="absolute left-0 right-0 h-1 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }} />
          <div className="absolute left-0 h-1 rounded-full"
            style={{ width: `${pct}%`, background: "linear-gradient(90deg,#8b5cf6,#ec4899)" }} />
          <div className="absolute w-4 h-4 rounded-full bg-white -translate-x-1/2"
            style={{ left: `${pct}%`, boxShadow: "0 0 0 3px rgba(139,92,246,0.6), 0 2px 6px rgba(0,0,0,0.5)" }} />
        </div>

        <div className="flex items-center gap-2.5 px-3 pb-3 pt-1">
          {/* Cover — tap to expand */}
          <button onClick={onExpand} className="shrink-0 relative">
            <CoverArt src={track.cover_url} title={track.title} size={42} radius={10} />
            {playing && (
              <div className="absolute inset-0 rounded-[10px] flex items-end justify-center pb-0.5"
                style={{ background: "rgba(0,0,0,0.35)" }}>
                <NowPlayingBars playing={playing} size="xs" />
              </div>
            )}
          </button>

          {/* Info + time */}
          <button onClick={onExpand} className="flex-1 min-w-0 text-left">
            <p className="text-white text-xs font-bold truncate leading-tight">{track.title}</p>
            <p className="text-white/50 text-[10px] truncate">{track.artist}</p>
            {/* Live time progress under title */}
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-violet-300 text-[9px] font-mono tabular-nums">{fmtDur(Math.floor(currentTime))}</span>
              {duration > 0 && <span className="text-white/20 text-[9px]">/ {fmtDur(Math.floor(duration))}</span>}
            </div>
          </button>

          {/* Controls */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button onClick={onPrev} className="w-8 h-8 flex items-center justify-center active:scale-90 transition-transform">
              <SkipBack size={14} className="text-white/70" />
            </button>
            <button onClick={onToggle}
              className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: "linear-gradient(135deg,#7c3aed,#c026d3)", boxShadow: "0 4px 12px rgba(124,58,237,0.5)" }}>
              {playing
                ? <Pause size={15} className="text-white" />
                : <Play  size={15} className="text-white ml-0.5" />}
            </button>
            <button onClick={onNext} className="w-8 h-8 flex items-center justify-center active:scale-90 transition-transform">
              <SkipForward size={14} className="text-white/70" />
            </button>
            <button onClick={onMute} className="w-7 h-7 flex items-center justify-center">
              {muted ? <VolumeX size={12} className="text-white/40" /> : <Volume2 size={12} className="text-white/60" />}
            </button>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center">
              <X size={13} className="text-white/30" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// HOME VIEW
// ══════════════════════════════════════════════════════════════════════════════
// ── Upload View ───────────────────────────────────────────────────────────────
// Upload runs through the global MusicUploadContext so it survives navigation.
// This component only handles the form; the XHR lives in the context.
// ══════════════════════════════════════════════════════════════════════════════
// PLAY-COUNT HELPERS — tracks how many times a "sale" song was played (≥30s)
// Stored in localStorage; server is not consulted until purchase is needed.
// ══════════════════════════════════════════════════════════════════════════════
const FREE_PLAYS = 2; // number of free listens before paywall
function getPcKey(userId: number | undefined, trackId: number) {
  return `flexa_pc_${userId ?? "anon"}_${trackId}`;
}
function getPlayCount(userId: number | undefined, trackId: number): number {
  try { return Number(localStorage.getItem(getPcKey(userId, trackId)) ?? 0); }
  catch { return 0; }
}
function incrementPlayCount(userId: number | undefined, trackId: number) {
  try {
    const n = getPlayCount(userId, trackId) + 1;
    localStorage.setItem(getPcKey(userId, trackId), String(n));
    return n;
  } catch { return 999; }
}
function markPurchased(userId: number | undefined, trackId: number) {
  try { localStorage.setItem(`flexa_owns_${userId ?? "anon"}_${trackId}`, "1"); } catch { /* */ }
}
function isPurchasedLocally(userId: number | undefined, trackId: number): boolean {
  try { return localStorage.getItem(`flexa_owns_${userId ?? "anon"}_${trackId}`) === "1"; } catch { return false; }
}

// ══════════════════════════════════════════════════════════════════════════════
// SONG PAYWALL VIEW — shown when a "for sale" track hits the 2-listen limit
// ══════════════════════════════════════════════════════════════════════════════
function SongPaywallView({ track, userId, playCount, onBought, onBack }: {
  track: Track;
  userId: number | undefined;
  playCount: number;
  onBought: () => void;
  onBack: () => void;
}) {
  const [loading,       setLoading]       = useState(false);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [errMsg,        setErrMsg]        = useState("");
  const [walletBal,     setWalletBal]     = useState<number | null>(null);
  const { t } = useTranslation();

  const getToken = () =>
    localStorage.getItem("flexamarket_token") ?? sessionStorage.getItem("flexamarket_token") ?? "";

  // Fetch wallet balance so we can show it on the FM button
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    fetch("/api/wallet/balance", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setWalletBal(Number(d.balanceUsd ?? 0) + Number(d.promoBalance ?? 0)))
      .catch(() => {});
  }, []);

  // ── Pay via Stripe checkout ─────────────────────────────────────────────────
  const handleBuy = async () => {
    setLoading(true); setErrMsg("");
    try {
      const res  = await fetch(`/api/music/${track.id}/buy`, {
        method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erè");
      if (data.alreadyPurchased) { markPurchased(userId, track.id); onBought(); return; }
      if (data.url) window.location.href = data.url;
    } catch (e: any) { setErrMsg(e.message); setLoading(false); }
  };

  // ── Pay via FM wallet (instant) ─────────────────────────────────────────────
  const handleBuyWallet = async () => {
    setLoadingWallet(true); setErrMsg("");
    try {
      const res  = await fetch(`/api/music/${track.id}/buy/wallet`, {
        method: "POST", headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        // Insufficient balance → show friendly message with current balance
        if (res.status === 402) {
          const have = Number((data.promoBalance ?? 0) + (data.realBalance ?? 0)).toFixed(2);
          throw new Error(`Balans pa ase — ou gen $${have}, chante a koute $${Number(data.required ?? 0).toFixed(2)}`);
        }
        throw new Error(data.error ?? "Erè");
      }
      if (data.alreadyPurchased) { markPurchased(userId, track.id); onBought(); return; }
      if (data.ok) { markPurchased(userId, track.id); onBought(); return; }
    } catch (e: any) { setErrMsg(e.message); setLoadingWallet(false); }
  };

  const price = Number(track.price_usd ?? 0);
  const PLATFORM_PCT = 20;

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#fff", display: "flex", flexDirection: "column" }}>
      {/* Blurred cover bg */}
      {track.cover_url && (
        <div style={{
          position: "fixed", inset: 0, backgroundImage: `url(${track.cover_url})`,
          backgroundSize: "cover", backgroundPosition: "center",
          filter: "blur(40px) brightness(0.15)", zIndex: 0,
        }} />
      )}

      {/* Header */}
      <div className="relative z-10 flex items-center gap-3 px-4 py-3 sticky top-0"
        style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(12px)" }}>
        <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.12)" }}>
          <ChevronLeft size={20} className="text-white" />
        </button>
        <p className="font-black text-base">{t("music.listenUnlimited")}</p>
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-6 px-5 py-8 pb-28">
        {/* Track art */}
        <div className="relative w-52 h-52 rounded-3xl overflow-hidden shadow-2xl"
          style={{ boxShadow: "0 20px 60px rgba(0,0,0,0.8)" }}>
          {track.cover_url
            ? <img src={track.cover_url} alt={track.title} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center" style={{ background: "#1a1a1a" }}>
                <Music2 size={48} className="text-white/20" />
              </div>}
          {/* Lock overlay */}
          <div className="absolute inset-0 flex items-center justify-center"
            style={{ background: "rgba(0,0,0,0.55)" }}>
            <span className="text-5xl">🔒</span>
          </div>
        </div>

        <div className="text-center">
          <h2 className="font-black text-xl mb-1">{track.title}</h2>
          <p className="text-white/50 text-sm">{track.artist}</p>
        </div>

        {/* Listen count notice */}
        <div className="rounded-2xl px-5 py-4 text-center max-w-xs"
          style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)" }}>
          <p className="text-sm leading-relaxed" style={{ color: "#c084fc" }}>
            {t("music.paywallListens", { count: playCount, limit: FREE_PLAYS })}
          </p>
        </div>

        {/* Price breakdown */}
        <div className="w-full max-w-xs rounded-2xl overflow-hidden"
          style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <span className="text-sm text-white/60">{t("music.paywallPriceLabel")}</span>
            <span className="font-bold">${price.toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
            <span className="text-sm text-white/60">{t("music.paywallArtistShare", { pct: 100 - PLATFORM_PCT })}</span>
            <span className="font-bold text-green-400">${(price * (100 - PLATFORM_PCT) / 100).toFixed(2)}</span>
          </div>
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm text-white/60">{t("music.paywallFlexa", { pct: PLATFORM_PCT })}</span>
            <span className="text-white/40 text-sm">${(price * PLATFORM_PCT / 100).toFixed(2)}</span>
          </div>
        </div>

        {errMsg && (
          <div className="w-full max-w-xs flex items-center gap-2 rounded-xl px-4 py-3"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <AlertCircle size={15} className="text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{errMsg}</p>
          </div>
        )}

        {/* CTA — two payment options */}
        <div className="w-full max-w-xs flex flex-col gap-3">

          {/* ── Option 1: Stripe card ── */}
          <button onClick={handleBuy} disabled={loading || loadingWallet}
            className="w-full rounded-2xl py-4 font-black text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#7c3aed,#c026d3)", color: "#fff",
                     boxShadow: "0 8px 24px rgba(124,58,237,0.4)" }}>
            {loading ? <Loader2 size={18} className="animate-spin" /> : "💳"}
            {loading ? t("music.connectingPayment") : t("music.buyTrack", { price: price.toFixed(2) })}
          </button>

          {/* ── Divider ── */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-white/30 text-xs font-bold">{t("music.paywallOr")}</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          {/* ── Option 2: FM Wallet ── */}
          <button onClick={handleBuyWallet} disabled={loading || loadingWallet}
            className="w-full rounded-2xl py-4 font-black text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#ea580c,#f97316)", color: "#fff",
                     boxShadow: "0 8px 24px rgba(234,88,12,0.35)" }}>
            {loadingWallet ? <Loader2 size={18} className="animate-spin" /> : "🟠"}
            {loadingWallet ? t("music.paywallProcessing") : (
              <>
                {t("music.paywallKartFM")}
                {walletBal !== null && (
                  <span className="ml-1 text-sm font-normal opacity-80">
                    (${walletBal.toFixed(2)})
                  </span>
                )}
              </>
            )}
          </button>

          <button onClick={onBack}
            className="w-full rounded-2xl py-3 text-sm font-bold text-white/50 active:text-white/80 transition-colors">
            {t("music.listenFree")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ARTIST PLAN VIEW — upgrade screen shown when free limit (2 songs) is reached
// ══════════════════════════════════════════════════════════════════════════════
function ArtistPlanView({ songCount, onBack }: { songCount: number; onBack: () => void }) {
  const [loadingStripe, setLoadingStripe] = useState(false);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [errMsg,  setErrMsg]  = useState("");
  const [walletBal, setWalletBal] = useState<number | null>(null);
  const { t } = useTranslation();

  // Fetch wallet balance on mount so we can show it in the FM button
  useEffect(() => {
    const token = localStorage.getItem("flexamarket_token") ?? sessionStorage.getItem("flexamarket_token") ?? "";
    if (!token) return;
    fetch("/api/wallet/balance", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setWalletBal(Number(d.balanceUsd ?? 0) + Number(d.promoBalance ?? 0)))
      .catch(() => {});
  }, []);

  const getToken = () =>
    localStorage.getItem("flexamarket_token") ?? sessionStorage.getItem("flexamarket_token") ?? "";

  // Pay via Stripe
  const handleStripe = async () => {
    setLoadingStripe(true); setErrMsg("");
    try {
      const res = await fetch("/api/music/artist/subscribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erè");
      if (data.url) window.location.href = data.url;
    } catch (e: any) { setErrMsg(e.message ?? "Erè koneksyon"); setLoadingStripe(false); }
  };

  // Pay via FM Wallet (Flex Card)
  const handleWallet = async () => {
    setLoadingWallet(true); setErrMsg("");
    try {
      const res = await fetch("/api/music/artist/subscribe/wallet", {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) {
          const has = Number(data.promoBalance ?? 0) + Number(data.realBalance ?? 0);
          throw new Error(t("music.artistPlanWalletLow", { bal: `$${has.toFixed(2)}` }));
        }
        throw new Error(data.error ?? "Erè");
      }
      // Success — reload to get updated plan state
      window.location.href = "/music?plan=activated";
    } catch (e: any) { setErrMsg(e.message ?? "Erè koneksyon"); setLoadingWallet(false); }
  };

  const canPayWallet = walletBal !== null && walletBal >= 50;

  const perks = [
    { icon: "🎵", title: t("music.artistPlanPerk1Title"), desc: t("music.artistPlanPerk1Desc") },
    { icon: "💰", title: t("music.artistPlanPerk2Title"), desc: t("music.artistPlanPerk2Desc") },
    { icon: "📈", title: t("music.artistPlanPerk3Title"), desc: t("music.artistPlanPerk3Desc") },
    { icon: "🏆", title: t("music.artistPlanPerk4Title"), desc: t("music.artistPlanPerk4Desc") },
  ];

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#fff" }}>
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3"
        style={{ background: "#0a0a0a", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "#1a1a1a" }}>
          <ChevronLeft size={20} className="text-white" />
        </button>
        <p className="font-black text-base">{t("music.artistPlanTitle")}</p>
      </div>

      <div className="px-4 py-6 flex flex-col gap-6 pb-28">
        {/* Hero */}
        <div className="rounded-2xl p-6 text-center flex flex-col items-center gap-3"
          style={{ background: "linear-gradient(135deg,#7c3aed22,#c026d322)", border: "1px solid rgba(124,58,237,0.3)" }}>
          <div className="text-5xl">🎤</div>
          <h1 className="font-black text-2xl">{t("music.artistPlanHero")}</h1>
          <p className="text-sm text-white/60 leading-relaxed max-w-xs">
            {t("music.artistPlanDesc", { count: songCount })}
          </p>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-4xl font-black" style={{ color: "#a855f7" }}>$50</span>
            <span className="text-white/40 text-sm">{t("music.artistPlanPriceUnit")}</span>
          </div>
        </div>

        {/* Perks */}
        <div className="flex flex-col gap-3">
          {perks.map((p, i) => (
            <div key={i} className="flex items-start gap-4 rounded-xl p-4"
              style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.06)" }}>
              <span className="text-2xl shrink-0">{p.icon}</span>
              <div>
                <p className="font-bold text-sm">{p.title}</p>
                <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Revenue model explainer */}
        <div className="rounded-xl p-4 flex flex-col gap-3"
          style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)" }}>
          <p className="font-bold text-sm" style={{ color: "#a855f7" }}>💡 {t("music.artistPlanRevTitle")}</p>
          <div className="flex flex-col gap-2 text-xs text-white/60 leading-relaxed">
            <p>• {t("music.artistPlanRevAds")}</p>
            <p>• {t("music.artistPlanRevClicks")}</p>
            <p>• {t("music.artistPlanRevSales")}</p>
          </div>
          <div className="mt-1 rounded-lg p-3 flex items-center gap-3"
            style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.2)" }}>
            <span className="text-xl">🔓</span>
            <p className="text-xs leading-relaxed" style={{ color: "#c084fc" }}>
              {t("music.artistPlanRevAutoNote")}
            </p>
          </div>
        </div>

        {errMsg && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-3"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <AlertCircle size={15} className="text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{errMsg}</p>
          </div>
        )}

        {/* ── Payment options ── */}
        <div className="flex flex-col gap-3">
          <p className="text-center text-xs text-white/30 uppercase tracking-widest font-bold">{t("music.choosePayment")}</p>

          {/* Option 1 — FM Wallet (Flex Card) */}
          <div className="rounded-2xl overflow-hidden"
            style={{ border: "1px solid rgba(16,185,129,0.3)", background: "rgba(16,185,129,0.06)" }}>
            <div className="px-4 pt-3 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xl">💳</span>
                <div>
                  <p className="font-bold text-sm text-emerald-300">Flex Card (FM Wallet)</p>
                  <p className="text-xs text-white/40">{t("music.artistPlanPaymentNote")}</p>
                </div>
              </div>
              {walletBal !== null && (
                <span className="text-xs font-bold px-2 py-1 rounded-full"
                  style={{
                    background: canPayWallet ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.1)",
                    color: canPayWallet ? "#6ee7b7" : "#f87171",
                  }}>
                  ${walletBal.toFixed(2)}
                </span>
              )}
            </div>
            <button
              onClick={handleWallet}
              disabled={loadingWallet || loadingStripe || !canPayWallet}
              className="w-full py-3 font-black text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
              style={{
                background: canPayWallet
                  ? "linear-gradient(135deg,#059669,#10b981)"
                  : "rgba(255,255,255,0.04)",
                color: "#fff",
              }}>
              {loadingWallet
                ? <><Loader2 size={15} className="animate-spin" /> {t("music.processingPayment")}</>
                : canPayWallet
                  ? t("music.payWithWallet")
                  : t("music.walletInsufficient", { bal: walletBal !== null ? `$${walletBal.toFixed(2)}` : "…" })}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
            <span className="text-xs text-white/20 font-bold">{t("music.orSeparator")}</span>
            <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.06)" }} />
          </div>

          {/* Option 2 — Stripe */}
          <button onClick={handleStripe} disabled={loadingStripe || loadingWallet}
            className="w-full rounded-2xl py-4 font-black text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-all disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#7c3aed,#c026d3)", color: "#fff",
                     boxShadow: "0 8px 24px rgba(124,58,237,0.35)" }}>
            {loadingStripe ? <Loader2 size={18} className="animate-spin" /> : <span>🌐</span>}
            {loadingStripe ? t("music.connectingStripe") : t("music.payWithCard")}
          </button>
        </div>

        <p className="text-center text-xs text-white/20">
          {t("music.paymentInfoNote")}
        </p>
      </div>
    </div>
  );
}

function UploadView({ onBack, onSuccess, onPlanRequired, songCount = 0 }: {
  onBack: () => void;
  onSuccess: (track: Track) => void;
  onPlanRequired: (songCount: number) => void;
  songCount?: number;
}) {
  const { t } = useTranslation();
  const { start: startUpload } = useMusicUpload();

  const [title,   setTitle]   = useState("");
  const [artist,  setArtist]  = useState("");
  const [album,   setAlbum]   = useState("");
  const [genre,   setGenre]   = useState("");
  const [forSale, setForSale] = useState(false);
  const [priceUsd, setPriceUsd] = useState<number>(0.99);
  const [lyrics,  setLyrics]  = useState("");
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [errMsg,  setErrMsg]  = useState("");
  const audioInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const onCoverPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCoverFile(f);
    const reader = new FileReader();
    reader.onload = ev => setCoverPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !artist.trim()) { setErrMsg(t("upload.errTitleArtist")); return; }
    if (!audioFile) { setErrMsg(t("upload.errAudio")); return; }

    // Step 1: log file selection details
    console.log("[upload] step 1: file selected", {
      name: audioFile.name, size: audioFile.size,
      type: audioFile.type, title: title.trim(), artist: artist.trim(),
    });

    if (forSale && (!priceUsd || priceUsd < 0.99)) {
      setErrMsg(t("upload.errMinPrice")); return;
    }

    // Hand off to global context — XHR survives component unmount
    startUpload(
      audioFile,
      coverFile,
      {
        title:             title.trim(),
        artist:            artist.trim(),
        album:             album.trim() || undefined,
        genre:             genre || undefined,
        type:              "free",
        monetizationType:  forSale ? "sale" : "stream",
        priceUsd:          forSale ? priceUsd : undefined,
        coverPreview:      coverPreview ?? undefined,
        lyrics:            lyrics.trim() || undefined,
      },
      (track) => onSuccess(track),
      onPlanRequired,
    );

    // Return to home immediately — floating toast shows progress
    onBack();
  };

  const inp = "w-full rounded-xl px-4 py-3 text-sm text-white outline-none border focus:border-purple-500 transition-colors";
  const inpStyle = { background: "#1a1a1a", borderColor: "rgba(255,255,255,0.1)" };

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#fff" }}>
      {/* Header */}
      <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3"
        style={{ background: "#0a0a0a", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <button onClick={onBack} className="w-9 h-9 rounded-full flex items-center justify-center"
          style={{ background: "#1a1a1a" }}>
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div>
          <p className="font-black text-base">{t("upload.title")}</p>
          <p className="text-xs text-white/40">{t("upload.backgroundSubtitle")}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-5 flex flex-col gap-5 pb-28">

        {/* ── Approaching free-limit warning (shown when 1 of 2 free slots used) ── */}
        {songCount === 1 && (
          <div className="flex items-start gap-3 rounded-xl px-4 py-3"
            style={{ background: "rgba(234,179,8,0.1)", border: "1px solid rgba(234,179,8,0.35)" }}>
            <AlertCircle size={16} className="text-yellow-400 shrink-0 mt-0.5" />
            <p className="text-xs text-yellow-300 leading-relaxed">
              {t("music.uploadLimitWarn", { count: 1 })}
            </p>
          </div>
        )}

        {/* Cover picker */}
        <div className="flex justify-center">
          <button type="button" onClick={() => coverInputRef.current?.click()}
            className="relative w-36 h-36 rounded-2xl overflow-hidden flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform"
            style={{ background: "#1a1a1a", border: "2px dashed rgba(255,255,255,0.12)" }}>
            {coverPreview ? (
              <>
                <img src={coverPreview} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 flex items-end justify-end p-2">
                  <span className="text-xs px-2 py-0.5 rounded-full font-bold"
                    style={{ background: "rgba(0,0,0,0.7)" }}>{t("upload.changeCover")}</span>
                </div>
              </>
            ) : (
              <>
                <ImageIcon size={28} className="text-white/20" />
                <span className="text-xs text-white/30 text-center px-2">{t("upload.addCoverPhoto")}</span>
              </>
            )}
          </button>
          <input ref={coverInputRef} type="file" accept="image/jpeg,image/png,image/webp"
            className="hidden" onChange={onCoverPick} />
        </div>

        {/* Title */}
        <div>
          <label className="block text-xs font-bold text-white/50 mb-1.5 uppercase tracking-wider">{t("upload.trackTitle")} *</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t("upload.trackTitlePlaceholder")}
            className={inp} style={inpStyle} />
        </div>

        {/* Artist */}
        <div>
          <label className="block text-xs font-bold text-white/50 mb-1.5 uppercase tracking-wider">{t("upload.artistName")} *</label>
          <input value={artist} onChange={e => setArtist(e.target.value)} placeholder={t("upload.artistNamePlaceholder")}
            className={inp} style={inpStyle} />
        </div>

        {/* Album */}
        <div>
          <label className="block text-xs font-bold text-white/50 mb-1.5 uppercase tracking-wider">{t("upload.album")}</label>
          <input value={album} onChange={e => setAlbum(e.target.value)} placeholder={t("upload.albumPlaceholder")}
            className={inp} style={inpStyle} />
        </div>

        {/* Genre */}
        <div>
          <label className="block text-xs font-bold text-white/50 mb-1.5 uppercase tracking-wider">{t("upload.genre")}</label>
          <select value={genre} onChange={e => setGenre(e.target.value)}
            className={inp} style={{ ...inpStyle, appearance: "none" as any }}>
            <option value="">— {t("upload.genreSelect")} —</option>
            {["Kompa","Rap Kreyòl","Rasin","Gospel","Zouk","Twoubadou","Reggaeton","Pop","R&B","Afrobeat","Autre"].map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        {/* Lyrics */}
        <div>
          <label className="block text-xs font-bold text-white/50 mb-1.5 uppercase tracking-wider">{t("upload.lyrics")}</label>
          <textarea
            value={lyrics}
            onChange={e => setLyrics(e.target.value)}
            onKeyDown={e => e.stopPropagation()}
            placeholder={t("upload.lyricsPlaceholder")}
            rows={5}
            className={`${inp} resize-none`}
            style={inpStyle}
          />
        </div>

        {/* Audio file */}
        <div>
          <label className="block text-xs font-bold text-white/50 mb-1.5 uppercase tracking-wider">{t("upload.audioFile")} *</label>
          <button type="button" onClick={() => audioInputRef.current?.click()}
            className="w-full rounded-xl px-4 py-4 flex items-center gap-3 active:scale-[0.98] transition-transform"
            style={{ background: "#1a1a1a", border: audioFile ? "1px solid #7c3aed" : "2px dashed rgba(255,255,255,0.12)" }}>
            {audioFile ? (
              <>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: "rgba(124,58,237,0.2)" }}>
                  <Music2 size={20} style={{ color: "#a855f7" }} />
                </div>
                <div className="flex-1 text-left min-w-0">
                  <p className="text-sm font-bold text-white truncate">{audioFile.name}</p>
                  <p className="text-xs text-white/40">{(audioFile.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
                <X size={16} className="text-white/30 shrink-0"
                  onClick={e => { e.stopPropagation(); setAudioFile(null);
                    if (audioInputRef.current) audioInputRef.current.value = ""; }} />
              </>
            ) : (
              <>
                <UploadCloud size={24} className="text-white/20 shrink-0" />
                <div className="text-left">
                  <p className="text-sm font-bold text-white/50">{t("upload.chooseAudio")}</p>
                  <p className="text-xs text-white/30">{t("upload.audioFormats500")}</p>
                </div>
              </>
            )}
          </button>
          <input ref={audioInputRef} type="file" accept=".mp3,.wav,.flac,.aac,.m4a,audio/*"
            className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setAudioFile(f); }} />
        </div>

        {/* Validation error */}
        {errMsg && (
          <div className="flex items-center gap-2 rounded-xl px-4 py-3"
            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)" }}>
            <AlertCircle size={16} className="text-red-400 shrink-0" />
            <p className="text-sm text-red-400">{errMsg}</p>
          </div>
        )}

        {/* For sale toggle */}
        <div className="flex flex-col gap-3 rounded-xl p-4"
          style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.08)" }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold">{t("upload.forSaleTitle")}</p>
              <p className="text-xs text-white/40 mt-0.5">{t("upload.forSaleSubtitle")}</p>
            </div>
            <button type="button" onClick={() => setForSale(v => !v)}
              className="w-12 h-6 rounded-full transition-all relative shrink-0"
              style={{ background: forSale ? "#7c3aed" : "rgba(255,255,255,0.1)" }}>
              <span className="absolute top-0.5 transition-all w-5 h-5 rounded-full bg-white"
                style={{ left: forSale ? "calc(100% - 22px)" : 2 }} />
            </button>
          </div>
          {forSale && (
            <div>
              <label className="block text-xs font-bold text-white/50 mb-1.5 uppercase tracking-wider">
                {t("upload.priceLabel")}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 font-bold">$</span>
                <input
                  type="number" min="0.99" max="50" step="0.01"
                  value={priceUsd || ""}
                  onChange={e => {
                    const v = e.target.valueAsNumber;
                    setPriceUsd(isNaN(v) ? 0 : v);
                  }}
                  onBlur={e => {
                    const v = e.target.valueAsNumber;
                    if (isNaN(v) || v < 0.99) setPriceUsd(0.99);
                  }}
                  className="w-full rounded-xl pl-7 pr-4 py-3 text-sm text-white outline-none border focus:border-purple-500 transition-colors"
                  style={{ background: "#0a0a0a", borderColor: "rgba(255,255,255,0.15)" }}
                  placeholder="0.99"
                />
              </div>
              <p className="text-xs text-white/30 mt-1">
                {t("upload.priceArtistEarns")}: <strong className="text-green-400">${(priceUsd * 0.80).toFixed(2)}</strong>
                {" "}· {t("upload.priceFlexa")}: <strong className="text-white/40">${(priceUsd * 0.20).toFixed(2)}</strong>
                {" "}· {t("upload.priceFreePlays")}
              </p>
            </div>
          )}
        </div>

        {/* Info banner */}
        <div className="flex items-start gap-2 rounded-xl px-4 py-3"
          style={{ background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)" }}>
          <UploadCloud size={15} style={{ color: "#a855f7", flexShrink: 0, marginTop: 1 }} />
          <p className="text-xs" style={{ color: "rgba(168,85,247,0.8)", lineHeight: 1.5 }}>
            {t("upload.backgroundNote")}
          </p>
        </div>

        {/* Submit */}
        <button type="submit"
          className="w-full rounded-2xl py-4 font-black text-base flex items-center justify-center gap-2 active:scale-[0.97] transition-all"
          style={{ background: "linear-gradient(135deg,#7c3aed,#c026d3)", color: "#fff",
                   boxShadow: "0 8px 24px rgba(124,58,237,0.35)" }}>
          <UploadCloud size={18} /> {t("upload.submit")}
        </button>

        <p className="text-center text-xs text-white/25 px-4">
          {t("upload.reviewNote")}
        </p>
      </form>
    </div>
  );
}

// ── Home View ─────────────────────────────────────────────────────────────────
function HomeView({ tracks, liked, user, isAdmin, purchasedIds, currentTrackId, currentTrackPlaying, onPlay, onPlayList, onToggleLike, onSearch, onUpload, onEdit, onDelete, onBuy, setLocation, autoFocusSearch, onFocusHandled, searchLoading }:
  { tracks: Track[]; liked: Set<number>; user: any; isAdmin: boolean;
    purchasedIds: Set<number>;
    currentTrackId?: number; currentTrackPlaying?: boolean;
    onPlay: (t: Track, q: Track[], i: number) => void;
    onPlayList: (mix: Mix) => void;
    onToggleLike: (id: number) => void;
    onSearch: (q: string) => void;
    onUpload: () => void;
    onEdit: (t: Track) => void;
    onDelete: (id: number) => void;
    onBuy: (t: Track) => void;
    setLocation: (p: string) => void;
    autoFocusSearch?: boolean;
    onFocusHandled?: () => void;
    searchLoading?: boolean; }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [showNotifications, setShowNotifications] = useState(false);
  const [moreTrack, setMoreTrack] = useState<Track | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the search input when arriving from PlayerView search tap
  useEffect(() => {
    if (autoFocusSearch) {
      searchInputRef.current?.focus();
      onFocusHandled?.();
    }
  }, [autoFocusSearch]);

  // ── Live search: debounce 350 ms so the API isn't hammered on every keystroke
  useEffect(() => {
    const id = setTimeout(() => onSearch(search.trim()), 350);
    return () => clearTimeout(id);
  }, [search]);

  const likedTracks  = tracks.filter(t => liked.has(t.id));
  const favDisplay   = likedTracks.slice(0, 4).length > 0 ? likedTracks.slice(0, 4) : tracks.slice(0, 4);
  const recommended  = tracks.filter(t => t.is_featured || liked.has(t.id) || t.play_count > 100).slice(0, 10);
  const recFallback  = recommended.length >= 3 ? recommended : tracks.slice(0, 10);

  const mixes = useMemo((): Mix[] => {
    const genres = [...new Set(tracks.map(t => t.genre).filter(Boolean))] as string[];
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    return [
      { id:"mix1", label:"MIX 1", subtitle: genres[0] ?? "Tout", tracks: shuffled.slice(0, 20), cover: shuffled[0]?.cover_url ?? null, gradient: MIX_GRADIENTS[0] },
      { id:"mix2", label:"MIX 2", subtitle: genres[1] ?? "Featured", tracks: tracks.filter(t => t.is_featured).length > 0 ? tracks.filter(t => t.is_featured) : tracks.slice(5,20), cover: tracks.find(t=>t.is_featured)?.cover_url ?? null, gradient: MIX_GRADIENTS[1] },
      { id:"mix3", label:"MIX 3", subtitle: genres[2] ?? "Latest", tracks: genres[2] ? tracks.filter(t => t.genre===genres[2]) : [...tracks].reverse().slice(0,20), cover: null, gradient: MIX_GRADIENTS[2] },
    ];
  }, [tracks]);

  /** Group tracks by their `album` field (1+ tracks) */
  const albums = useMemo(() => {
    const map = new Map<string, Track[]>();
    tracks.forEach(t => {
      const k = t.album?.trim();
      if (!k) return;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    });
    return [...map.entries()].map(([name, ts]) => ({
      name,
      tracks: ts,
      cover: ts[0]?.cover_url ?? null,
    }));
  }, [tracks]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (search.trim()) onSearch(search.trim());
  };

  const userName = user?.name ?? user?.username ?? "Ou";

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#fff", paddingBottom: 120 }}>

      {/* ── Header ── */}
      <div className="sticky top-0 z-30 flex items-center gap-3 px-4 py-3" style={{ background: "#0a0a0a" }}>
        <Avatar src={user?.avatar_url} name={userName} size={38} />
        <button
          onClick={() => setLocation(user ? "/music/earnings" : "/music")}
          className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold"
          style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}>
          <span className="text-xs">🎵</span> {t("music.artistStudio")}
        </button>
        <div className="flex-1" />
        <button onClick={onUpload}
          className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#1a1a1a" }}>
          <UploadCloud size={17} className="text-white/80" />
        </button>
        <button onClick={() => setShowNotifications(true)}
          className="w-9 h-9 rounded-full flex items-center justify-center relative" style={{ background: "#1a1a1a" }}>
          <Bell size={17} className="text-white/80" />
        </button>
      </div>

      {/* ── Search ──
          NOTE: intentionally a <div>, NOT a <form>.
          A <form method="GET"> can trigger URL navigation in some iOS WebViews
          even when e.preventDefault() is called, making the search bar "go back".
          Live search runs via the useEffect debounce below — no form needed. */}
      <div className="px-4 mb-5">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
          style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)" }}>
          <Search size={15} className="text-white/40 shrink-0" />
          <input
            ref={searchInputRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              // Prevent Enter / any key from bubbling to the WebView router
              e.stopPropagation();
              // Dismiss keyboard on Enter (search already runs via debounce)
              if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); }
            }}
            placeholder={t("music.searchPlaceholder")}
            className="flex-1 bg-transparent text-white text-sm placeholder:text-white/30 outline-none"
            inputMode="search"
            enterKeyHint="search"
          />
          {search && (
            <button
              type="button"
              onClick={() => { setSearch(""); onSearch(""); }}
              onTouchEnd={e => { e.preventDefault(); setSearch(""); onSearch(""); }}
            >
              <X size={13} className="text-white/30" />
            </button>
          )}
        </div>
      </div>

      {search.trim() ? (
        /* ── Search results ── */
        <div className="px-4">
          <p className="text-white/40 text-xs mb-3 px-1 flex items-center gap-2">
            {searchLoading
              ? <Loader2 size={12} className="animate-spin text-violet-400 shrink-0" />
              : null}
            {searchLoading ? t("music.searching") : t("music.searchResults", { n: tracks.length, q: search })}
          </p>
          {!searchLoading && tracks.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-3">
              <Music2 size={40} className="text-white/10" />
              <p className="text-white/30 text-sm">Pa gen rezilta</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {tracks.map((track, i) => (
                <button key={track.id} onClick={() => onPlay(track, tracks, i)}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 active:scale-[0.98] transition-transform text-left w-full"
                  style={{ background: track.id === currentTrackId ? "rgba(124,58,237,0.25)" : "#1a1a1a" }}>
                  <CoverArt src={track.cover_url} title={track.title} size={44} radius={8} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-semibold truncate">{track.title}</p>
                    <p className="text-white/50 text-xs truncate">{track.artist}</p>
                    {track.play_count > 0 && (
                      <p className="text-white/25 text-[9px] mt-0.5 flex items-center gap-0.5">
                        <Play size={7} className="inline fill-white/25 text-white/25" />{fmtPlays(track.play_count)}
                      </p>
                    )}
                  </div>
                  {track.id === currentTrackId && currentTrackPlaying && (
                    <div className="flex gap-0.5 items-end h-4">
                      <span className="w-1 rounded-full bg-violet-400 animate-bounce" style={{ height: "60%", animationDelay: "0ms" }} />
                      <span className="w-1 rounded-full bg-violet-400 animate-bounce" style={{ height: "100%", animationDelay: "150ms" }} />
                      <span className="w-1 rounded-full bg-violet-400 animate-bounce" style={{ height: "40%", animationDelay: "300ms" }} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : tracks.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Music2 size={48} className="text-white/10" />
          <p className="text-white/40 text-sm">Pa gen chante disponib ankò</p>
          {user && (
            <button onClick={onUpload}
              className="flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-full"
              style={{ background: "linear-gradient(135deg,#7c3aed,#c026d3)" }}>
              <Plus size={15} /> {t("music.uploadFirstSong")}
            </button>
          )}
        </div>
      ) : (
        <>
          {/* ── Vos favoris ── */}
          <div className="px-4 mb-5">
            {/* Header card */}
            <div className="rounded-2xl overflow-hidden mb-2" style={{ background: "linear-gradient(135deg,#3d1c00,#7a2d00)" }}>
              <div className="flex items-center justify-between px-4 py-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.1)" }}>
                    <Heart size={20} className="text-red-400 fill-red-400" />
                  </div>
                  <span className="text-white font-black text-base">{t("music.likedSongs")}</span>
                </div>
                <button onClick={() => { const q = likedTracks.length > 0 ? likedTracks : tracks; if(q.length) onPlay(q[0], q, 0); }}
                  className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)" }}>
                  <Shuffle size={16} className="text-white" />
                </button>
              </div>
            </div>
            {/* 2×2 grid */}
            <div className="grid grid-cols-2 gap-1.5">
              {favDisplay.map(track => (
                <button key={track.id} onClick={() => onPlay(track, favDisplay, favDisplay.indexOf(track))}
                  className="flex items-center gap-2 rounded-xl px-2 py-2 text-left active:scale-[0.97] transition-transform"
                  style={{ background: "#1a1a1a" }}>
                  <CoverArt src={track.cover_url} title={track.title} size={40} radius={6} />
                  <div className="min-w-0 flex-1">
                    <p className="text-white text-xs font-bold truncate leading-tight">{track.title}</p>
                    <p className="text-white/50 text-[10px] truncate">{track.artist}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── Basé sur ce que vous aimez ── */}
          <div className="mb-6">
            <div className="flex items-center justify-between px-4 mb-3">
              <p className="text-white font-black text-base">{t("music.basedOnLikes")}</p>
              <button className="text-xs font-bold" style={{ color: "#a78bfa" }} onClick={() => onSearch("")}>
                {t("music.seeAll")}
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto pl-4 pr-4 pb-1 scrollbar-hide">
              {recFallback.map(track => (
                <button key={track.id} onClick={() => onPlay(track, recFallback, recFallback.indexOf(track))}
                  className="shrink-0 text-left active:scale-95 transition-transform" style={{ width: 140 }}>
                  <CoverArt src={track.cover_url} title={track.title} size={140} radius={12} />
                  <p className="text-white text-xs font-bold truncate mt-1.5">{track.title}</p>
                  <p className="text-white/40 text-[10px] truncate">{track.artist}</p>
                  {track.play_count > 0 && (
                    <p className="text-white/25 text-[9px] mt-0.5 flex items-center gap-0.5">
                      <Play size={7} className="inline fill-white/25 text-white/25" />{fmtPlays(track.play_count)}
                    </p>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* ── Albums ── */}
          {albums.length >= 1 && (
            <div className="mb-6">
              <p className="text-white font-black text-base px-4 mb-3">💿 {t("music.albums")}</p>
              <div className="flex gap-3 overflow-x-auto pl-4 pr-4 pb-1 scrollbar-hide">
                {albums.map(album => (
                  <button key={album.name}
                    onClick={() => { const first = album.tracks[0]; if (first) onPlay(first, album.tracks, 0); }}
                    className="shrink-0 text-left active:scale-95 transition-transform" style={{ width: 140 }}>
                    <CoverArt src={album.cover} title={album.name} size={140} radius={12} />
                    <p className="text-white text-xs font-bold truncate mt-1.5">{album.name}</p>
                    <p className="text-white/40 text-[10px] truncate">
                      {album.tracks[0]?.artist} · {album.tracks.length} tit
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Mixé pour [User] ── */}
          <div className="mb-6">
            <p className="text-white font-black text-base px-4 mb-3">{t("music.mixedFor", { name: userName })}</p>
            <div className="flex gap-3 overflow-x-auto pl-4 pr-4 pb-1 scrollbar-hide">
              {mixes.filter(m => m.tracks.length > 0).map((mix, i) => (
                <button key={mix.id} onClick={() => onPlayList(mix)}
                  className="shrink-0 relative active:scale-95 transition-transform overflow-hidden rounded-2xl"
                  style={{ width: 140, height: 140, background: mix.gradient }}>
                  {/* Cover grid (2×2 mini covers) */}
                  {mix.tracks.slice(0,4).some(t => t.cover_url) ? (
                    <div className="absolute inset-0 grid grid-cols-2 gap-0">
                      {mix.tracks.slice(0,4).map((t,ti) => (
                        <div key={ti} className="overflow-hidden">
                          {t.cover_url
                            ? <img src={t.cover_url} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full" style={{ background: mix.gradient }} />}
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top,rgba(0,0,0,0.7) 40%,transparent)" }} />
                  <div className="absolute bottom-2.5 left-3">
                    <p className="text-white font-black text-xl leading-none">{mix.label}</p>
                    <p className="text-white/60 text-[10px] truncate">{mix.subtitle}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* ── 🔥 Top 10 Cette Semaine ── */}
          {tracks.filter(t => t.play_count > 0).length >= 3 && (
            <div className="mb-6">
              <div className="flex items-center justify-between px-4 mb-3">
                <p className="text-white font-black text-base">🔥 {t("music.charts")}</p>
              </div>
              <div className="px-4">
                {tracks
                  .filter(t => t.play_count > 0)
                  .slice(0, 10)
                  .map((track, idx) => (
                    <button key={track.id} onClick={() => onPlay(track, tracks, tracks.indexOf(track))}
                      className="flex items-center gap-3 w-full py-2 px-1 rounded-xl active:bg-white/5 text-left">
                      <span className="font-black text-sm tabular-nums w-5 text-center shrink-0"
                        style={{ color: idx === 0 ? "#fbbf24" : idx === 1 ? "#9ca3af" : idx === 2 ? "#b45309" : "rgba(255,255,255,0.25)" }}>
                        {idx + 1}
                      </span>
                      <div className="relative shrink-0">
                        <CoverArt src={track.cover_url} title={track.title} size={42} radius={6} />
                        {track.is_artist_verified && (
                          <div className="absolute -bottom-1 -right-1 w-[14px] h-[14px] rounded-full bg-violet-600 flex items-center justify-center"
                            style={{ border: "1.5px solid #0a0a0a" }}>
                            <CheckCircle size={8} className="text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{track.title}</p>
                        <div className="flex items-center gap-1 text-[10px] text-white/40">
                          <span className="truncate">{track.artist}</span>
                          <span>·</span>
                          <Play size={7} className="inline shrink-0" />
                          <span>{fmtPlays(track.play_count)}</span>
                        </div>
                      </div>
                      {track.monetization_type === "sale" && track.price_usd && !purchasedIds.has(track.id) && (
                        <span className="text-violet-300 text-xs font-bold shrink-0">${Number(track.price_usd).toFixed(2)}</span>
                      )}
                      {track.monetization_type === "sale" && purchasedIds.has(track.id) && (
                        <span className="text-emerald-400 text-[10px] font-bold shrink-0">✓</span>
                      )}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* ── All tracks list ── */}
          <div className="px-4">
            <p className="text-white font-black text-base mb-3">{t("music.allSongs")}</p>
            <div className="space-y-0">
              {tracks.map((track, idx) => {
                const isLiked = liked.has(track.id);
                return (
                  <div key={track.id} className="flex items-center gap-2 py-2 rounded-xl px-1 active:bg-white/5 transition-colors">
                    <button onClick={() => onPlay(track, tracks, idx)}
                      className="flex items-center gap-3 flex-1 min-w-0 text-left">
                      <div className="relative shrink-0">
                        <CoverArt src={track.cover_url} title={track.title} size={46} radius={6} />
                        {track.id === currentTrackId && (
                          <div className="absolute inset-0 rounded-[6px] flex items-end justify-center pb-1"
                            style={{ background: "rgba(0,0,0,0.45)" }}>
                            <NowPlayingBars playing={!!currentTrackPlaying} size="xs" />
                          </div>
                        )}
                        {track.is_artist_verified && track.id !== currentTrackId && (
                          <div className="absolute -bottom-1 -right-1 w-[14px] h-[14px] rounded-full bg-violet-600 flex items-center justify-center"
                            style={{ border: "1.5px solid #0a0a0a" }}>
                            <CheckCircle size={8} className="text-white" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className={`text-sm font-semibold truncate ${track.id === currentTrackId ? "text-violet-400" : "text-white"}`}>{track.title}</p>
                          {track.monetization_type === "sale" && track.price_usd && !purchasedIds.has(track.id) && (
                            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: "rgba(124,58,237,0.2)", color: "#a78bfa" }}>
                              ${Number(track.price_usd).toFixed(2)}
                            </span>
                          )}
                          {track.monetization_type === "sale" && purchasedIds.has(track.id) && (
                            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                              style={{ background: "rgba(34,197,94,0.15)", color: "#86efac" }}>✓</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                          <span>{track.artist}</span>
                          {track.play_count > 0 && <><span>·</span><Play size={8} className="inline" /><span>{fmtPlays(track.play_count)}</span></>}
                          {track.duration_seconds && <><span>·</span><span>{fmtDur(track.duration_seconds)}</span></>}
                        </div>
                      </div>
                    </button>
                    <button onClick={() => onToggleLike(track.id)}
                      className="w-8 h-8 flex items-center justify-center rounded-full shrink-0">
                      <Heart size={15} className={isLiked ? "text-red-400 fill-red-400" : "text-white/30"} />
                    </button>
                    <button onClick={() => setMoreTrack(track)}
                      className="w-7 h-7 flex items-center justify-center rounded-full shrink-0">
                      <MoreHorizontal size={15} className="text-white/30" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── Music notifications drawer ── */}
      {showNotifications && (
        <MusicNotificationsDrawer onClose={() => setShowNotifications(false)} />
      )}

      {/* ── More / admin sheet ── */}
      {moreTrack && (
        <MoreSheet
          track={moreTrack}
          liked={liked.has(moreTrack.id)}
          onClose={() => setMoreTrack(null)}
          onLike={() => onToggleLike(moreTrack.id)}
          onDownload={() => downloadTrack(moreTrack)}
          onBuy={() => { setMoreTrack(null); onBuy(moreTrack); }}
          canDownload={moreTrack.monetization_type !== "sale" || purchasedIds.has(moreTrack.id)}
          isAdmin={isAdmin}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// BOOSTER AD CARD — rotating Flexa Market sponsored listing
// ══════════════════════════════════════════════════════════════════════════════
function BoosterAdCard({ onTap }: { onTap: (id: number) => void }) {
  const { t } = useTranslation();
  const [ads, setAds]   = useState<any[]>([]);
  const [idx, setIdx]   = useState(0);
  const timerRef        = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    fetch("/api/listings?boosted=true&limit=20")
      .then(r => r.json())
      .then(d => {
        const list = d?.listings ?? d ?? [];
        if (Array.isArray(list) && list.length) {
          // shuffle so different users see different ads
          const shuffled = [...list].sort(() => Math.random() - 0.5);
          setAds(shuffled);
        }
      })
      .catch(() => {});
    timerRef.current = setInterval(() => setIdx(i => i + 1), 30_000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  if (!ads.length) return null;
  const ad    = ads[idx % ads.length];
  const img   = Array.isArray(ad?.images) ? ad.images[0] : (ad?.image ?? null);
  const price = ad?.price != null ? `$${Number(ad.price).toFixed(2)}` : null;

  return (
    <div className="mx-4 mb-5 rounded-2xl overflow-hidden"
      style={{ background: "#161616", border: "1px solid rgba(124,58,237,0.25)" }}>
      {/* Sponsored badge */}
      <div className="px-3 py-1.5 flex items-center gap-1.5"
        style={{ background: "rgba(124,58,237,0.18)" }}>
        <ShoppingBag size={10} className="text-violet-400 shrink-0" />
        <span className="text-[9px] text-violet-400 font-bold uppercase tracking-wider">
          {t("music.sponsoredBy")}
        </span>
      </div>
      {/* Listing row */}
      <button onClick={() => onTap(ad.id)}
        className="flex items-center gap-3 w-full p-3 text-left active:bg-white/5 transition-colors">
        {img
          ? <img src={img} alt={ad.title} className="w-14 h-14 rounded-xl object-cover shrink-0" />
          : <div className="w-14 h-14 rounded-xl shrink-0 flex items-center justify-center"
              style={{ background: "#2a2a2a" }}>
              <ShoppingBag size={22} className="text-white/20" />
            </div>}
        <div className="flex-1 min-w-0">
          <p className="text-white font-semibold text-sm truncate leading-snug">{ad.title}</p>
          {price && <p className="text-violet-300 text-xs font-black mt-0.5">{price}</p>}
          <p className="text-white/35 text-[10px] mt-0.5">Flexa Market</p>
        </div>
        <div className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold"
          style={{ background: "#7c3aed", color: "#fff" }}>
          {t("music.shopNow")}
        </div>
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MUSIC LIKE BUTTON — self-contained, syncs server-side like count
// ══════════════════════════════════════════════════════════════════════════════
function MusicLikeButton({ trackId, initialLiked, onToggle }: {
  trackId: number | null;
  initialLiked: boolean;
  onToggle: (id: number) => void;
}) {
  const [liked,   setLiked] = useState(initialLiked);
  const [count,   setCount] = useState(0);

  useEffect(() => {
    if (!trackId) return;
    setLiked(initialLiked);
    const token = localStorage.getItem("flexamarket_token") ?? "";
    fetch(`/api/music/${trackId}/likes`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then(r => r.json())
      .then(d => { setCount(d.count ?? 0); setLiked(d.liked ?? initialLiked); })
      .catch(() => {});
  }, [trackId]);

  const toggle = async () => {
    if (!trackId) return;
    const was = liked;
    setLiked(!was);
    setCount(c => was ? Math.max(0, c - 1) : c + 1);
    onToggle(trackId);
    const token = localStorage.getItem("flexamarket_token") ?? "";
    if (!token) return;
    try {
      const r = await fetch(`/api/music/${trackId}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (r.ok) { const d = await r.json(); setCount(d.count); setLiked(d.liked); }
      else { setLiked(was); setCount(c => was ? c + 1 : Math.max(0, c - 1)); }
    } catch { setLiked(was); setCount(c => was ? c + 1 : Math.max(0, c - 1)); }
  };

  return (
    <button onClick={toggle}
      className="flex flex-col items-center justify-center gap-0.5 w-10 h-10 rounded-full"
      style={{ background: "#1c1c1c" }}>
      <Heart size={18} className={liked ? "text-red-400 fill-red-400" : "text-white/60"} />
      {count > 0 && (
        <span className="text-[8px] text-white/40 leading-none">
          {count > 999 ? "1k+" : count}
        </span>
      )}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MUSIC COMMENTS SECTION — self-contained, lazy-loads on first open
// ══════════════════════════════════════════════════════════════════════════════
function MusicCommentsSection({ trackId, user, isAdmin }: {
  trackId: number | null;
  user: any;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const [open,       setOpen]       = useState(false);
  const [comments,   setComments]   = useState<MusicComment[]>([]);
  const [text,       setText]       = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!trackId || !open) return;
    fetch(`/api/music/${trackId}/comments`)
      .then(r => r.json())
      .then(d => setComments(d.comments ?? []))
      .catch(() => {});
  }, [trackId, open]);

  // Reset when track changes
  useEffect(() => {
    setOpen(false);
    setComments([]);
    setText("");
  }, [trackId]);

  const submit = async () => {
    if (!text.trim() || !trackId) return;
    const token = localStorage.getItem("flexamarket_token") ?? sessionStorage.getItem("flexamarket_token") ?? "";
    setSubmitting(true);
    try {
      const r = await fetch(`/api/music/${trackId}/comments`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ content: text.trim() }),
      });
      if (r.ok) {
        const comment = await r.json();
        setComments(prev => [...prev, comment]);
        setText("");
      } else {
        // Surface the server error so user knows what happened
        const err = await r.json().catch(() => ({}));
        alert(err?.error ?? `Erè ${r.status} — eseye ankò`);
      }
    } catch (e) {
      alert("Koneksyon an echwe — verifye entènèt ou epi eseye ankò");
    } finally {
      setSubmitting(false);
    }
  };

  const del = async (id: number) => {
    const token = localStorage.getItem("flexamarket_token") ?? "";
    const r = await fetch(`/api/music/comments/${id}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${token}` },
    });
    if (r.ok) setComments(prev => prev.filter(c => c.id !== id));
  };

  const rel = (iso: string) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "kounye an";
    if (s < 3600) return `${Math.floor(s / 60)}min`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}j`;
  };

  return (
    <div className="mx-4 mb-6">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 w-full py-3">
        <MessageCircle size={16} className="text-white/60 shrink-0" />
        <span className="text-white/70 text-sm font-semibold">
          {t("music.comments")}{comments.length > 0 ? ` (${comments.length})` : ""}
        </span>
        <ChevronDown size={14}
          className={`text-white/40 ml-auto transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div>
          <div className="space-y-2 mb-3">
            {comments.length === 0 && (
              <p className="text-white/25 text-xs text-center py-4">
                {t("music.noComments")}
              </p>
            )}
            {comments.map(c => (
              <div key={c.id} className="flex gap-2.5">
                <Avatar src={c.user_avatar} name={c.user_name ?? "?"} size={28} />
                <div className="flex-1 min-w-0 rounded-xl px-3 py-2"
                  style={{ background: "#1e1e1e" }}>
                  <div className="flex items-center gap-1.5">
                    <span className="text-white text-xs font-bold truncate">{c.user_name}</span>
                    <span className="text-white/30 text-[10px] shrink-0">{rel(c.created_at)}</span>
                    {(user?.id === c.user_id || isAdmin) && (
                      <button onClick={() => del(c.id)} className="ml-auto shrink-0 p-0.5">
                        <X size={11} className="text-white/20 hover:text-red-400 transition-colors" />
                      </button>
                    )}
                  </div>
                  <p className="text-white/80 text-xs leading-relaxed mt-0.5">{c.content}</p>
                </div>
              </div>
            ))}
          </div>

          {user ? (
            <div className="flex gap-2 items-center">
              <Avatar src={user?.avatar_url} name={user?.name ?? "Ou"} size={28} />
              <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2"
                style={{ background: "#1e1e1e", border: "1px solid rgba(255,255,255,0.07)" }}>
                <input
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
                  placeholder={t("music.addCommentPlaceholder")}
                  maxLength={500}
                  className="flex-1 bg-transparent text-white text-xs outline-none placeholder:text-white/25"
                />
                <button onClick={submit} disabled={!text.trim() || submitting}
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center disabled:opacity-30 transition-opacity"
                  style={{ background: "#7c3aed" }}>
                  {submitting
                    ? <Loader2 size={11} className="animate-spin text-white" />
                    : <Send size={11} className="text-white" />}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-white/25 text-xs text-center py-2">{t("music.loginToComment")}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MUSIC NOTIFICATIONS DRAWER
// ══════════════════════════════════════════════════════════════════════════════
type MusicActivity = {
  type: "comment" | "like" | "earning";
  id: number;
  created_at: string;
  actor_name: string | null;
  actor_avatar: string | null;
  track_title: string;
  track_id: number;
  detail: string | null;
};

function MusicNotificationsDrawer({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [items,   setItems]   = useState<MusicActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("flexamarket_token") ?? "";
    if (!token) { setLoading(false); return; }
    fetch("/api/music/activity", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setItems(d.activity ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const rel = (iso: string) => {
    const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return "kounye an";
    if (s < 3600) return `${Math.floor(s / 60)}min`;
    if (s < 86400) return `${Math.floor(s / 3600)}h`;
    return `${Math.floor(s / 86400)}j`;
  };

  const itemText = (item: MusicActivity) => {
    const name = item.actor_name ?? "Yon moun";
    if (item.type === "comment") {
      const preview = item.detail ? `"${item.detail.slice(0, 50)}${item.detail.length > 50 ? "…" : ""}"` : "";
      return `${name} komante sou "${item.track_title}" ${preview}`;
    }
    if (item.type === "like") return `${name} renmen "${item.track_title}"`;
    return item.detail ?? `Revni debloke sou "${item.track_title}"`;
  };

  const itemEmoji = (item: MusicActivity) =>
    item.type === "comment" ? "💬" : item.type === "like" ? "❤️" : "🎵";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full rounded-t-3xl overflow-hidden max-h-[75vh] flex flex-col"
        style={{ background: "#111", border: "1px solid rgba(255,255,255,0.08)" }}
        onClick={e => e.stopPropagation()}>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <p className="text-white font-black text-base">Aktivite Mizik</p>
          <button onClick={onClose}><X size={18} className="text-white/40" /></button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto pb-8">
          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 size={24} className="animate-spin text-violet-400" />
            </div>
          )}
          {!loading && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Bell size={36} className="text-white/15" />
              <p className="text-white/30 text-sm">Pa gen aktivite mizik pou kounye an</p>
            </div>
          )}
          {!loading && items.map((item, i) => (
            <div key={`${item.type}-${item.id}`}
              className="flex items-start gap-3 px-5 py-3"
              style={{ borderBottom: i < items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
              <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden text-base"
                style={{ background: item.type === "earning" ? "rgba(124,58,237,0.2)" : "#1e1e1e" }}>
                {item.actor_avatar
                  ? <img src={item.actor_avatar} alt="" className="w-full h-full object-cover" />
                  : <span>{itemEmoji(item)}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/80 text-xs leading-relaxed">{itemText(item)}</p>
                <p className="text-white/30 text-[10px] mt-0.5">{rel(item.created_at)}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PLAYER VIEW (playlist/track detail)
// ══════════════════════════════════════════════════════════════════════════════
function PlayerView({ playlist, playlistTitle, playlistCover, playlistGrad,
  playerState, liked, isAdmin, purchasedIds, followedArtists, onBack, onSearchRequest, onPlay, onToggle, onToggleLike, onToggleFollow, onDownload, onShuffle, onNext, onPrev, onEdit, onDelete, onAdTap, onBuy }:
  { playlist: Track[]; playlistTitle: string; playlistCover: string | null; playlistGrad?: string;
    playerState: PlayerState; liked: Set<number>; isAdmin: boolean;
    purchasedIds: Set<number>;
    followedArtists: Set<number>;
    onBack: () => void; onSearchRequest: () => void; onPlay: (t: Track, idx: number) => void;
    onToggle: () => void; onToggleLike: (id: number) => void;
    onToggleFollow: (artistId: number, follow: boolean) => void;
    onDownload: (t: Track) => void; onShuffle: () => void;
    onNext: () => void; onPrev: () => void;
    onEdit: (t: Track) => void; onDelete: (id: number) => void;
    onAdTap: (id: number) => void; onBuy: (t: Track) => void; }) {
  const { user } = useAuth();
  const [moreTrack, setMoreTrack] = useState<Track | null>(null);
  const { t } = useTranslation();

  const currentTrack  = playerState.track;
  const isLiked       = currentTrack ? liked.has(currentTrack.id) : false;
  const totalDuration = fmtTotal(playlist);
  const userName      = (user as any)?.name ?? (user as any)?.username ?? "Flexa";

  const coverSrc = playlistCover ?? currentTrack?.cover_url ?? null;

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#fff", paddingBottom: 120 }}>

      {/* ── Top bar ── */}
      <div className="flex items-center gap-3 px-4 py-3 sticky top-0 z-30" style={{ background: "#0a0a0a" }}>
        <button onClick={onBack}
          className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#1a1a1a" }}>
          <ChevronLeft size={20} className="text-white" />
        </button>
        <button onClick={onSearchRequest} className="flex-1 min-w-0">
          <div className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)" }}>
            <Search size={14} className="text-white/60 shrink-0" />
            <span className="text-white/50 text-sm">{t("music.searchPlaceholder")}</span>
          </div>
        </button>
      </div>

      {/* ── Album art ── */}
      <div className="flex justify-center px-8 mb-5 mt-2">
        <div className="w-full max-w-[240px] aspect-square rounded-2xl overflow-hidden shadow-2xl"
          style={{ background: playlistGrad ?? "linear-gradient(135deg,#2d1b4e,#4b0082)" }}>
          {coverSrc
            ? <img src={coverSrc} alt={playlistTitle} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center"><Music2 size={64} className="text-white/20" /></div>}
        </div>
      </div>

      {/* ── Title + meta ── */}
      <div className="px-5 mb-4">
        <h2 className="text-white font-black text-xl leading-tight mb-2">{playlistTitle}</h2>
        <div className="flex items-center gap-2 text-white/40 text-xs mb-3">
          <Globe size={11} />
          <span>{t("music.public")}</span>
          <span>·</span>
          <span>{t("music.trackCount", { n: playlist.length })}</span>
          <span>·</span>
          <span>{totalDuration}</span>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <Avatar src={(user as any)?.avatar_url} name={userName} size={22} />
            <span className="text-white/50 text-xs">{t("music.madeFor")} <span className="text-white font-semibold">{userName}</span></span>
          </div>
        )}
      </div>

      {/* ── Action row ── */}
      <div className="flex items-center gap-3 px-5 mb-5">
        <MusicLikeButton
          trackId={currentTrack?.id ?? null}
          initialLiked={isLiked}
          onToggle={onToggleLike}
        />
        {(() => {
          const isPaidLocked = currentTrack?.monetization_type === "sale" && !purchasedIds.has(currentTrack?.id ?? -1);
          return (
            <button
              onClick={() => currentTrack && (isPaidLocked ? undefined : onDownload(currentTrack))}
              title={isPaidLocked ? "Achte chante sa pou ka downloade li" : "Download"}
              className="w-10 h-10 flex items-center justify-center rounded-full relative"
              style={{ background: "#1c1c1c", opacity: isPaidLocked ? 0.4 : 1 }}>
              <Download size={18} className="text-white/60" />
              {isPaidLocked && (
                <span className="absolute -top-1 -right-1 text-[10px]">🔒</span>
              )}
            </button>
          );
        })()}
        <button onClick={() => setMoreTrack(currentTrack)}
          className="w-10 h-10 flex items-center justify-center rounded-full" style={{ background: "#1c1c1c" }}>
          <MoreHorizontal size={18} className="text-white/60" />
        </button>
        <div className="flex-1" />
        {/* Prev / Play / Next cluster */}
        <button onClick={onPrev}
          className="w-10 h-10 flex items-center justify-center rounded-full" style={{ background: "#1c1c1c" }}>
          <SkipBack size={18} className="text-white/70" />
        </button>
        <button
          onClick={() => {
            // If no track is loaded yet, start the first one in the playlist
            if (!playerState.track && playlist.length) { onPlay(playlist[0], 0); }
            else { onToggle(); }
          }}
          className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl"
          style={{ background: "#fff" }}>
          {playerState.playing
            ? <Pause size={24} className="text-black" />
            : <Play size={24} className="text-black ml-1" />}
        </button>
        <button onClick={onNext}
          className="w-10 h-10 flex items-center justify-center rounded-full" style={{ background: "#1c1c1c" }}>
          <SkipForward size={18} className="text-white/70" />
        </button>
      </div>

      {/* ── Current track info + artist + follow button ── */}
      {currentTrack && (
        <div className="px-5 mb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-white font-black text-base leading-tight truncate">{currentTrack.title}</p>
              <p className="text-white/50 text-sm truncate mt-0.5">{currentTrack.artist}</p>
              {currentTrack.play_count > 0 && (
                <div className="flex items-center gap-1 mt-1">
                  <Play size={9} className="text-white/30 fill-white/30" />
                  <span className="text-white/30 text-[10px]">{currentTrack.play_count.toLocaleString()} plays</span>
                </div>
              )}
            </div>
            {currentTrack.artist_user_id && (
              <button
                onClick={() => onToggleFollow(currentTrack.artist_user_id!, !followedArtists.has(currentTrack.artist_user_id!))}
                className="shrink-0 text-[11px] font-bold px-3 py-1.5 rounded-full transition-all"
                style={{
                  background: followedArtists.has(currentTrack.artist_user_id)
                    ? "rgba(255,255,255,0.08)" : "linear-gradient(135deg,#7c3aed,#c026d3)",
                  border: followedArtists.has(currentTrack.artist_user_id)
                    ? "1px solid rgba(255,255,255,0.18)" : "none",
                  color: "#fff",
                }}
              >
                {followedArtists.has(currentTrack.artist_user_id) ? "✓ Swivi" : "+ Swiv"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Flexa Market Booster Ad ── */}
      <BoosterAdCard onTap={onAdTap} />

      {/* ── Flexa Premium banner ── */}
      <div className="mx-4 mb-5 rounded-2xl overflow-hidden flex items-center gap-3 px-4 py-3"
        style={{ background: "linear-gradient(135deg,#1a0040,#330066)" }}>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "rgba(255,255,255,0.1)" }}>
          <span className="text-xl">👑</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-white font-black text-sm">{t("music.premiumTitle")}</p>
          <p className="text-white/50 text-[10px]">{t("music.premiumDesc")}</p>
        </div>
        <button className="shrink-0 text-[10px] font-bold px-3 py-1.5 rounded-full" style={{ background: "#7c3aed", color: "#fff" }}>
          {t("music.free")}
        </button>
      </div>

      {/* ── Track list ── */}
      <div className="px-4 space-y-0">
        {playlist.map((track, idx) => {
          const active = playerState.track?.id === track.id;
          return (
            <div key={track.id}
              className={`flex items-center gap-2 py-3 rounded-xl px-1 transition-colors ${active ? "bg-white/5" : ""}`}>
              <button onClick={() => onPlay(track, idx)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <div className="relative shrink-0">
                  <CoverArt src={track.cover_url} title={track.title} size={44} radius={8} />
                  {active && (
                    <div className="absolute inset-0 rounded-[8px] flex items-end justify-center pb-1"
                      style={{ background: "rgba(0,0,0,0.45)" }}>
                      <NowPlayingBars playing={playerState.playing} size="xs" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold truncate ${active ? "text-violet-400" : "text-white"}`}>{track.title}</p>
                  <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "rgba(255,255,255,0.35)" }}>
                    <span className="truncate">{track.artist}</span>
                    {track.play_count > 0 && <><Play size={7} className="inline shrink-0" /><span>{fmtPlays(track.play_count)}</span></>}
                    {track.duration_seconds && <><span>·</span><span>{fmtDur(track.duration_seconds)}</span></>}
                  </div>
                </div>
              </button>
              <button onClick={() => setMoreTrack(track)}
                className="w-7 h-7 flex items-center justify-center rounded-full shrink-0">
                <MoreHorizontal size={15} className="text-white/30" />
              </button>
            </div>
          );
        })}
      </div>

      {/* ── Comments section — use active track; fall back to first in playlist ── */}
      <MusicCommentsSection
        trackId={currentTrack?.id ?? playlist[0]?.id ?? null}
        user={user}
        isAdmin={isAdmin}
      />

      {/* More sheet — includes edit/delete for admins */}
      {moreTrack && (
        <MoreSheet
          track={moreTrack}
          liked={liked.has(moreTrack.id)}
          onClose={() => setMoreTrack(null)}
          onLike={() => onToggleLike(moreTrack.id)}
          onDownload={() => onDownload(moreTrack)}
          onBuy={() => { setMoreTrack(null); onBuy(moreTrack); }}
          canDownload={moreTrack.monetization_type !== "sale" || purchasedIds.has(moreTrack.id)}
          isAdmin={isAdmin}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ARTIST PROFILE VIEW
// ══════════════════════════════════════════════════════════════════════════════
function ArtistView({ artistName, tracks, liked, purchasedIds, currentTrackId, currentTrackPlaying,
  followedArtists, onBack, onPlay, onToggleLike, onToggleFollow }: {
  artistName: string;
  tracks: Track[];
  liked: Set<number>;
  purchasedIds: Set<number>;
  currentTrackId?: number;
  currentTrackPlaying?: boolean;
  followedArtists: Set<number>;
  onBack: () => void;
  onPlay: (t: Track, q: Track[], i: number) => void;
  onToggleLike: (id: number) => void;
  onToggleFollow: (artistId: number, follow: boolean) => void;
}) {
  const artistTracks = useMemo(() => tracks.filter(t => t.artist === artistName), [tracks, artistName]);
  const artistUserId = artistTracks.find(t => t.artist_user_id)?.artist_user_id ?? null;
  const isFollowed   = artistUserId ? followedArtists.has(artistUserId) : false;
  const totalPlays   = artistTracks.reduce((s, t) => s + (t.play_count ?? 0), 0);

  return (
    <div style={{ background: "#0a0a0a", minHeight: "100vh", color: "#fff", paddingBottom: 120 }}>
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-14 pb-3">
        <button onClick={onBack}
          className="w-10 h-10 flex items-center justify-center rounded-full shrink-0"
          style={{ background: "rgba(255,255,255,0.08)" }}>
          <ChevronLeft size={20} className="text-white" />
        </button>
        <div className="flex-1 min-w-0">
          <h1 className="text-white font-black text-xl truncate">{artistName}</h1>
          <p className="text-white/40 text-xs">{artistTracks.length} chante · {fmtPlays(totalPlays)} koute</p>
        </div>
        {artistUserId && (
          <button
            onClick={() => onToggleFollow(artistUserId, !isFollowed)}
            className="shrink-0 px-4 py-2 rounded-full text-xs font-bold active:scale-95 transition-all"
            style={{ background: isFollowed ? "rgba(124,58,237,0.25)" : "rgba(124,58,237,0.85)", color: "#fff" }}>
            {isFollowed ? "✓ Swivi" : "+ Swiv"}
          </button>
        )}
      </div>

      {/* Verified artist badge */}
      {artistTracks.some(t => t.is_artist_verified) && (
        <div className="flex items-center gap-2 px-4 py-2 mx-4 mb-4 rounded-xl"
          style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.2)" }}>
          <CheckCircle size={14} className="text-violet-400 shrink-0" />
          <span className="text-violet-300 text-xs font-bold">Atis Verifye ✓</span>
        </div>
      )}

      {/* Track list */}
      <div className="px-4">
        <p className="text-white/40 text-[10px] font-bold uppercase tracking-wider mb-3 px-1">Tout chante yo</p>
        <div className="space-y-0">
          {artistTracks.map((track, idx) => {
            const isLiked  = liked.has(track.id);
            const isActive = track.id === currentTrackId;
            return (
              <div key={track.id} className="flex items-center gap-2 py-2 rounded-xl px-1 active:bg-white/5">
                <button onClick={() => onPlay(track, artistTracks, idx)}
                  className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="relative shrink-0">
                    <CoverArt src={track.cover_url} title={track.title} size={46} radius={6} />
                    {isActive && (
                      <div className="absolute inset-0 rounded-[6px] flex items-end justify-center pb-1"
                        style={{ background: "rgba(0,0,0,0.45)" }}>
                        <NowPlayingBars playing={!!currentTrackPlaying} size="xs" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm font-semibold truncate ${isActive ? "text-violet-400" : "text-white"}`}>{track.title}</p>
                      {track.monetization_type === "sale" && track.price_usd && !purchasedIds.has(track.id) && (
                        <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                          style={{ background: "rgba(124,58,237,0.2)", color: "#a78bfa" }}>
                          ${Number(track.price_usd).toFixed(2)}
                        </span>
                      )}
                      {track.monetization_type === "sale" && purchasedIds.has(track.id) && (
                        <span className="shrink-0 text-[9px] font-bold text-emerald-400">✓</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "rgba(255,255,255,0.4)" }}>
                      {track.genre && <span className="truncate">{track.genre}</span>}
                      {track.play_count > 0 && <><span>·</span><Play size={7} className="inline shrink-0" /><span>{fmtPlays(track.play_count)}</span></>}
                      {track.duration_seconds && <><span>·</span><span>{fmtDur(track.duration_seconds)}</span></>}
                    </div>
                  </div>
                </button>
                <button onClick={() => onToggleLike(track.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-full shrink-0">
                  <Heart size={15} className={isLiked ? "text-red-400 fill-red-400" : "text-white/25"} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Deterministic waveform bar height (20–100%) ────────────────────────────────
function waveBarH(trackId: number, i: number) {
  return 20 + 80 * Math.abs(Math.sin((trackId * 17 + i * 37) * 0.12));
}

// ══════════════════════════════════════════════════════════════════════════════
// FULL-SCREEN NOW-PLAYING MODAL  (Spotify-style slide-up)
// ══════════════════════════════════════════════════════════════════════════════
function NowPlayingModal({
  playerState, liked, onClose, onToggle, onPrev, onNext,
  onToggleLike, onSeek, onShuffle, onMute, isPaidPreview,
  radioMode, onToggleRadio, onArtistClick,
}: {
  playerState: PlayerState;
  liked: Set<number>;
  onClose: () => void;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onToggleLike: (id: number) => void;
  onSeek: (t: number) => void;
  onShuffle: () => void;
  onMute: () => void;
  isPaidPreview?: boolean;
  radioMode: boolean;
  onToggleRadio: () => void;
  onArtistClick: (name: string) => void;
}) {
  const { track, playing, currentTime, duration, muted } = playerState;
  const pct            = duration > 0 ? (currentTime / duration) * 100 : 0;
  const timeLeft       = Math.max(0, Math.floor(duration - currentTime));
  const previewSecsLeft = isPaidPreview ? Math.max(0, 30 - Math.floor(currentTime)) : null;
  const seekRef  = useRef(false);
  const swipeStartY = useRef(0);
  const [slideY, setSlideY] = useState(0);
  const [visible, setVisible] = useState(false);
  const [lyricsOpen, setLyricsOpen] = useState(false);

  // Slide-in animation on mount
  useEffect(() => { requestAnimationFrame(() => setVisible(true)); }, []);

  if (!track) return null;

  // ── Seek helpers ───────────────────────────────────────────────────────────
  const seekFromX = (clientX: number, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * (duration || 0));
  };

  // ── Swipe-down-to-close ───────────────────────────────────────────────────
  const handleSwipeStart = (y: number) => { swipeStartY.current = y; };
  const handleSwipeMove  = (y: number) => {
    const dy = y - swipeStartY.current;
    if (dy > 0) setSlideY(dy);
  };
  const handleSwipeEnd   = (y: number) => {
    if (y - swipeStartY.current > 110) { onClose(); } else { setSlideY(0); }
  };

  const isLiked = liked.has(track.id);

  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col"
      style={{
        transform: `translateY(${visible ? slideY : "100%"})`,
        transition: slideY > 0 ? "none" : "transform 0.38s cubic-bezier(0.32,0.72,0,1)",
        willChange: "transform",
      }}
      onTouchStart={e => handleSwipeStart(e.touches[0].clientY)}
      onTouchMove={e  => handleSwipeMove(e.touches[0].clientY)}
      onTouchEnd={e   => handleSwipeEnd(e.changedTouches[0].clientY)}
    >
      {/* ── Blurred album art background ─────────────────────────────────── */}
      <div className="absolute inset-0 overflow-hidden" style={{ zIndex: 0 }}>
        {track.cover_url
          ? <img src={track.cover_url} alt="" className="w-full h-full object-cover"
              style={{ filter: "blur(60px) brightness(0.25) saturate(1.8)", transform: "scale(1.3)" }} />
          : null}
        <div className="absolute inset-0" style={{ background: "rgba(5,0,15,0.75)" }} />
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-col flex-1 px-6 overflow-hidden"
        style={{ paddingTop: "calc(env(safe-area-inset-top, 20px) + 12px)", paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}>

        {/* Top bar */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-10 h-1 rounded-full bg-white/25 mb-4" />
          <div className="flex items-center justify-between w-full">
            <button onClick={onClose}
              className="w-11 h-11 flex items-center justify-center rounded-full active:bg-white/10">
              <ChevronDown size={26} className="text-white/80" />
            </button>
            <div className="text-center">
              <p className="text-white/40 text-[10px] font-bold uppercase tracking-[0.2em]">Now Playing</p>
              {playing && <div className="flex justify-center mt-1"><NowPlayingBars playing size="xs" /></div>}
            </div>
            <button onClick={onShuffle}
              className="w-11 h-11 flex items-center justify-center rounded-full active:bg-white/10">
              <Shuffle size={18} className="text-white/60" />
            </button>
          </div>
        </div>

        {/* Album art */}
        <div className="flex justify-center mb-7">
          <div className="rounded-3xl overflow-hidden shadow-2xl"
            style={{ width: "min(72vw, 280px)", height: "min(72vw, 280px)",
                     boxShadow: "0 30px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)" }}>
            {track.cover_url
              ? <img src={track.cover_url} alt={track.title} className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg,#2d1b4e,#4b0082)" }}>
                  <Music2 size={72} className="text-white/20" />
                </div>}
          </div>
        </div>

        {/* Track info + like */}
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-white font-black text-[22px] leading-tight truncate">{track.title}</h2>
              {track.is_artist_verified && (
                <CheckCircle size={16} className="text-violet-400 fill-violet-400 shrink-0" />
              )}
            </div>
            <button
              onClick={() => { onClose(); onArtistClick(track.artist); }}
              className="text-white/55 text-sm truncate mt-0.5 text-left hover:text-white/80 transition-colors active:opacity-70">
              {track.artist}
            </button>
          </div>
          <button
            onClick={() => onToggleLike(track.id)}
            className="w-11 h-11 flex items-center justify-center rounded-full active:scale-90 transition-transform shrink-0"
            style={{ background: isLiked ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.08)" }}>
            <Heart size={20} className={isLiked ? "text-red-400 fill-red-400" : "text-white/50"} />
          </button>
        </div>

        {/* ── 30s preview banner ───────────────────────────────────────────── */}
        {isPaidPreview && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl mb-4"
            style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.25)" }}>
            <span className="text-sm">🎧</span>
            <div className="flex-1 min-w-0">
              <span className="text-violet-300 text-xs font-bold">Apèsi gratis</span>
              {previewSecsLeft !== null && previewSecsLeft > 0 && (
                <span className="text-white/40 text-xs ml-1.5">· {previewSecsLeft}s rete</span>
              )}
            </div>
            {track.price_usd && (
              <span className="text-violet-300 text-xs font-bold shrink-0">
                ${Number(track.price_usd).toFixed(2)}
              </span>
            )}
          </div>
        )}

        {/* ── Waveform — seekable ───────────────────────────────────────── */}
        <div className="mb-1">
          <div
            className="relative flex items-end gap-[2px] cursor-pointer"
            style={{ touchAction: "none", height: 52 }}
            onClick={e  => seekFromX(e.clientX, e.currentTarget)}
            onTouchStart={e => { seekRef.current = true; seekFromX(e.touches[0].clientX, e.currentTarget); e.stopPropagation(); }}
            onTouchMove={e  => { if (!seekRef.current) return; e.preventDefault(); e.stopPropagation(); seekFromX(e.touches[0].clientX, e.currentTarget); }}
            onTouchEnd={()  => { seekRef.current = false; }}
          >
            {Array.from({ length: 50 }, (_, i) => {
              const h = waveBarH(track.id, i);
              const isPast = (i / 50) < (pct / 100);
              return (
                <div key={i} className="flex-1 rounded-[2px]"
                  style={{
                    height: `${h}%`,
                    background: isPast ? "rgba(255,255,255,0.88)" : "rgba(255,255,255,0.18)",
                    transition: "background 60ms",
                  }} />
              );
            })}
            {/* Playhead line */}
            <div className="absolute inset-y-0 w-[2px] pointer-events-none rounded-full"
              style={{ left: `calc(${pct}% - 1px)`,
                       background: "rgba(255,255,255,0.9)",
                       boxShadow: "0 0 6px rgba(255,255,255,0.6)" }} />
          </div>
          {/* Time labels */}
          <div className="flex justify-between px-0.5 mt-1">
            <span className="text-white/45 text-[11px] font-mono tabular-nums">{fmtDur(Math.floor(currentTime))}</span>
            <span className="text-white/45 text-[11px] font-mono tabular-nums">-{fmtDur(timeLeft)}</span>
          </div>
        </div>

        {/* ── Playback controls ─────────────────────────────────────────── */}
        <div className="flex items-center justify-between mt-4">
          <button onClick={onPrev}
            className="w-14 h-14 flex items-center justify-center rounded-full active:scale-90 transition-transform">
            <SkipBack size={30} className="text-white" />
          </button>

          <button onClick={onToggle}
            className="flex items-center justify-center rounded-full active:scale-90 transition-transform"
            style={{ width: 72, height: 72,
                     background: "linear-gradient(135deg,#7c3aed,#c026d3)",
                     boxShadow: "0 6px 24px rgba(124,58,237,0.55)" }}>
            {playing
              ? <Pause  size={30} className="text-white" />
              : <Play   size={30} className="text-white ml-1" />}
          </button>

          <button onClick={onNext}
            className="w-14 h-14 flex items-center justify-center rounded-full active:scale-90 transition-transform">
            <SkipForward size={30} className="text-white" />
          </button>
        </div>

        {/* ── Secondary controls: shuffle · mute · radio ─────────────── */}
        <div className="flex items-center justify-center gap-3 mt-5">
          <button onClick={onShuffle}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full active:bg-white/10 transition-all"
            style={{ background: "rgba(255,255,255,0.08)" }}>
            <Shuffle size={14} className="text-white/50" />
            <span className="text-white/40 text-xs">Mix</span>
          </button>
          <button onClick={onMute}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full active:bg-white/10 transition-all"
            style={{ background: "rgba(255,255,255,0.08)" }}>
            {muted
              ? <><VolumeX size={14} className="text-white/50" /><span className="text-white/40 text-xs">Mute</span></>
              : <><Volume2 size={14} className="text-white/70" /><span className="text-white/50 text-xs">Son</span></>}
          </button>
          <button onClick={onToggleRadio}
            className="flex items-center gap-1.5 px-4 py-2 rounded-full active:scale-95 transition-all"
            style={{ background: radioMode ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.08)" }}>
            <Radio size={14} className={radioMode ? "text-violet-400" : "text-white/50"} />
            <span className={`text-xs font-semibold ${radioMode ? "text-violet-400" : "text-white/40"}`}>
              Radio
            </span>
          </button>
        </div>

        {/* ── Lyrics ────────────────────────────────────────────────────── */}
        {track.lyrics ? (
          <div className="mt-5">
            <button
              onClick={() => setLyricsOpen(o => !o)}
              className="flex items-center gap-2 w-full py-2">
              <span className="text-white/50 text-sm font-bold">🎵 Paròl</span>
              <ChevronDown size={14} className={`text-white/30 transition-transform ${lyricsOpen ? "rotate-180" : ""}`} />
            </button>
            {lyricsOpen && (
              <div className="mt-1 rounded-2xl px-4 py-3 max-h-52 overflow-y-auto"
                style={{ background: "rgba(255,255,255,0.05)" }}>
                <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">{track.lyrics}</p>
              </div>
            )}
          </div>
        ) : null}

      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function FlexaMusic() {
  const { user } = useAuth();
  const { t } = useTranslation();
  const isAdmin = (user as any)?.isAdmin === true || (user as any)?.role === "admin";
  const [, setLocation] = useLocation();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [tracks,       setTracks]       = useState<Track[]>([]);
  const [loading,      setLoading]      = useState(true);  // initial page load only
  const [searchLoading, setSearchLoading] = useState(false); // search refetch — never unmounts HomeView
  const [filterQ, setFilterQ] = useState("");

  // ── Likes ─────────────────────────────────────────────────────────────────
  const [liked, setLiked] = useState<Set<number>>(getLiked);
  const toggleLike = (id: number) => {
    setLiked(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      saveLiked(next);
      return next;
    });
  };

  // ── Artist follows ────────────────────────────────────────────────────────
  const getFollowed = () => {
    try { const r = localStorage.getItem("flexa_followed_artists"); return r ? new Set<number>(JSON.parse(r)) : new Set<number>(); }
    catch { return new Set<number>(); }
  };
  const saveFollowed = (s: Set<number>) => localStorage.setItem("flexa_followed_artists", JSON.stringify([...s]));
  const [followedArtists, setFollowedArtists] = useState<Set<number>>(getFollowed);
  const toggleFollow = async (artistId: number, follow: boolean) => {
    setFollowedArtists(prev => {
      const next = new Set(prev); follow ? next.add(artistId) : next.delete(artistId);
      saveFollowed(next); return next;
    });
    try {
      const token = localStorage.getItem("flexamarket_token") ?? sessionStorage.getItem("flexamarket_token") ?? "";
      await fetch(`/api/users/${artistId}/follow`, {
        method: follow ? "POST" : "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch { /* optimistic — UI already updated */ }
  };

  // ── Purchased tracks (server-synced into localStorage on mount) ──────────
  const [purchasedIds, setPurchasedIds] = useState<Set<number>>(() => {
    // hydrate from localStorage so paywall is instant on re-open
    try {
      const uid = (user as any)?.id;
      if (!uid) return new Set<number>();
      const stored = localStorage.getItem(`flexa_owns_all_${uid}`);
      return stored ? new Set<number>(JSON.parse(stored)) : new Set<number>();
    } catch { return new Set<number>(); }
  });

  // ── View state ────────────────────────────────────────────────────────────
  const [view, setView]             = useState<View>("home");
  const [artistViewName, setArtistViewName] = useState<string | null>(null);
  const [radioMode, setRadioMode]   = useState(true); // auto-play similar genre when queue ends
  const [artistPlanSongCount, setArtistPlanSongCount] = useState(0);
  const [paywallTrack, setPaywallTrack]   = useState<Track | null>(null);
  const [paywallPlayCount, setPaywallPlayCount] = useState(0);
  const [focusSearch, setFocusSearch] = useState(false);
  const [planToast, setPlanToast]   = useState(false);
  const [playlist,  setPlaylist]    = useState<Track[]>([]);
  const [plTitle,   setPlTitle]     = useState("");
  const [plCover,   setPlCover]     = useState<string | null>(null);
  const [plGrad,    setPlGrad]      = useState<string | undefined>(undefined);

  // ── Player state ──────────────────────────────────────────────────────────
  const [playerState, setPlayerState] = useState<PlayerState>({
    track: null, playing: false, currentTime: 0, duration: 0, muted: false, volume: 1,
  });
  const [queue,    setQueue]    = useState<Track[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);

  // Use the module-level singleton so audio persists across route changes
  const audioRef    = useRef(gAudio);
  const listenRef   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playNextRef = useRef<() => void>(() => {});
  const [showNowPlaying, setShowNowPlaying] = useState(false);

  // Always-current refs — lets useCallback/effects read fresh values without
  // adding purchasedIds/user to deps (avoids stale-closure paywall bypass).
  const purchasedIdsRef = useRef<Set<number>>(purchasedIds);
  const userRef         = useRef<any>(user);
  useEffect(() => { purchasedIdsRef.current = purchasedIds; }, [purchasedIds]);
  useEffect(() => { userRef.current = user; }, [user]);

  // ── Register mount/unmount with global store ──────────────────────────────
  useEffect(() => {
    setFlexaMusicMounted(true);
    return () => setFlexaMusicMounted(false);
  }, []);

  // ── Plan-activated / purchase-completed URL params ────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    window.history.replaceState({}, "", window.location.pathname);

    if (params.get("plan") === "activated") {
      setPlanToast(true);
      setTimeout(() => setPlanToast(false), 6000);
    }

    const purchasedTrackId = params.get("purchased");
    if (purchasedTrackId) {
      const tid = Number(purchasedTrackId);
      if (tid) {
        // Persist so the fetch-effect can merge it even if user loads later
        sessionStorage.setItem("flexa_pending_purchase", String(tid));
        markPurchased((user as any)?.id, tid);
        setPurchasedIds(prev => new Set([...prev, tid]));
      }
    }
  }, []);

  // ── Fetch purchased track IDs once on mount (sync localStorage) ──────────
  useEffect(() => {
    const uid = (user as any)?.id;
    if (!uid) return;
    const token = localStorage.getItem("flexamarket_token") ?? sessionStorage.getItem("flexamarket_token") ?? "";
    fetch("/api/music/purchased", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        const ids: number[] = d.purchasedIds ?? [];
        // Merge any pending purchase from Stripe redirect (webhook may not have fired yet)
        const pendingTid = Number(sessionStorage.getItem("flexa_pending_purchase") ?? "0");
        const merged = pendingTid && !ids.includes(pendingTid) ? [...ids, pendingTid] : ids;
        if (pendingTid) sessionStorage.removeItem("flexa_pending_purchase");
        merged.forEach(id => markPurchased(uid, id));
        localStorage.setItem(`flexa_owns_all_${uid}`, JSON.stringify(merged));
        setPurchasedIds(new Set(merged));
      })
      .catch(() => {});
  }, [(user as any)?.id]);

  // ── Upload gate: check song count before showing upload view ──────────────
  const handleUploadClick = async () => {
    if (isAdmin) { setView("upload"); return; }
    try {
      const token = localStorage.getItem("flexamarket_token") ?? sessionStorage.getItem("flexamarket_token") ?? "";
      const res = await fetch("/api/music/artist/plan", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.isArtistPlan || data.songCount < data.freeSongLimit) {
        setArtistPlanSongCount(data.songCount); // passed to UploadView for warning banner
        setView("upload");
      } else {
        setArtistPlanSongCount(data.songCount);
        setView("artist-plan");
      }
    } catch {
      // If the plan-check API is unreachable, don't open upload — backend will block anyway.
      // Show a soft retry nudge by doing nothing (user can tap the button again).
    }
  };

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      // Initial load → full-page spinner (HomeView not yet mounted).
      // Search refetch → subtle in-results spinner only; never unmount HomeView.
      if (filterQ) setSearchLoading(true);
      else          setLoading(true);
      try {
        const p = new URLSearchParams();
        if (filterQ) p.set("search", filterQ);
        const res  = await fetch(`/api/music?${p}`);
        const data = await res.json();
        setTracks(data.tracks ?? []);
      } catch { setTracks([]); }
      finally { setLoading(false); setSearchLoading(false); }
    })();
  }, [filterQ]);

  // ── Audio events ──────────────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime  = () => setPlayerState(s => ({ ...s, currentTime: audio.currentTime }));
    const onDur   = () => {
      const d = audio.duration;
      if (d && isFinite(d)) setPlayerState(s => ({ ...s, duration: d }));
    };
    const onEnd     = () => playNextRef.current();
    // "play"    → intent to play (paused may still be true during buffering on iOS)
    // "playing" → audio is ACTUALLY playing (this is the reliable one on iOS Safari)
    const onPlay    = () => setPlayerState(s => ({ ...s, playing: true }));
    const onPlaying = () => setPlayerState(s => ({ ...s, playing: true }));
    const onPause   = () => { setPlayerState(s => ({ ...s, playing: false })); stopTimer(); };
    const onWaiting = () => setPlayerState(s => ({ ...s, playing: false }));
    audio.addEventListener("timeupdate",      onTime);
    audio.addEventListener("durationchange",  onDur);
    audio.addEventListener("loadedmetadata",  onDur);
    audio.addEventListener("ended",           onEnd);
    audio.addEventListener("play",            onPlay);
    audio.addEventListener("playing",         onPlaying);
    audio.addEventListener("pause",           onPause);
    audio.addEventListener("waiting",         onWaiting);
    return () => {
      audio.removeEventListener("timeupdate",      onTime);
      audio.removeEventListener("durationchange",  onDur);
      audio.removeEventListener("loadedmetadata",  onDur);
      audio.removeEventListener("ended",           onEnd);
      audio.removeEventListener("play",            onPlay);
      audio.removeEventListener("playing",         onPlaying);
      audio.removeEventListener("pause",           onPause);
      audio.removeEventListener("waiting",         onWaiting);
    };
  }, []);

  // ── Fallback timer — iOS Safari throttles timeupdate; poll every 250 ms
  //    to keep currentTime ticking AND reconcile the playing flag with the
  //    real audio element state (fixes frozen timer + stuck play icon)
  useEffect(() => {
    const id = setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      // Don't rely on readyState — just mirror what the browser reports
      const actuallyPlaying = !audio.paused && !audio.ended;
      setPlayerState(s => {
        const playingChanged = s.playing !== actuallyPlaying;
        const timeChanged    = actuallyPlaying && s.currentTime !== audio.currentTime;
        if (!playingChanged && !timeChanged) return s;
        return {
          ...s,
          playing:     actuallyPlaying,
          currentTime: actuallyPlaying ? audio.currentTime : s.currentTime,
        };
      });
    }, 250);
    return () => clearInterval(id);
  }, []);

  // ── 30s preview gate — paid tracks that haven't been purchased stop at 30s ──
  useEffect(() => {
    const track = playerState.track;
    if (!track || track.monetization_type !== "sale") return;
    if (purchasedIdsRef.current.has(track.id)) return;
    if (!playerState.playing || playerState.currentTime < 30) return;
    // Reached 30 seconds — stop the impression timer (so it won't increment
    // a second time), pause, and surface the paywall.
    stopTimer();
    const uid = userRef.current?.id;
    const cnt = incrementPlayCount(uid, track.id);
    gAudio?.pause();
    setPaywallTrack(track);
    setPaywallPlayCount(cnt);
    setView("paywall");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerState.currentTime, playerState.playing, playerState.track]);

  // ── MediaSession ──────────────────────────────────────────────────────────
  useEffect(() => {
    const track = playerState.track;
    if (!("mediaSession" in navigator) || !track) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title, artist: track.artist, album: track.album ?? "",
      artwork: track.cover_url ? [{ src: track.cover_url, sizes: "512x512", type: "image/jpeg" }] : [],
    });
    // ← Critical: iOS only shows the lock-screen widget when playbackState is
    //   set explicitly. Without this the Now Playing bar never appears.
    navigator.mediaSession.playbackState = playerState.playing ? "playing" : "paused";
    // Use gAudio (the global singleton) — NOT audioRef — so these handlers
    // stay valid after FlexaMusic unmounts (user navigates away mid-song).
    navigator.mediaSession.setActionHandler("play",          () => gAudio.play().catch(() => {}));
    navigator.mediaSession.setActionHandler("pause",         () => gAudio.pause());
    navigator.mediaSession.setActionHandler("nexttrack",     () => musicPlayNext());
    navigator.mediaSession.setActionHandler("previoustrack", () => musicPlayPrev());
    navigator.mediaSession.setActionHandler("seekto",        d  => { if (d.seekTime != null) musicSeek(d.seekTime); });
    // iOS lock screen shows ±10s skip buttons
    navigator.mediaSession.setActionHandler("seekforward",   d  => musicSeek(Math.min(gAudio.currentTime + (d.seekOffset ?? 10), gAudio.duration || 0)));
    navigator.mediaSession.setActionHandler("seekbackward",  d  => musicSeek(Math.max(gAudio.currentTime - (d.seekOffset ?? 10), 0)));
  }, [playerState.track, playerState.playing]);

  // ── Impression timer ──────────────────────────────────────────────────────
  const stopTimer  = () => { if (listenRef.current) { clearTimeout(listenRef.current); listenRef.current = null; } };
  const startTimer = (id: number, track?: Track) => {
    stopTimer();
    listenRef.current = setTimeout(() => {
      logImpression(id, 31);
      // Count paid-track listens ONLY for "sale" tracks not yet purchased
      if (track?.monetization_type === "sale" && !purchasedIds.has(id)) {
        const newCount = incrementPlayCount((user as any)?.id, id);
        if (newCount >= FREE_PLAYS) {
          // Pause audio and surface the paywall
          gAudio?.pause();
          setPaywallTrack(track);
          setPaywallPlayCount(newCount);
          setView("paywall");
        }
      }
    }, 31_000);
  };

  // ── Playback ──────────────────────────────────────────────────────────────
  const playTrack = useCallback((track: Track, newQueue?: Track[], idx?: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    // ── Paywall gate — blocks sale tracks from PlayerView skip/queue too ──────
    const uid = userRef.current?.id;
    if (
      track.monetization_type === "sale" &&
      !purchasedIdsRef.current.has(track.id) &&
      !isPurchasedLocally(uid, track.id) &&
      getPlayCount(uid, track.id) >= FREE_PLAYS
    ) {
      gAudio?.pause();
      setPaywallTrack(track);
      setPaywallPlayCount(getPlayCount(uid, track.id));
      setView("paywall");
      return;
    }
    if (newQueue) { setQueue(newQueue); setQueueIdx(idx ?? 0); }
    stopTimer();
    audio.pause();
    audio.src     = track.audio_url ?? "";
    audio.muted   = playerState.muted;
    audio.volume  = playerState.volume;
    audio.load();   // ← required on iOS Safari after src change
    setPlayerState(s => ({ ...s, track, playing: false, currentTime: 0, duration: 0 }));

    // ── Keep global musicStore in sync so GlobalMusicPlayer always shows
    //    the correct track when the user navigates away from /music.
    //    This is the critical line: without it, if the user changes tracks
    //    inside PlayerView and then opens any other page, _s.track is stale
    //    and GlobalMusicPlayer returns null (music appears to stop).
    {
      const patch: Partial<Parameters<typeof patchMusicState>[0]> = {
        track,
        plTitle: track.title,
        plCover: track.cover_url ?? null,
      };
      if (newQueue !== undefined) { patch.queue = newQueue; patch.queueIdx = idx ?? 0; }
      patchMusicState(patch);
    }

    if (track.audio_url) {
      audio.play().then(() => {
        // play() resolved → audio is definitely playing; mirror that into state
        setPlayerState(s => ({ ...s, playing: true }));
      }).catch(() => {
        // autoplay blocked or load error — state stays paused, that's correct
      });
      if (track.id) startTimer(track.id, track);
    }
  }, [playerState.muted, playerState.volume]);

  const playNext = useCallback(() => {
    // ── If there's a next track in the current queue, play it normally ────────
    if (queue.length && queueIdx + 1 < queue.length) {
      const next = queueIdx + 1;
      setQueueIdx(next);
      playTrack(queue[next], queue, next);
      return;
    }

    // ── Queue exhausted (or empty): auto-play from same genre (only in radio mode)
    const cur = playerState.track;
    if (!cur || !tracks.length || !radioMode) return;

    // Build same-genre pool (exclude the just-played track)
    const genre = cur.genre ?? "";
    let pool = genre
      ? tracks.filter(t => t.id !== cur.id && t.genre === genre)
      : [];

    // Genre too small? Fall back to all tracks except current
    if (pool.length < 2) {
      pool = tracks.filter(t => t.id !== cur.id);
    }
    if (!pool.length) return;

    // Shuffle so every auto-play session feels fresh
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    setQueue(shuffled);
    setQueueIdx(0);
    playTrack(shuffled[0], shuffled, 0);
  }, [queue, queueIdx, playTrack, playerState.track, tracks]);

  // ── Keep playNextRef fresh so the audio "ended" handler never captures a stale closure
  // (must appear AFTER playNext is declared to avoid a TDZ crash in production builds)
  useEffect(() => { playNextRef.current = playNext; }, [playNext]);

  const playPrev = useCallback(() => {
    if (!queue.length) return;
    const prev = (queueIdx - 1 + queue.length) % queue.length;
    setQueueIdx(prev); playTrack(queue[prev], queue, prev);
  }, [queue, queueIdx, playTrack]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !playerState.track) return;
    audio.paused ? audio.play().catch(() => {}) : audio.pause();
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setPlayerState(s => ({ ...s, muted: !s.muted }));
  };

  const seek = (t: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = t;
    setPlayerState(s => ({ ...s, currentTime: t }));
  };

  const closePlayer = () => {
    audioRef.current?.pause();
    stopTimer();
    setPlayerState(s => ({ ...s, track: null, playing: false }));
  };

  const shuffleQueue = () => {
    if (!queue.length) return;
    const sh = [...queue].sort(() => Math.random() - 0.5);
    setQueue(sh); setQueueIdx(0); playTrack(sh[0], sh, 0);
  };

  // ── Open a mix / playlist ─────────────────────────────────────────────────
  const openMix = (mix: Mix) => {
    if (!mix.tracks.length) return;
    setPlaylist(mix.tracks);
    setPlTitle(mix.label + " · " + mix.subtitle);
    setPlCover(mix.cover);
    setPlGrad(mix.gradient);
    setView("player");
    patchMusicState({ track: mix.tracks[0], queue: mix.tracks, queueIdx: 0, plTitle: mix.label + " · " + mix.subtitle, plCover: mix.cover, plGrad: mix.gradient });
    playTrack(mix.tracks[0], mix.tracks, 0);
  };

  // ── Open track from home → auto-switch to player view ─────────────────────
  const openTrack = (track: Track, q: Track[], idx: number) => {
    // ── Paywall gate: "sale" tracks with ≥ FREE_PLAYS listens and not bought ─
    if (
      track.monetization_type === "sale" &&
      !purchasedIds.has(track.id) &&
      !isPurchasedLocally((user as any)?.id, track.id) &&
      getPlayCount((user as any)?.id, track.id) >= FREE_PLAYS
    ) {
      gAudio?.pause();
      setPaywallTrack(track);
      setPaywallPlayCount(getPlayCount((user as any)?.id, track.id));
      setView("paywall");
      return;
    }

    setPlaylist(q);
    setPlTitle(track.title);
    setPlCover(track.cover_url);
    setPlGrad(undefined);
    setView("player");
    // Sync to global store so GlobalMusicPlayer can display info when user navigates away
    patchMusicState({ track, queue: q, queueIdx: idx, plTitle: track.title, plCover: track.cover_url, plGrad: undefined });
    playTrack(track, q, idx);
  };

  // ── Admin: edit / delete ──────────────────────────────────────────────────
  const [editTrack, setEditTrack] = useState<Track | null>(null);

  const handleEdit = (track: Track) => setEditTrack(track);

  const handleEditSaved = (updated: Track) => {
    setTracks(prev => prev.map(t => t.id === updated.id ? { ...t, ...updated } : t));
    if (playerState.track?.id === updated.id) {
      setPlayerState(s => ({ ...s, track: { ...s.track!, ...updated } }));
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(t("music.confirmDeleteQ"))) return;
    try {
      const token = localStorage.getItem("flexamarket_token") ?? sessionStorage.getItem("flexamarket_token") ?? "";
      const res = await fetch(`/api/admin/music/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).error ?? res.statusText);
      setTracks(prev => prev.filter(t => t.id !== id));
      if (playerState.track?.id === id) closePlayer();
    } catch (e: any) {
      alert(e.message);
    }
  };

  // ── After a successful upload: prepend track, play it, go home ─────────────
  const handleUploadSuccess = (track: Track) => {
    const updated = [track, ...tracks];
    setTracks(updated);
    setView("home");
    // Small delay so the home view renders before we start playback
    setTimeout(() => openTrack(track, updated, 0), 120);
  };

  // Single return — <audio> is ALWAYS the first child so audioRef.current is
  // populated from the very first render and is never null, regardless of the
  // loading / view state. Two separate early-returns each with their own <audio>
  // caused a brief null window during the loading→ready transition.
  return (
    <>
      {/* audio lives in the global musicStore singleton — no <audio> element here */}

      {/* ── Plan-activated toast ── */}
      {planToast && (
        <div style={{
          position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
          background: "linear-gradient(135deg,#7c3aed,#c026d3)",
          color: "#fff", borderRadius: 16, padding: "12px 20px",
          fontWeight: 700, fontSize: 14, zIndex: 9999,
          boxShadow: "0 8px 32px rgba(124,58,237,0.5)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          🎉 Plan Artis aktive! Ou ka telechaje san limit kounye a.
        </div>
      )}

      {loading ? (
        <div style={{ background: "#0a0a0a", minHeight: "100vh" }} className="flex items-center justify-center">
          <Loader2 size={32} className="animate-spin" style={{ color: "#7c3aed" }} />
        </div>
      ) : view === "artist" && artistViewName ? (
        <ArtistView
          artistName={artistViewName}
          tracks={tracks}
          liked={liked}
          purchasedIds={purchasedIds}
          currentTrackId={playerState.track?.id}
          currentTrackPlaying={playerState.playing}
          followedArtists={followedArtists}
          onBack={() => setView("home")}
          onPlay={openTrack}
          onToggleLike={toggleLike}
          onToggleFollow={toggleFollow}
        />
      ) : view === "paywall" && paywallTrack ? (
        <SongPaywallView
          track={paywallTrack}
          userId={(user as any)?.id}
          playCount={paywallPlayCount}
          onBought={() => {
            setPurchasedIds(prev => new Set([...prev, paywallTrack.id]));
            // Play the song now that it's unlocked
            openTrack(paywallTrack, tracks, 0);
          }}
          onBack={() => setView("home")}
        />
      ) : view === "artist-plan" ? (
        <ArtistPlanView
          songCount={artistPlanSongCount}
          onBack={() => setView("home")}
        />
      ) : view === "upload" ? (
        <UploadView
          onBack={() => setView("home")}
          onSuccess={handleUploadSuccess}
          onPlanRequired={(cnt) => { setArtistPlanSongCount(cnt); setView("artist-plan"); }}
          songCount={artistPlanSongCount}
        />
      ) : view === "home" ? (
        <HomeView
          tracks={tracks}
          liked={liked}
          user={user}
          isAdmin={isAdmin}
          purchasedIds={purchasedIds}
          currentTrackId={playerState.track?.id}
          currentTrackPlaying={playerState.playing}
          onPlay={openTrack}
          onPlayList={openMix}
          onToggleLike={toggleLike}
          onSearch={setFilterQ}
          onUpload={handleUploadClick}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onBuy={(t) => { setPaywallTrack(t); setPaywallPlayCount(0); setView("paywall"); }}
          setLocation={setLocation}
          autoFocusSearch={focusSearch}
          onFocusHandled={() => setFocusSearch(false)}
          searchLoading={searchLoading}
        />
      ) : (
        <PlayerView
          playlist={playlist}
          playlistTitle={plTitle}
          playlistCover={plCover}
          playlistGrad={plGrad}
          playerState={playerState}
          liked={liked}
          isAdmin={isAdmin}
          purchasedIds={purchasedIds}
          followedArtists={followedArtists}
          onBack={() => setView("home")}
          onSearchRequest={() => { setView("home"); setFocusSearch(true); }}
          onToggleFollow={toggleFollow}
          onPlay={(t, idx) => playTrack(t, playlist, idx)}
          onToggle={togglePlay}
          onToggleLike={toggleLike}
          onDownload={downloadTrack}
          onShuffle={shuffleQueue}
          onNext={playNext}
          onPrev={playPrev}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onAdTap={(id) => setLocation(`/listings/${id}`)}
          onBuy={(t) => { setPaywallTrack(t); setPaywallPlayCount(0); setView("paywall"); }}
        />
      )}

      {/* Edit modal */}
      {editTrack && (
        <EditTrackModal
          track={editTrack}
          onClose={() => setEditTrack(null)}
          onSaved={handleEditSaved}
        />
      )}

      {/* Mini player — visible in both views */}
      <MiniPlayer
        state={playerState}
        audioRef={audioRef}
        onPrev={playPrev}
        onNext={playNext}
        onClose={closePlayer}
        onToggle={togglePlay}
        onMute={toggleMute}
        onSeek={seek}
        onExpand={() => playerState.track && setShowNowPlaying(true)}
      />

      {/* Full-screen Now Playing modal */}
      {showNowPlaying && playerState.track && (
        <NowPlayingModal
          playerState={playerState}
          liked={liked}
          onClose={() => setShowNowPlaying(false)}
          onToggle={togglePlay}
          onPrev={playPrev}
          onNext={playNext}
          onToggleLike={toggleLike}
          onSeek={seek}
          onShuffle={shuffleQueue}
          onMute={toggleMute}
          isPaidPreview={
            playerState.track.monetization_type === "sale" &&
            !purchasedIds.has(playerState.track.id)
          }
          radioMode={radioMode}
          onToggleRadio={() => setRadioMode(r => !r)}
          onArtistClick={(name) => {
            setShowNowPlaying(false);
            setArtistViewName(name);
            setView("artist");
          }}
        />
      )}

    </>
  );
}
