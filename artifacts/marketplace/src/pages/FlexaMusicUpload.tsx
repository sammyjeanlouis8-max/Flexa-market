/**
 * FlexaMusicUpload — Artist self-upload page
 * • Picks audio file from phone storage (accept="audio/*")
 * • Picks cover/thumbnail from phone gallery or camera (accept="image/*")
 * • Sends multipart POST to /api/music/upload
 * • Track goes pending admin review before it appears publicly
 */
import { useState, useRef, useCallback } from "react";
import {
  ArrowLeft, Music2, Upload, Image as ImageIcon, CheckCircle2,
  Loader2, X, AlertCircle, FileMusic, Camera,
} from "lucide-react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";

const GENRES = [
  "Kompa","Rap","Zouk","R&B","Gospel","Reggaeton","Pop",
  "Trap","Afrobeats","Latin","Klasik","Lòt",
];

const AUDIO_ACCEPT = "audio/mpeg,audio/mp4,audio/ogg,audio/wav,audio/x-m4a,audio/aac,audio/webm,audio/*";
const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,image/*";

const MAX_DURATION_SECONDS = 3600;  // 60 min — hard block
const WARN_DURATION_SECONDS = 900;  // 15 min — yellow warning

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m ${String(s).padStart(2, "0")}s`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function FlexaMusicUpload() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  // Form state
  const [title,  setTitle]  = useState("");
  const [artist, setArtist] = useState(user?.name ?? "");
  const [album,  setAlbum]  = useState("");
  const [genre,  setGenre]  = useState("");

  // File state
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [done,      setDone]      = useState(false);
  const [error,     setError]     = useState("");

  const audioInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // ── File pickers ────────────────────────────────────────────────────────────
  const onAudioPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setAudioFile(f);
    setAudioDuration(null);
    setError("");

    // Detect duration via a temporary Audio element (browser-side, no upload needed)
    const objectUrl = URL.createObjectURL(f);
    const audio = new window.Audio();
    audio.preload = "metadata";
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(objectUrl);
      const dur = Math.round(audio.duration);
      setAudioDuration(isFinite(dur) ? dur : null);
      if (isFinite(dur) && dur > MAX_DURATION_SECONDS) {
        setError(t("upload.errDurationMax"));
      }
    };
    audio.onerror = () => URL.revokeObjectURL(objectUrl);
    audio.src = objectUrl;
  };

  const onCoverPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setCoverFile(f);
    const url = URL.createObjectURL(f);
    setCoverPreview(url);
    setError("");
  };

  const removeCover = () => {
    setCoverFile(null);
    if (coverPreview) URL.revokeObjectURL(coverPreview);
    setCoverPreview(null);
    if (coverInputRef.current) coverInputRef.current.value = "";
  };

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim())  { setError(t("upload.errTitle"));  return; }
    if (!artist.trim()) { setError(t("upload.errArtist")); return; }
    if (!audioFile)     { setError(t("upload.errAudio"));  return; }
    if (audioDuration !== null && audioDuration > MAX_DURATION_SECONDS) {
      setError(t("upload.errDurationMax"));
      return;
    }

    setUploading(true);
    setProgress(5);

    try {
      const token = localStorage.getItem("flexamarket_token");
      const authHeader = token ? { Authorization: `Bearer ${token}` } : {} as Record<string,string>;

      // ── Step 0: Check plan before uploading bytes ────────────────────────────
      const planRes = await fetch("/api/music/artist/plan", { headers: authHeader });
      const plan = await planRes.json().catch(() => ({}));
      if (!planRes.ok) throw new Error(plan.error ?? t("music.planCheckFailed", "Unable to verify your Artist Plan. Please try again."));
      if (typeof plan.canUpload !== "boolean") throw new Error(t("music.planCheckFailed", "Unable to verify your Artist Plan. Please try again."));
      if (!plan.canUpload) throw new Error(t("music.planRequired", "Artist plan required"));

      // ── Step 1: Get Wasabi upload config ──────────────────────────────────────
      const sigRes = await fetch("/api/music/upload-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          audio: {
            name: audioFile.name,
            size: audioFile.size,
            contentType: audioFile.type || "application/octet-stream",
          },
          cover: coverFile ? {
            name: coverFile.name,
            size: coverFile.size,
            contentType: coverFile.type || "application/octet-stream",
          } : null,
        }),
      });
      if (!sigRes.ok) { const d = await sigRes.json().catch(()=>({})); throw new Error(d.error ?? "Signature failed"); }
      const sig = await sigRes.json();
      setProgress(10);

      // ── Step 2: Upload audio via Wasabi proxy ──────────────────────────────────
      const audioResult = await new Promise<{storageKey:string;url:string}>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", sig.audio.uploadUrl);
        xhr.setRequestHeader("Content-Type", audioFile.type || "audio/mpeg");
        if (token) xhr.setRequestHeader("Authorization", "Bearer " + token);
        xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setProgress(10 + Math.round((ev.loaded / ev.total) * 75)); };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText) as { url: string };
            const storageKey = new URL(data.url, location.origin).searchParams.get("key") ?? "";
            resolve({ storageKey, url: data.url });
          } else {
            let msg = "Upload " + xhr.status;
            try { msg = (JSON.parse(xhr.responseText) as {error?:string}).error ?? msg; } catch { /**/ }
            reject(new Error(msg));
          }
        };
        xhr.onerror = () => reject(new Error(t("upload.errGeneric")));
        xhr.send(audioFile);
      });
      setProgress(85);

      // ── Step 3: Upload cover via Wasabi proxy (optional) ───────────────────────
      let coverResult: {storageKey:string;url:string}|null = null;
      if (coverFile) {
        if (!sig.cover?.uploadUrl) {
          throw new Error("Nou pa t resevwa yon lyen pou telechaje thumbnail la. Eseye ankò.");
        }
        const coverData = await new Promise<{storageKey:string;url:string}>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", sig.cover.uploadUrl);
          xhr.setRequestHeader("Content-Type", coverFile.type || "image/jpeg");
          if (token) xhr.setRequestHeader("Authorization", "Bearer " + token);
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                const data = JSON.parse(xhr.responseText) as { url?: string };
                const returnedUrl = data.url;
                if (!returnedUrl) {
                  reject(new Error("Wasabi pa t retounen kle thumbnail la. Eseye ankò."));
                  return;
                }
                const storageKey = new URL(returnedUrl, location.origin).searchParams.get("key") ?? "";
                if (!storageKey) {
                  reject(new Error("Wasabi pa t retounen kle thumbnail la. Eseye ankò."));
                  return;
                }
                resolve({ storageKey, url: returnedUrl });
              } catch {
                reject(new Error("Repons thumbnail la pa valab. Eseye ankò."));
              }
            } else {
              let message = `Thumbnail upload failed: HTTP ${xhr.status}`;
              try {
                message = (JSON.parse(xhr.responseText) as { error?: string }).error ?? message;
              } catch { /* keep the HTTP message */ }
              reject(new Error(message));
            }
          };
          xhr.onerror = () => reject(new Error("Koneksyon an koupe pandan thumbnail la t ap telechaje."));
          xhr.send(coverFile);
        });
        coverResult = coverData;
      }
      setProgress(95);

      // ── Step 4: Register in DB ───────────────────────────────────────────────
      const regRes = await fetch("/api/music/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          title: title.trim(), artist: artist.trim(),
          album: album.trim() || "", genre: genre || "", type: "free",
          storageKey: audioResult.storageKey, audioUrl: audioResult.url,
          coverStorageKey: coverResult?.storageKey ?? null, coverUrl: coverResult?.url ?? null,
          duration_seconds: audioDuration !== null ? String(audioDuration) : undefined,
        }),
      });
      if (!regRes.ok) { const d = await regRes.json().catch(()=>({})); throw new Error(d.error ?? "Register failed"); }

      setProgress(100);
      setDone(true);
    } catch (err: any) {
      setError(err.message ?? t("upload.errGeneric"));
    } finally {
      setUploading(false);
    }
  }, [title, artist, album, genre, audioFile, audioDuration, coverFile, t]);

  // ── Success screen ───────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10 flex flex-col items-center gap-6 text-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center shadow-2xl shadow-violet-500/30">
          <CheckCircle2 size={40} className="text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-black text-foreground mb-2">{t("upload.successTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("upload.successDesc")}</p>
        </div>
        <div className="w-full bg-muted/60 rounded-2xl p-4 text-left">
          <p className="font-bold text-sm">{title}</p>
          <p className="text-xs text-muted-foreground">{artist}{genre ? ` · ${genre}` : ""}</p>
        </div>
        <div className="flex flex-col gap-2 w-full">
          <button
            onClick={() => { setDone(false); setTitle(""); setArtist(user?.name ?? ""); setAlbum(""); setGenre(""); setAudioFile(null); removeCover(); setProgress(0); }}
            className="w-full py-3 rounded-2xl bg-violet-600 text-white font-bold hover:bg-violet-700 transition-colors"
          >
            {t("upload.uploadAnother")}
          </button>
          <button
            onClick={() => setLocation("/music")}
            className="w-full py-3 rounded-2xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
          >
            {t("upload.backToMusic")}
          </button>
        </div>
      </div>
    );
  }

  const inp = "w-full border border-border rounded-xl px-3.5 py-3 text-sm bg-background outline-none focus:ring-2 focus:ring-violet-500/40 transition";
  const lbl = "block text-xs font-bold text-muted-foreground mb-1.5 uppercase tracking-wide";

  return (
    <div className="max-w-lg mx-auto px-3 pb-24">

      {/* ── Header ── */}
      <div
        className="relative rounded-3xl overflow-hidden mb-6 p-5"
        style={{ background: "linear-gradient(135deg,#0f0c29,#302b63,#24243e)" }}
      >
        <div className="absolute top-0 left-0 w-40 h-40 rounded-full bg-violet-600/30 blur-3xl -translate-x-1/4 -translate-y-1/4" />
        <div className="absolute bottom-0 right-0 w-32 h-32 rounded-full bg-fuchsia-600/30 blur-3xl translate-x-1/4 translate-y-1/4" />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-1">
            <button
              onClick={() => setLocation("/music")}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0"
            >
              <ArrowLeft size={16} className="text-white" />
            </button>
            <div className="w-10 h-10 rounded-2xl bg-white/10 backdrop-blur flex items-center justify-center border border-white/20">
              <Music2 size={22} className="text-violet-300" />
            </div>
            <div>
              <h1 className="text-xl font-black text-white">{t("upload.title")}</h1>
              <p className="text-white/50 text-xs">{t("upload.subtitle")}</p>
            </div>
          </div>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* ── Error ── */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2.5">
            <AlertCircle size={15} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {/* ── Audio file picker ── */}
        <div>
          <label className={lbl}>{t("upload.audioFile")} <span className="text-red-400">*</span></label>
          <input
            ref={audioInputRef}
            type="file"
            accept={AUDIO_ACCEPT}
            onChange={onAudioPick}
            className="hidden"
            id="audio-pick"
          />
          {audioFile ? (
            <div className="space-y-2">
              <div className={`flex items-center gap-3 p-3.5 rounded-2xl border ${audioDuration !== null && audioDuration > MAX_DURATION_SECONDS ? "border-red-400 bg-red-50 dark:bg-red-950/20" : "border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30"}`}>
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${audioDuration !== null && audioDuration > MAX_DURATION_SECONDS ? "bg-red-500" : "bg-gradient-to-br from-violet-500 to-fuchsia-600"}`}>
                  <FileMusic size={18} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate text-violet-900 dark:text-violet-100">{audioFile.name}</p>
                  <p className="text-xs text-violet-600 dark:text-violet-400">
                    {fmtSize(audioFile.size)}
                    {audioDuration !== null && <span className="ml-2 font-semibold">· ⏱ {fmtDuration(audioDuration)}</span>}
                  </p>
                </div>
                <button type="button" onClick={() => { setAudioFile(null); setAudioDuration(null); setError(""); if (audioInputRef.current) audioInputRef.current.value = ""; }}
                  className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-violet-200 dark:hover:bg-violet-800 transition-colors">
                  <X size={14} className="text-violet-500" />
                </button>
              </div>
              {/* Duration warnings */}
              {audioDuration !== null && audioDuration > MAX_DURATION_SECONDS && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-red-100 dark:bg-red-950/30 border border-red-300 dark:border-red-800">
                  <AlertCircle size={14} className="text-red-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-red-700 dark:text-red-400 font-semibold">{t("upload.errDurationMax")}</p>
                </div>
              )}
              {audioDuration !== null && audioDuration > WARN_DURATION_SECONDS && audioDuration <= MAX_DURATION_SECONDS && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-300 dark:border-amber-700">
                  <AlertCircle size={14} className="text-amber-600 mt-0.5 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">{t("upload.warnDurationLong")}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <label htmlFor="audio-pick" className="flex flex-col items-center gap-3 p-6 rounded-2xl border-2 border-dashed border-violet-300 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-950/20 cursor-pointer hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-colors">
                <div className="w-14 h-14 rounded-2xl bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center">
                  <FileMusic size={26} className="text-violet-500" />
                </div>
                <div className="text-center">
                  <p className="font-bold text-sm text-violet-700 dark:text-violet-300">{t("upload.tapToPickAudio")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{t("upload.audioFormats")}</p>
                </div>
              </label>
              {/* Duration limit info */}
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800">
                <span className="text-xs text-slate-500">⏱</span>
                <p className="text-xs text-slate-500">{t("upload.durationLimits")}</p>
              </div>
            </div>
          )}
        </div>

        {/* ── Cover / Thumbnail picker ── */}
        <div>
          <label className={lbl}>{t("upload.coverImage")}</label>
          <input
            ref={coverInputRef}
            type="file"
            accept={IMAGE_ACCEPT}
            onChange={onCoverPick}
            className="hidden"
            id="cover-pick"
          />
          {coverPreview ? (
            <div className="relative w-full aspect-square max-w-[200px] mx-auto">
              <img src={coverPreview} alt="cover" className="w-full h-full object-cover rounded-2xl shadow-lg" />
              <button type="button" onClick={removeCover}
                className="absolute top-2 right-2 w-7 h-7 bg-black/60 rounded-full flex items-center justify-center">
                <X size={13} className="text-white" />
              </button>
              <label htmlFor="cover-pick"
                className="absolute bottom-2 right-2 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center cursor-pointer shadow">
                <Camera size={14} className="text-gray-700" />
              </label>
            </div>
          ) : (
            <label htmlFor="cover-pick" className="flex flex-col items-center gap-3 p-5 rounded-2xl border-2 border-dashed border-border bg-muted/30 cursor-pointer hover:bg-muted/60 transition-colors">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                <ImageIcon size={22} className="text-muted-foreground" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-sm">{t("upload.tapToPickCover")}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{t("upload.coverFormats")}</p>
              </div>
            </label>
          )}
        </div>

        {/* ── Track info ── */}
        <div className="space-y-3">
          <div>
            <label className={lbl}>{t("upload.trackTitle")} <span className="text-red-400">*</span></label>
            <input
              className={inp}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={t("upload.trackTitlePlaceholder")}
              required
            />
          </div>
          <div>
            <label className={lbl}>{t("upload.artistName")} <span className="text-red-400">*</span></label>
            <input
              className={inp}
              value={artist}
              onChange={e => setArtist(e.target.value)}
              placeholder={t("upload.artistNamePlaceholder")}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={lbl}>{t("upload.album")}</label>
              <input
                className={inp}
                value={album}
                onChange={e => setAlbum(e.target.value)}
                placeholder={t("upload.albumPlaceholder")}
              />
            </div>
            <div>
              <label className={lbl}>{t("upload.genre")}</label>
              <select className={inp} value={genre} onChange={e => setGenre(e.target.value)}>
                <option value="">— {t("upload.genreSelect")} —</option>
                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* ── Progress bar ── */}
        {uploading && (
          <div className="space-y-2">
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500 transition-all duration-500 rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-center text-muted-foreground">{t("upload.uploading")} {progress}%</p>
          </div>
        )}

        {/* ── Submit ── */}
        <button
          type="submit"
          disabled={uploading}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white font-black text-base flex items-center justify-center gap-2 shadow-xl shadow-violet-500/25 active:scale-[0.98] transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {uploading
            ? <><Loader2 size={18} className="animate-spin" /> {t("upload.uploading")}…</>
            : <><Upload size={18} /> {t("upload.submit")}</>
          }
        </button>

        <p className="text-center text-xs text-muted-foreground pb-2">
          {t("upload.reviewNote")}
        </p>

      </form>
    </div>
  );
}
