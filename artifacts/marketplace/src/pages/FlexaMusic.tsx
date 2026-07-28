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
  Bell, MessageCircle, ChevronLeft, Plus, Loader2, Globe,
  Music2, UploadCloud, BarChart2, CheckCircle, AlertCircle, Image as ImageIcon,
  Pencil, Trash2, ShoppingBag,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { useLocation } from "wouter";
import { useMusicUpload } from "@/contexts/MusicUpload";

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
  is_featured: boolean;
  play_count: number;
  valid_impressions: number;
  artist_user_id: number | null;
};

type Mix = {
  id: string;
  label: string;       // "MIX 1" etc.
  subtitle: string;
  tracks: Track[];
  cover: string | null;
  gradient: string;
};

type View = "home" | "player" | "upload";

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
async function downloadTrack(track: Track) {
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
function MoreSheet({ track, liked, onClose, onLike, onDownload }:
  { track: Track; liked: boolean; onClose: () => void; onLike: () => void; onDownload: () => void }) {
  const { t } = useTranslation();
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
        {/* Options */}
        {[
          { icon: liked ? "❤️" : "🤍", label: liked ? t("music.removeFromFavorites") : t("music.addToFavorites"), action: () => { onLike(); onClose(); } },
          { icon: "⬇️", label: t("music.download"),    action: () => { onDownload(); onClose(); } },
          { icon: "🔗", label: t("music.shareTrack"),  action: onClose },
          { icon: "🚩", label: t("music.reportTrack"), action: onClose },
        ].map(({ icon, label, action }) => (
          <button key={label} onClick={action}
            className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-white/5 transition-colors">
            <span className="text-xl w-7 text-center">{icon}</span>
            <span className="text-white text-sm font-medium">{label}</span>
          </button>
        ))}
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

  const onPickCover = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCoverFile(f);
    setCoverPreview(URL.createObjectURL(f));
  };

  const save = async () => {
    if (!title.trim()) { setErrMsg("Tit obligatwa"); return; }
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
          <p className="text-white font-bold text-base">Modifye chante</p>
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
            <p className="text-white/60 text-xs font-semibold">Thumbnail / Cover</p>
            <button type="button" onClick={() => coverRef.current?.click()}
              className="text-violet-400 text-xs font-bold mt-0.5">
              {coverPreview ? "Chanje foto" : "Ajoute foto"}
            </button>
          </div>
          <input ref={coverRef} type="file" accept="image/*" className="hidden" onChange={onPickCover} />
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-white/40 mb-1 block">Tit</label>
            <input value={title} onChange={e => setTitle(e.target.value)}
              className="w-full bg-white/5 text-white text-sm rounded-xl px-3 py-2.5 outline-none border border-white/10 focus:border-violet-500"
            />
          </div>
          <div>
            <label className="text-xs text-white/40 mb-1 block">Atis</label>
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
          {saving ? <Loader2 size={16} className="animate-spin mx-auto" /> : "Anrejistre"}
        </button>
      </div>
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
  if (!track) return null;
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  return (
    <div className="fixed bottom-16 left-0 right-0 mx-3 z-40 rounded-2xl overflow-hidden select-none shadow-2xl"
      style={{ background: "linear-gradient(135deg,#1e0a3c,#2d1b4e)", border: "1px solid rgba(139,92,246,0.35)" }}>
      {/* Progress bar */}
      <div className="h-0.5 bg-white/10 cursor-pointer"
        onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onSeek(((e.clientX - r.left) / r.width) * (duration || 0)); }}>
        <div className="h-full bg-violet-400 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center gap-2.5 px-3 py-2">
        {/* Cover — tap to expand */}
        <button onClick={onExpand} className="shrink-0">
          <CoverArt src={track.cover_url} title={track.title} size={38} radius={8} />
        </button>
        {/* Info */}
        <button onClick={onExpand} className="flex-1 min-w-0 text-left">
          <p className="text-white text-xs font-bold truncate">{track.title}</p>
          <p className="text-white/50 text-[10px] truncate">{track.artist}</p>
        </button>
        {/* Time */}
        <span className="text-white/30 text-[10px] shrink-0">{fmtDur(Math.floor(currentTime))}</span>
        {/* Controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button onClick={onPrev} className="w-7 h-7 flex items-center justify-center"><SkipBack size={13} className="text-white/70" /></button>
          <button onClick={onToggle} className="w-9 h-9 rounded-full bg-white/15 flex items-center justify-center">
            {playing ? <Pause size={14} className="text-white" /> : <Play size={14} className="text-white ml-0.5" />}
          </button>
          <button onClick={onNext} className="w-7 h-7 flex items-center justify-center"><SkipForward size={13} className="text-white/70" /></button>
          <button onClick={onMute} className="w-7 h-7 flex items-center justify-center">
            {muted ? <VolumeX size={12} className="text-white/40" /> : <Volume2 size={12} className="text-white/60" />}
          </button>
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center"><X size={13} className="text-white/40" /></button>
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
function UploadView({ onBack, onSuccess }: {
  onBack: () => void;
  onSuccess: (track: Track) => void;
}) {
  const { t } = useTranslation();
  const { start: startUpload } = useMusicUpload();

  const [title,   setTitle]   = useState("");
  const [artist,  setArtist]  = useState("");
  const [album,   setAlbum]   = useState("");
  const [genre,   setGenre]   = useState("");
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

    // Hand off to global context — XHR survives component unmount
    startUpload(
      audioFile,
      coverFile,
      {
        title:   title.trim(),
        artist:  artist.trim(),
        album:   album.trim() || undefined,
        genre:   genre || undefined,
        type:    "free",
        coverPreview: coverPreview ?? undefined,
      },
      (track) => onSuccess(track),
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
function HomeView({ tracks, liked, user, isAdmin, onPlay, onPlayList, onToggleLike, onSearch, onUpload, onEdit, onDelete, setLocation }:
  { tracks: Track[]; liked: Set<number>; user: any; isAdmin: boolean;
    onPlay: (t: Track, q: Track[], i: number) => void;
    onPlayList: (mix: Mix) => void;
    onToggleLike: (id: number) => void;
    onSearch: (q: string) => void;
    onUpload: () => void;
    onEdit: (t: Track) => void;
    onDelete: (id: number) => void;
    setLocation: (p: string) => void; }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");

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
          onClick={() => setLocation(isAdmin ? "/admin/music" : user ? "/music/earnings" : "/music")}
          className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold"
          style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", color: "#fff" }}>
          <span className="text-xs">🎵</span> {t("music.artistStudio")}
        </button>
        <div className="flex-1" />
        <button onClick={onUpload}
          className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#1a1a1a" }}>
          <UploadCloud size={17} className="text-white/80" />
        </button>
        <button onClick={() => setLocation("/notifications")}
          className="w-9 h-9 rounded-full flex items-center justify-center relative" style={{ background: "#1a1a1a" }}>
          <Bell size={17} className="text-white/80" />
        </button>
        <button onClick={() => setLocation("/messages")}
          className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "#1a1a1a" }}>
          <MessageCircle size={17} className="text-white/80" />
        </button>
      </div>

      {/* ── Search ── */}
      <form onSubmit={handleSearch} className="px-4 mb-5">
        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5"
          style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)" }}>
          <Search size={15} className="text-white/40 shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t("music.searchPlaceholder")}
            className="flex-1 bg-transparent text-white text-sm placeholder:text-white/30 outline-none"
          />
          {search && <button type="button" onClick={() => setSearch("")}><X size={13} className="text-white/30" /></button>}
        </div>
      </form>

      {tracks.length === 0 ? (
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
                </button>
              ))}
            </div>
          </div>

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
                      <CoverArt src={track.cover_url} title={track.title} size={46} radius={6} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold truncate">{track.title}</p>
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
                    {isAdmin && <>
                      <button onClick={() => onEdit(track)}
                        className="w-7 h-7 flex items-center justify-center rounded-full shrink-0"
                        style={{ background: "rgba(124,58,237,0.15)" }}>
                        <Pencil size={13} className="text-violet-400" />
                      </button>
                      <button onClick={() => onDelete(track.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-full shrink-0"
                        style={{ background: "rgba(239,68,68,0.12)" }}>
                        <Trash2 size={13} className="text-red-400" />
                      </button>
                    </>}
                  </div>
                );
              })}
            </div>
          </div>
        </>
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
    fetch("/api/listings?limit=20")
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
// PLAYER VIEW (playlist/track detail)
// ══════════════════════════════════════════════════════════════════════════════
function PlayerView({ playlist, playlistTitle, playlistCover, playlistGrad,
  playerState, liked, isAdmin, onBack, onPlay, onToggle, onToggleLike, onDownload, onShuffle, onNext, onPrev, onEdit, onDelete, onAdTap }:
  { playlist: Track[]; playlistTitle: string; playlistCover: string | null; playlistGrad?: string;
    playerState: PlayerState; liked: Set<number>; isAdmin: boolean;
    onBack: () => void; onPlay: (t: Track, idx: number) => void;
    onToggle: () => void; onToggleLike: (id: number) => void;
    onDownload: (t: Track) => void; onShuffle: () => void;
    onNext: () => void; onPrev: () => void;
    onEdit: (t: Track) => void; onDelete: (id: number) => void;
    onAdTap: (id: number) => void; }) {
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
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 rounded-xl px-3 py-2"
            style={{ background: "#1a1a1a", border: "1px solid rgba(255,255,255,0.07)" }}>
            <Search size={14} className="text-white/30 shrink-0" />
            <span className="text-white/30 text-sm">{t("music.searchPlaceholder")}</span>
          </div>
        </div>
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
        <button onClick={() => currentTrack && onToggleLike(currentTrack.id)}
          className="w-10 h-10 flex items-center justify-center rounded-full" style={{ background: "#1c1c1c" }}>
          <Heart size={20} className={isLiked ? "text-red-400 fill-red-400" : "text-white/60"} />
        </button>
        <button onClick={() => currentTrack && onDownload(currentTrack)}
          className="w-10 h-10 flex items-center justify-center rounded-full" style={{ background: "#1c1c1c" }}>
          <Download size={18} className="text-white/60" />
        </button>
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
        <button onClick={onToggle}
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

      {/* ── "Basé sur…" ── */}
      {currentTrack && (
        <div className="px-5 mb-4">
          <p className="text-white/30 text-xs">{t("music.basedOn", { title: currentTrack.title })}</p>
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
                <CoverArt src={track.cover_url} title={track.title} size={44} radius={8} />
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
              {isAdmin && <>
                <button onClick={() => onEdit(track)}
                  className="w-7 h-7 flex items-center justify-center rounded-full shrink-0"
                  style={{ background: "rgba(124,58,237,0.15)" }}>
                  <Pencil size={13} className="text-violet-400" />
                </button>
                <button onClick={() => onDelete(track.id)}
                  className="w-7 h-7 flex items-center justify-center rounded-full shrink-0"
                  style={{ background: "rgba(239,68,68,0.12)" }}>
                  <Trash2 size={13} className="text-red-400" />
                </button>
              </>}
            </div>
          );
        })}
      </div>

      {/* More sheet */}
      {moreTrack && (
        <MoreSheet
          track={moreTrack}
          liked={liked.has(moreTrack.id)}
          onClose={() => setMoreTrack(null)}
          onLike={() => onToggleLike(moreTrack.id)}
          onDownload={() => onDownload(moreTrack)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export default function FlexaMusic() {
  const { user } = useAuth();
  const isAdmin = (user as any)?.isAdmin === true || (user as any)?.role === "admin";
  const [, setLocation] = useLocation();

  // ── Data ──────────────────────────────────────────────────────────────────
  const [tracks,  setTracks]  = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
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

  // ── View state ────────────────────────────────────────────────────────────
  const [view, setView]             = useState<View>("home");
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

  const audioRef  = useRef<HTMLAudioElement>(null);
  const listenRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const p = new URLSearchParams();
        if (filterQ) p.set("search", filterQ);
        const res  = await fetch(`/api/music?${p}`);
        const data = await res.json();
        setTracks(data.tracks ?? []);
      } catch { setTracks([]); }
      finally { setLoading(false); }
    })();
  }, [filterQ]);

  // ── Audio events ──────────────────────────────────────────────────────────
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setPlayerState(s => ({ ...s, currentTime: audio.currentTime }));
    const onDur  = () => setPlayerState(s => ({ ...s, duration: audio.duration || 0 }));
    const onEnd  = () => playNext();
    const onPlay = () => setPlayerState(s => ({ ...s, playing: true }));
    const onPause= () => { setPlayerState(s => ({ ...s, playing: false })); stopTimer(); };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("durationchange", onDur);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("play",  onPlay);
    audio.addEventListener("pause", onPause);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("durationchange", onDur);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("play",  onPlay);
      audio.removeEventListener("pause", onPause);
    };
  }, []);

  // ── MediaSession ──────────────────────────────────────────────────────────
  useEffect(() => {
    const track = playerState.track;
    if (!("mediaSession" in navigator) || !track) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title, artist: track.artist, album: track.album ?? "",
      artwork: track.cover_url ? [{ src: track.cover_url, sizes: "512x512" }] : [],
    });
    navigator.mediaSession.setActionHandler("play",          () => audioRef.current?.play());
    navigator.mediaSession.setActionHandler("pause",         () => audioRef.current?.pause());
    navigator.mediaSession.setActionHandler("nexttrack",     () => playNext());
    navigator.mediaSession.setActionHandler("previoustrack", () => playPrev());
    navigator.mediaSession.setActionHandler("seekto", d => {
      if (d.seekTime != null && audioRef.current) audioRef.current.currentTime = d.seekTime;
    });
  }, [playerState.track]);

  // ── Impression timer ──────────────────────────────────────────────────────
  const stopTimer  = () => { if (listenRef.current) { clearTimeout(listenRef.current); listenRef.current = null; } };
  const startTimer = (id: number) => {
    stopTimer();
    listenRef.current = setTimeout(() => logImpression(id, 31), 31_000);
  };

  // ── Playback ──────────────────────────────────────────────────────────────
  const playTrack = useCallback((track: Track, newQueue?: Track[], idx?: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    if (newQueue) { setQueue(newQueue); setQueueIdx(idx ?? 0); }
    stopTimer();
    audio.pause();
    audio.src   = track.audio_url ?? "";
    audio.muted = playerState.muted;
    audio.volume= playerState.volume;
    setPlayerState(s => ({ ...s, track, playing: false, currentTime: 0, duration: 0 }));
    if (track.audio_url) { audio.play().catch(() => {}); if (track.id) startTimer(track.id); }
  }, [playerState.muted, playerState.volume]);

  const playNext = useCallback(() => {
    if (!queue.length) return;
    const next = (queueIdx + 1) % queue.length;
    setQueueIdx(next); playTrack(queue[next], queue, next);
  }, [queue, queueIdx, playTrack]);

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
    playTrack(mix.tracks[0], mix.tracks, 0);
  };

  // ── Open track from home → auto-switch to player view ─────────────────────
  const openTrack = (track: Track, q: Track[], idx: number) => {
    setPlaylist(q);
    setPlTitle(track.title);
    setPlCover(track.cover_url);
    setPlGrad(undefined);
    setView("player");
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
    if (!window.confirm("Efase chante sa?")) return;
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

  // ── Loading spinner ───────────────────────────────────────────────────────
  if (loading) {
    return (
      <div style={{ background: "#0a0a0a", minHeight: "100vh" }} className="flex items-center justify-center">
        <Loader2 size={32} className="animate-spin" style={{ color: "#7c3aed" }} />
      </div>
    );
  }

  return (
    <>
      <audio ref={audioRef} preload="metadata" />

      {view === "upload" ? (
        <UploadView
          onBack={() => setView("home")}
          onSuccess={handleUploadSuccess}
        />
      ) : view === "home" ? (
        <HomeView
          tracks={tracks}
          liked={liked}
          user={user}
          isAdmin={isAdmin}
          onPlay={openTrack}
          onPlayList={openMix}
          onToggleLike={toggleLike}
          onSearch={setFilterQ}
          onUpload={() => setView("upload")}
          onEdit={handleEdit}
          onDelete={handleDelete}
          setLocation={setLocation}
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
          onBack={() => setView("home")}
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
        onExpand={() => playerState.track && setView("player")}
      />

      {/* Admin FAB */}
      {isAdmin && (
        <button onClick={() => setLocation("/admin/music")}
          className="fixed bottom-24 right-4 z-50 flex items-center gap-2 font-bold text-sm px-4 py-3 rounded-2xl shadow-xl active:scale-95 transition-all"
          style={{ background: "linear-gradient(135deg,#7c3aed,#c026d3)", color: "#fff", boxShadow: "0 8px 24px rgba(124,58,237,0.4)" }}>
          <Plus size={17} /> Admin
        </button>
      )}
    </>
  );
}
