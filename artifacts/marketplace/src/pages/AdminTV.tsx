import { useState, useRef, useEffect, FormEvent } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tv, Plus, Pencil, Trash2, Film, List, Radio, Clock, Calendar, Star, Eye, X, Check, ChevronDown, Youtube, Play, Pause, Square, Timer, Monitor, Repeat2, Download, Search, Globe, Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { useBroadcast } from "@/contexts/broadcast";

// ── Live broadcast duration timer ─────────────────────────────────────────────
function BroadcastTimer({ startedAt }: { startedAt: string | null }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!startedAt) return;
    const start = new Date(startedAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  const fmt = h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return <span className="font-mono text-white/80 text-xs tabular-nums">{fmt}</span>;
}

// ── Types ─────────────────────────────────────────────────────────────────────
type TvProgram = {
  id: number;
  title: string;
  description: string | null;
  type: string;
  videoUrl: string | null;
  videoKey: string | null;
  thumbnailUrl: string | null;
  durationMinutes: number | null;
  scheduledAt: string | null;
  endsAt: string | null;
  seriesId: number | null;
  episodeNumber: number | null;
  seasonNumber: number | null;
  isActive: boolean;
  isFeatured: boolean;
  viewCount: number;
  createdAt: string;
  seriesTitle: string | null;
};

type TvSeries = {
  id: number;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  isActive: boolean;
};

type ProgramForm = {
  title: string;
  description: string;
  type: string;
  videoUrl: string;
  videoKey: string;
  thumbnailUrl: string;
  durationMinutes: string;
  scheduledAt: string;
  seriesId: string;
  episodeNumber: string;
  seasonNumber: string;
  isActive: boolean;
  isFeatured: boolean;
};

type SeriesForm = { title: string; description: string; thumbnailUrl: string; isActive: boolean };

const EMPTY_PROGRAM: ProgramForm = {
  title: "", description: "", type: "film", videoUrl: "", videoKey: "", thumbnailUrl: "",
  durationMinutes: "", scheduledAt: "", seriesId: "", episodeNumber: "", seasonNumber: "1",
  isActive: true, isFeatured: false,
};

const EMPTY_SERIES: SeriesForm = { title: "", description: "", thumbnailUrl: "", isActive: true };

// ── Archive.org result shape ───────────────────────────────────────────────────
type ArchiveResult = {
  identifier: string;
  title: string;
  description: string | null;
  year: number | null;
  creator: string | null;
  subjects: string[];
  durationMinutes: number | null;
  thumbnailUrl: string;
  videoUrl: string;
  downloads: number;
};

const ARCHIVE_GENRES = [
  { label: "🎬 Feature Films",   value: "Feature Films" },
  { label: "🎞 Silent Films",    value: "Silent Films" },
  { label: "📚 Documentary",     value: "Documentary films" },
  { label: "🖼 Animation",       value: "Animation" },
  { label: "😂 Comedy",          value: "Comedy films" },
  { label: "🕵️ Crime",           value: "Crime films" },
  { label: "🚀 Sci-Fi",          value: "Science fiction films" },
  { label: "👻 Horror",          value: "Horror films" },
  { label: "🤠 Western",         value: "Western films" },
];

const YTS_GENRES = [
  { label: "🎬 Action",      value: "Action" },
  { label: "😂 Comedy",      value: "Comedy" },
  { label: "💔 Drama",       value: "Drama" },
  { label: "🚀 Sci-Fi",      value: "Sci-Fi" },
  { label: "👻 Horror",      value: "Horror" },
  { label: "🕵️ Thriller",    value: "Thriller" },
  { label: "🎭 Romance",     value: "Romance" },
  { label: "🔮 Fantasy",     value: "Fantasy" },
  { label: "📚 Documentary", value: "Documentary" },
  { label: "🦸 Animation",   value: "Animation" },
  { label: "🕵️ Crime",       value: "Crime" },
  { label: "🧒 Fanmi",       value: "Family" },
];

const FR_GENRES = [
  { label: "😂 Comédie",      value: "comédie" },
  { label: "💔 Romance",      value: "romance" },
  { label: "🎬 Action",       value: "action" },
  { label: "💔 Drame",        value: "drame" },
  { label: "🕵️ Policier",     value: "policier" },
  { label: "👻 Horreur",      value: "horreur" },
  { label: "🚀 SF",           value: "science fiction" },
  { label: "📚 Documentaire", value: "documentaire" },
  { label: "🏛 Historique",   value: "historique" },
  { label: "🧒 Fanmi",        value: "famille" },
];

const ANIME_GENRES = [
  { label: "⚔️ Action",        value: "1"  },
  { label: "😂 Comedy",        value: "4"  },
  { label: "💔 Drama",         value: "8"  },
  { label: "🎭 Romance",       value: "22" },
  { label: "🔮 Fantasy",       value: "10" },
  { label: "🚀 Sci-Fi",        value: "24" },
  { label: "👻 Horror",        value: "14" },
  { label: "✨ Supernatural",   value: "37" },
  { label: "🌸 Slice of Life", value: "36" },
  { label: "🏆 Sports",        value: "30" },
];

const DM_CATEGORIES = [
  { label: "🎬 Action",      value: "action movie" },
  { label: "😂 Comedy",      value: "comedy movie" },
  { label: "💔 Drama",       value: "drama movie" },
  { label: "📚 Documentary", value: "documentary" },
  { label: "🎭 Romance",     value: "romance movie" },
  { label: "👻 Horror",      value: "horror movie" },
  { label: "🚀 Sci-Fi",      value: "sci-fi movie" },
  { label: "🕵️ Thriller",    value: "thriller movie" },
  { label: "🧒 Fanmi",       value: "family movie" },
];

// ── Shared import UI helpers ──────────────────────────────────────────────────
function ImportSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="rounded-xl border border-border overflow-hidden animate-pulse">
          <div className="aspect-video bg-muted" />
          <div className="p-2 space-y-1.5">
            <div className="h-3 bg-muted rounded w-3/4" />
            <div className="h-2.5 bg-muted rounded w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ImportEmpty({ label }: { label: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground">
      <Film size={40} className="mx-auto mb-2 opacity-30" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

function ImportGrid({ items, importedIds, isPending, pendingId, onAdd, addLabel, addedLabel }: {
  items: ArchiveResult[];
  importedIds: Set<string>;
  isPending: boolean;
  pendingId: string | undefined;
  onAdd: (item: ArchiveResult) => void;
  addLabel: string;
  addedLabel: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map(item => {
        const isImported  = importedIds.has(item.identifier);
        const isImporting = isPending && pendingId === item.identifier;
        return (
          <div key={item.identifier} className="rounded-xl border border-border bg-card overflow-hidden hover:border-violet-500/40 transition-colors">
            <div className="relative aspect-video bg-muted">
              <img
                src={item.thumbnailUrl}
                alt={item.title}
                className="w-full h-full object-cover"
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }}
              />
              {item.year && (
                <span className="absolute top-1.5 left-1.5 text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded font-semibold">{item.year}</span>
              )}
              {item.durationMinutes && (
                <span className="absolute top-1.5 right-1.5 text-[10px] bg-black/70 text-white px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <Clock size={8} /> {item.durationMinutes}min
                </span>
              )}
            </div>
            <div className="p-2">
              <p className="text-xs font-semibold line-clamp-2 mb-1 leading-tight">{item.title}</p>
              {item.creator && <p className="text-[10px] text-muted-foreground truncate mb-1.5">{item.creator}</p>}
              <button
                onClick={() => !isImported && onAdd(item)}
                disabled={isImported || isImporting}
                className={cn(
                  "w-full flex items-center justify-center gap-1 text-[11px] font-bold py-1.5 rounded-lg transition-colors",
                  isImported
                    ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                    : "bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-60"
                )}
              >
                {isImported ? (
                  <><Check size={10} /> {addedLabel}</>
                ) : isImporting ? "…" : (
                  <><Download size={10} /> {addLabel}</>
                )}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function apiAuth(path: string, opts: RequestInit = {}) {
  const tk = localStorage.getItem("flexamarket_token");
  return fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(tk ? { Authorization: `Bearer ${tk}` } : {}), ...opts.headers },
  });
}

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-HT", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function typeLabel(type: string) {
  return { film: "🎬 Film", series: "📺 Seri", program: "📡 Program", news: "📰 Nouvèl" }[type] ?? type;
}

// ── Form Field Helper ─────────────────────────────────────────────────────────
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

const inputCls = "w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50";

// ── Program Modal ─────────────────────────────────────────────────────────────
function ProgramModal({
  program, series, onClose, onSaved,
}: {
  program: TvProgram | null;
  series: TvSeries[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [form, setForm] = useState<ProgramForm>(
    program
      ? {
          title: program.title,
          description: program.description ?? "",
          type: program.type,
          videoUrl: program.videoUrl ?? "",
          videoKey: program.videoKey ?? "",
          thumbnailUrl: program.thumbnailUrl ?? "",
          durationMinutes: program.durationMinutes?.toString() ?? "",
          scheduledAt: program.scheduledAt
            ? new Date(program.scheduledAt).toISOString().slice(0, 16)
            : "",
          seriesId: program.seriesId?.toString() ?? "",
          episodeNumber: program.episodeNumber?.toString() ?? "",
          seasonNumber: program.seasonNumber?.toString() ?? "1",
          isActive: program.isActive,
          isFeatured: program.isFeatured,
        }
      : EMPTY_PROGRAM
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof ProgramForm, v: any) => setForm(f => ({ ...f, [k]: v }));

  async function uploadVideo(file: File) {
    setUploading(true);
    setUploadProgress(0);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const formData = new FormData();
      formData.append("video", file);
      // Use XHR for progress tracking
      const result = await new Promise<{ videoKey: string; videoUrl: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
          else reject(new Error(`HTTP ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.open("POST", "/api/admin/tv/upload-video");
        if (tk) xhr.setRequestHeader("Authorization", `Bearer ${tk}`);
        xhr.send(formData);
      });
      set("videoKey", result.videoKey);
      set("videoUrl", result.videoUrl);
      toast({ title: "Videyo telechaje ✅" });
    } catch (e) {
      toast({ title: "Erè nan telechajman", variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  async function save() {
    if (!form.title.trim()) { toast({ title: t("tv.titleRequired"), variant: "destructive" }); return; }
    setSaving(true);
    const body: any = {
      title: form.title.trim(),
      description: form.description || null,
      type: form.type,
      videoUrl: form.videoUrl || null,
      videoKey: form.videoKey || null,
      thumbnailUrl: form.thumbnailUrl || null,
      durationMinutes: form.durationMinutes ? parseInt(form.durationMinutes) : null,
      scheduledAt: form.scheduledAt || null,
      seriesId: form.seriesId ? parseInt(form.seriesId) : null,
      episodeNumber: form.episodeNumber ? parseInt(form.episodeNumber) : null,
      seasonNumber: form.seasonNumber ? parseInt(form.seasonNumber) : 1,
      isActive: form.isActive,
      isFeatured: form.isFeatured,
    };
    const url = program ? `/api/admin/tv/programs/${program.id}` : "/api/admin/tv/programs";
    const method = program ? "PUT" : "POST";
    const r = await apiAuth(url, { method, body: JSON.stringify(body) });
    setSaving(false);
    if (r.ok) {
      toast({ title: t("tv.savedProgram") });
      onSaved();
      onClose();
    } else {
      const d = await r.json().catch(() => ({}));
      toast({ title: d.error ?? "Erè", variant: "destructive" });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-2 sm:p-4">
      <div className="bg-background rounded-2xl w-full max-w-lg flex flex-col shadow-2xl" style={{ height: "88vh", maxHeight: "88vh" }}>
        <div className="flex-shrink-0 bg-background border-b border-border px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <h2 className="font-bold text-base">{program ? t("tv.editProgram") : t("tv.addProgram")}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted"><X size={18} /></button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4" style={{ WebkitOverflowScrolling: "touch" } as any}>
          <Field label={t("tv.fieldTitle")}>
            <input className={inputCls} value={form.title} onChange={e => set("title", e.target.value)} placeholder={t("tv.fieldTitle")} />
          </Field>
          <Field label={t("tv.fieldDescription")}>
            <textarea className={inputCls} rows={2} value={form.description} onChange={e => set("description", e.target.value)} />
          </Field>
          <Field label={t("tv.fieldType")}>
            <select className={inputCls} value={form.type} onChange={e => set("type", e.target.value)}>
              <option value="live">{t("tv.typeLiveOption")}</option>
              <option value="film">{t("tv.typeFilm")}</option>
              <option value="series">{t("tv.typeSeries")}</option>
              <option value="program">{t("tv.typeProgram")}</option>
              <option value="news">{t("tv.typeNews")}</option>
            </select>
          </Field>
          {form.type === "live" && (
            <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-4 space-y-2">
              <p className="text-sm font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                <Youtube size={16} /> {t("tv.streamGuideTitle")}
              </p>
              {["streamGuideStep1","streamGuideStep2","streamGuideStep3","streamGuideStep4","streamGuideStep5"].map(k => (
                <p key={k} className="text-xs text-red-600 dark:text-red-400">{t(`tv.${k}`)}</p>
              ))}
            </div>
          )}
          <Field label={t("tv.fieldVideoUrl")}>
            <input className={inputCls} value={form.videoUrl} onChange={e => { set("videoUrl", e.target.value); set("videoKey", ""); }} placeholder="https://youtu.be/..." />
          </Field>

          {/* Direct video upload */}
          <div className="rounded-xl border border-dashed border-violet-400 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-950/20 p-3">
            <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-2">{t("tv.videoUploadSection")}</p>
            {form.videoKey ? (
              <div className="flex items-center gap-2">
                <div className="flex-1 text-xs text-green-600 dark:text-green-400 font-medium truncate">{t("tv.videoUploaded")}</div>
                <button type="button" onClick={() => { set("videoKey", ""); set("videoUrl", ""); }} className="text-xs text-red-500 hover:underline">{t("tv.removeVideo")}</button>
              </div>
            ) : uploading ? (
              <div className="space-y-1">
                <div className="w-full bg-muted rounded-full h-2">
                  <div className="bg-violet-500 h-2 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
                <p className="text-xs text-muted-foreground text-center">{uploadProgress}%</p>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition-colors"
              >
                {t("tv.chooseVideoFile")}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadVideo(f); e.target.value = ""; }}
            />
            <p className="text-[10px] text-muted-foreground mt-1.5">{t("tv.linearHint")}</p>
          </div>
          <Field label={t("tv.fieldThumbnail")}>
            <input className={inputCls} value={form.thumbnailUrl} onChange={e => set("thumbnailUrl", e.target.value)} placeholder="https://..." />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("tv.fieldDuration")}>
              <input type="number" className={inputCls} value={form.durationMinutes} onChange={e => set("durationMinutes", e.target.value)} placeholder="90" min={1} />
            </Field>
            <Field label={t("tv.fieldScheduledAt")}>
              <input type="datetime-local" className={inputCls} value={form.scheduledAt} onChange={e => set("scheduledAt", e.target.value)} />
            </Field>
          </div>
          {form.type === "series" && (
            <>
              <Field label={t("tv.fieldSeries")}>
                <select className={inputCls} value={form.seriesId} onChange={e => set("seriesId", e.target.value)}>
                  <option value="">{t("tv.chooseSeries")}</option>
                  {series.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("tv.fieldSeason")}>
                  <input type="number" className={inputCls} value={form.seasonNumber} onChange={e => set("seasonNumber", e.target.value)} min={1} />
                </Field>
                <Field label={t("tv.fieldEpisode")}>
                  <input type="number" className={inputCls} value={form.episodeNumber} onChange={e => set("episodeNumber", e.target.value)} min={1} />
                </Field>
              </div>
            </>
          )}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.isActive} onChange={e => set("isActive", e.target.checked)} className="accent-violet-500" />
              {t("tv.fieldActive")}
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.isFeatured} onChange={e => set("isFeatured", e.target.checked)} className="accent-violet-500" />
              {t("tv.fieldFeatured")}
            </label>
          </div>
        </div>
        <div className="flex-shrink-0 bg-background border-t border-border px-5 py-4 flex gap-3 rounded-b-2xl">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">{t("tv.cancel")}</button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
          >
            {saving ? t("tv.saving") : t("tv.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Series Modal ──────────────────────────────────────────────────────────────
function SeriesModal({ series, onClose, onSaved }: { series: TvSeries | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [form, setForm] = useState<SeriesForm>(
    series ? { title: series.title, description: series.description ?? "", thumbnailUrl: series.thumbnailUrl ?? "", isActive: series.isActive }
           : EMPTY_SERIES
  );
  const [saving, setSaving] = useState(false);
  const set = (k: keyof SeriesForm, v: any) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.title.trim()) { toast({ title: t("tv.titleRequired"), variant: "destructive" }); return; }
    setSaving(true);
    const url = series ? `/api/admin/tv/series/${series.id}` : "/api/admin/tv/series";
    const method = series ? "PUT" : "POST";
    const r = await apiAuth(url, { method, body: JSON.stringify({ ...form, description: form.description || null, thumbnailUrl: form.thumbnailUrl || null }) });
    setSaving(false);
    if (r.ok) {
      toast({ title: t("tv.savedSeries") });
      onSaved();
      onClose();
    } else {
      toast({ title: "Erè", variant: "destructive" });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-background rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="border-b border-border px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-base">{series ? t("tv.editSeries") : t("tv.newSeries")}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label={t("tv.fieldTitle")}>
            <input className={inputCls} value={form.title} onChange={e => set("title", e.target.value)} placeholder={t("tv.fieldTitle")} />
          </Field>
          <Field label={t("tv.fieldDescription")}>
            <textarea className={inputCls} rows={2} value={form.description} onChange={e => set("description", e.target.value)} />
          </Field>
          <Field label={t("tv.fieldThumbnail")}>
            <input className={inputCls} value={form.thumbnailUrl} onChange={e => set("thumbnailUrl", e.target.value)} placeholder="https://..." />
          </Field>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={form.isActive} onChange={e => set("isActive", e.target.checked)} className="accent-violet-500" />
            {t("tv.fieldActive")}
          </label>
        </div>
        <div className="border-t border-border px-5 py-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted">{t("tv.cancel")}</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-50">
            {saving ? t("tv.saving") : t("tv.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Admin TV Page ────────────────────────────────────────────────────────
export default function AdminTV() {
  const { t } = useTranslation();
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const hasAdminAccess = Boolean(user?.isAdmin || user?.isSuperAdmin);
  const [tab, setTab] = useState<"programs" | "series" | "import">("programs");
  const [editProgram, setEditProgram] = useState<TvProgram | null | "new">(null);
  const [editSeries, setEditSeries] = useState<TvSeries | null | "new">(null);
  const [previewProgram, setPreviewProgram] = useState<TvProgram | null>(null);
  const [goingLive, setGoingLive] = useState<number | null>(null);
  const [broadcastState, setBroadcastState] = useState<"playing"|"paused"|"stopped">("stopped");
  const [viewerCount, setViewerCount] = useState(0);
  const [loopProgramId, setLoopProgramId] = useState<number | null>(null);
  const bs = useBroadcast(); // for startedAt + programId (broadcast timer)

  // ── Archive.org import state ──────────────────────────────────────────────
  const [importSubTab, setImportSubTab]     = useState<"archive" | "dailymotion" | "tvmaze" | "yts" | "cinemafr" | "archivefr" | "seriesfr" | "anime" | "seriesen" | "tvarchi">("archive");
  const [archiveQuery, setArchiveQuery]     = useState("");
  const [archiveGenre, setArchiveGenre]     = useState("");
  const [archiveResults, setArchiveResults] = useState<ArchiveResult[]>([]);
  const [archiveTotal, setArchiveTotal]     = useState<number | null>(null);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [importedIds, setImportedIds]       = useState<Set<string>>(new Set());
  // ── Dailymotion import state ───────────────────────────────────────────────
  const [dmQuery, setDmQuery]         = useState("");
  const [dmCategory, setDmCategory]   = useState("");
  const [dmResults, setDmResults]     = useState<ArchiveResult[]>([]);
  const [dmTotal, setDmTotal]         = useState<number | null>(null);
  const [dmLoading, setDmLoading]     = useState(false);
  // ── Ciné FR (French films) import state ──────────────────────────────────
  const [frQuery, setFrQuery]     = useState("");
  const [frGenre, setFrGenre]     = useState("");
  const [frResults, setFrResults] = useState<ArchiveResult[]>([]);
  const [frTotal, setFrTotal]     = useState<number | null>(null);
  const [frLoading, setFrLoading] = useState(false);
  // ── Archive.org French Classics state ─────────────────────────────────────
  const [afrQuery, setAfrQuery]   = useState("");
  const [afrYear, setAfrYear]     = useState("2000-2025");
  const [afrSort, setAfrSort]     = useState("downloads desc");
  const [afrResults, setAfrResults] = useState<ArchiveResult[]>([]);
  const [afrTotal, setAfrTotal]   = useState<number | null>(null);
  const [afrLoading, setAfrLoading] = useState(false);
  // ── YTS (HD movies) import state ──────────────────────────────────────────
  const [ytsQuery, setYtsQuery]       = useState("");
  const [ytsGenre, setYtsGenre]       = useState("");
  const [ytsQuality, setYtsQuality]   = useState("1080p");
  const [ytsResults, setYtsResults]   = useState<ArchiveResult[]>([]);
  const [ytsTotal, setYtsTotal]       = useState<number | null>(null);
  const [ytsLoading, setYtsLoading]   = useState(false);
  // ── TVMaze series import state ─────────────────────────────────────────────
  type TVMazeResult = { identifier: string; title: string; description: string | null; thumbnailUrl: string; genres: string[]; network: string | null; year: string | null; status: string | null };
  const [tmQuery, setTmQuery]           = useState("");
  const [tmResults, setTmResults]       = useState<TVMazeResult[]>([]);
  const [tmLoading, setTmLoading]       = useState(false);
  const [importedSeriesIds, setImportedSeriesIds] = useState<Set<string>>(new Set());
  // ── Séries FR (TVMaze French) state ───────────────────────────────────────
  const [srfrQuery, setSrfrQuery]       = useState("");
  const [srfrResults, setSrfrResults]   = useState<TVMazeResult[]>([]);
  const [srfrLoading, setSrfrLoading]   = useState(false);
  // ── Anime (Jikan/MyAnimeList) state ───────────────────────────────────────
  const [animeQuery, setAnimeQuery]     = useState("");
  const [animeGenre, setAnimeGenre]     = useState("");
  const [animeResults, setAnimeResults] = useState<TVMazeResult[]>([]);
  const [animeLoading, setAnimeLoading] = useState(false);
  // ── Séries EN (TVMaze English) state ──────────────────────────────────────
  const [srenQuery, setSrenQuery]       = useState("");
  const [srenResults, setSrenResults]   = useState<TVMazeResult[]>([]);
  const [srenLoading, setSrenLoading]   = useState(false);
  // ── TV Archive (Archive.org TV) state ─────────────────────────────────────
  const [tvaQuery, setTvaQuery]         = useState("");
  const [tvaResults, setTvaResults]     = useState<ArchiveResult[]>([]);
  const [tvaTotal, setTvaTotal]         = useState<number | null>(null);
  const [tvaLoading, setTvaLoading]     = useState(false);

  // ── Episode import panel (per-series inline DM search) ────────────────────
  const [epImportSeriesId, setEpImportSeriesId] = useState<number | null>(null);
  const [epResults, setEpResults]               = useState<ArchiveResult[]>([]);
  const [epLoading, setEpLoading]               = useState(false);
  const [epImportedIds, setEpImportedIds]       = useState<Set<string>>(new Set());

  // Wait for /auth/me before deciding whether to leave the admin page.
  // Redirecting while `user` is still null sends valid admins to Home during
  // a slow API response and also makes the hook order change between renders.
  useEffect(() => {
    if (!authLoading && !hasAdminAccess) {
      setLocation("/");
    }
  }, [authLoading, hasAdminAccess, setLocation]);

  const { data: programs, isLoading: loadingP } = useQuery<TvProgram[]>({
    queryKey: ["/admin/tv/programs"],
    queryFn: () => apiAuth("/api/admin/tv/programs").then(r => r.json()).then(d => d.programs ?? []),
    enabled: hasAdminAccess,
  });

  const { data: series, isLoading: loadingS } = useQuery<TvSeries[]>({
    queryKey: ["/admin/tv/series"],
    queryFn: () => apiAuth("/api/admin/tv/series").then(r => r.json()).then(d => d.series ?? []),
    enabled: hasAdminAccess,
  });

  const deleteProgram = useMutation({
    mutationFn: (id: number) => apiAuth(`/api/admin/tv/programs/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/tv/programs"] }); toast({ title: t("tv.deleted") }); },
  });

  const deleteSeries = useMutation({
    mutationFn: (id: number) => apiAuth(`/api/admin/tv/series/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/tv/series"] }); toast({ title: t("tv.deleted") }); },
  });

  const toggleLive = useMutation({
    mutationFn: ({ id, makeLive }: { id: number; makeLive: boolean }) =>
      apiAuth(`/api/admin/tv/programs/${id}`, {
        method: "PUT",
        body: JSON.stringify({ type: makeLive ? "live" : "program", isActive: true }),
      }),
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ["/admin/tv/programs"] });
      setGoingLive(null);
      toast({ title: vars.makeLive ? "🔴 Transmisyon Live kòmanse ✅" : "⏹ Live kanpe" });
    },
  });

  // Broadcast control mutations
  const broadcastPlay = useMutation({
    mutationFn: (programId: number) =>
      apiAuth("/api/admin/tv/broadcast/play", { method: "POST", body: JSON.stringify({ programId }) })
        .then(r => r.json()),
    onSuccess: (d) => { setBroadcastState("playing"); setViewerCount(d.broadcast?.viewerCount ?? 0); toast({ title: `▶ ${t("tv.broadcastGoLive")}` }); },
  });

  const broadcastPause = useMutation({
    mutationFn: () => apiAuth("/api/admin/tv/broadcast/pause", { method: "POST" }).then(r => r.json()),
    onSuccess: (d) => { setBroadcastState("paused"); setViewerCount(d.broadcast?.viewerCount ?? 0); toast({ title: "⏸ Transmisyon sispann" }); },
  });

  const broadcastStop = useMutation({
    mutationFn: () => apiAuth("/api/admin/tv/broadcast/stop", { method: "POST" }).then(r => r.json()),
    onSuccess: () => { setBroadcastState("stopped"); setViewerCount(0); setPreviewProgram(null); toast({ title: "⏹ Transmisyon kanpe" }); },
  });

  // ── Import an episode from Dailymotion into a series ─────────────────────
  const importEpisode = useMutation({
    mutationFn: ({ item, seriesId, episodeNumber }: { item: ArchiveResult; seriesId: number; episodeNumber: number }) =>
      apiAuth("/api/admin/tv/programs", {
        method: "POST",
        body: JSON.stringify({
          title          : item.title,
          description    : item.description ?? null,
          type           : "series",
          videoUrl       : item.videoUrl,
          thumbnailUrl   : item.thumbnailUrl,
          durationMinutes: item.durationMinutes ?? null,
          seriesId,
          episodeNumber,
          isActive       : true,
          isFeatured     : false,
        }),
      }).then(r => r.json()),
    onSuccess: (_d, { item }) => {
      qc.invalidateQueries({ queryKey: ["/admin/tv/programs"] });
      qc.invalidateQueries({ queryKey: ["/tv/programs"] });
      setEpImportedIds(prev => new Set([...prev, item.identifier]));
      toast({ title: `✅ ${item.title} — episòd ajoute` });
    },
    onError: () => toast({ title: t("tv.importError"), variant: "destructive" }),
  });

  async function searchEpisodes(seriesTitle: string, seriesId: number) {
    setEpImportSeriesId(seriesId);
    setEpResults([]);
    setEpLoading(true);
    try {
      const data = await apiAuth(`/api/admin/tv/import/seriesepisodes?title=${encodeURIComponent(seriesTitle)}`).then(r => r.json());
      setEpResults(data.results ?? []);
    } catch {
      toast({ title: "Erè rechèch episòd", variant: "destructive" });
    } finally {
      setEpLoading(false);
    }
  }

  // ── Import a film from Archive.org into the TV program list ──────────────
  const importProgram = useMutation({
    mutationFn: (item: ArchiveResult) =>
      apiAuth("/api/admin/tv/programs", {
        method: "POST",
        body: JSON.stringify({
          title: item.title,
          description: item.description ?? null,
          type: "film",
          videoUrl: item.videoUrl,
          thumbnailUrl: item.thumbnailUrl,
          durationMinutes: item.durationMinutes ?? null,
          isActive: true,
          isFeatured: false,
        }),
      }).then(r => r.json()),
    onSuccess: (_d, item) => {
      // Invalidate both admin list AND public viewer list so FlexaTV shows new film immediately
      qc.invalidateQueries({ queryKey: ["/admin/tv/programs"] });
      qc.invalidateQueries({ queryKey: ["/tv/programs"] });
      setImportedIds(prev => new Set([...prev, item.identifier]));
      toast({ title: `🎬 ${item.title} — ${t("tv.importAdded")}` });
    },
    onError: () => toast({ title: t("tv.importError"), variant: "destructive" }),
  });

  async function searchArchive(e?: FormEvent) {
    e?.preventDefault();
    setArchiveLoading(true);
    setArchiveResults([]);
    setArchiveTotal(null);
    try {
      const q = archiveQuery.trim() || "feature film";
      const params = new URLSearchParams({ q, rows: "24" });
      if (archiveGenre) params.set("subject", archiveGenre);
      const data = await apiAuth(`/api/admin/tv/import/archive?${params}`).then(r => r.json());
      setArchiveResults(data.results ?? []);
      setArchiveTotal(data.numFound ?? 0);
    } catch {
      toast({ title: t("tv.importError"), variant: "destructive" });
    } finally {
      setArchiveLoading(false);
    }
  }

  // ── Import a TV series from TVMaze into the series list ────────────────────
  const importSeries = useMutation({
    mutationFn: (item: TVMazeResult) =>
      apiAuth("/api/admin/tv/series", {
        method: "POST",
        body: JSON.stringify({
          title: item.title,
          description: item.description ?? null,
          thumbnailUrl: item.thumbnailUrl || null,
          isActive: true,
        }),
      }).then(r => r.json()),
    onSuccess: (_d, item) => {
      qc.invalidateQueries({ queryKey: ["/admin/tv/series"] });
      qc.invalidateQueries({ queryKey: ["/tv/series"] });
      setImportedSeriesIds(prev => new Set([...prev, item.identifier]));
      toast({ title: `📺 ${item.title} — ${t("tv.tmImportedSeries")}` });
    },
    onError: () => toast({ title: t("tv.tmSeriesImportError"), variant: "destructive" }),
  });

  async function searchSeriesFR(e?: FormEvent) {
    e?.preventDefault();
    setSrfrLoading(true);
    setSrfrResults([]);
    try {
      const params = new URLSearchParams();
      if (srfrQuery.trim()) params.set("q", srfrQuery.trim());
      const data = await apiAuth(`/api/admin/tv/import/seriesfr?${params}`).then(r => r.json());
      setSrfrResults(data.results ?? []);
    } catch {
      toast({ title: "Erè rechèch Séries FR", variant: "destructive" });
    } finally {
      setSrfrLoading(false);
    }
  }

  async function searchAnime(e?: FormEvent) {
    e?.preventDefault();
    setAnimeLoading(true);
    setAnimeResults([]);
    try {
      const params = new URLSearchParams();
      if (animeQuery.trim()) params.set("q", animeQuery.trim());
      if (animeGenre)        params.set("genre", animeGenre);
      const data = await apiAuth(`/api/admin/tv/import/anime?${params}`).then(r => r.json());
      setAnimeResults(data.results ?? []);
    } catch {
      toast({ title: "Erè rechèch Anime", variant: "destructive" });
    } finally {
      setAnimeLoading(false);
    }
  }

  async function searchSeriesEN(e?: FormEvent) {
    e?.preventDefault();
    setSrenLoading(true);
    setSrenResults([]);
    try {
      const params = new URLSearchParams();
      if (srenQuery.trim()) params.set("q", srenQuery.trim());
      const data = await apiAuth(`/api/admin/tv/import/seriesen?${params}`).then(r => r.json());
      setSrenResults(data.results ?? []);
    } catch {
      toast({ title: "Erè rechèch Séries EN", variant: "destructive" });
    } finally {
      setSrenLoading(false);
    }
  }

  async function searchTVArchi(e?: FormEvent) {
    e?.preventDefault();
    setTvaLoading(true);
    setTvaResults([]);
    setTvaTotal(null);
    try {
      const params = new URLSearchParams();
      if (tvaQuery.trim()) params.set("q", tvaQuery.trim());
      const data = await apiAuth(`/api/admin/tv/import/tvarchi?${params}`).then(r => r.json());
      setTvaResults(data.results ?? []);
      setTvaTotal(data.numFound ?? 0);
    } catch {
      toast({ title: "Erè rechèch TV Archive", variant: "destructive" });
    } finally {
      setTvaLoading(false);
    }
  }

  async function searchTVMaze(e?: FormEvent) {
    e?.preventDefault();
    setTmLoading(true);
    setTmResults([]);
    try {
      const q = tmQuery.trim() || "popular";
      const data = await apiAuth(`/api/admin/tv/import/tvmaze?q=${encodeURIComponent(q)}`).then(r => r.json());
      setTmResults(data.results ?? []);
    } catch {
      toast({ title: t("tv.tmSeriesImportError"), variant: "destructive" });
    } finally {
      setTmLoading(false);
    }
  }

  async function searchArchiveFR(e?: FormEvent, overrideYear?: string, overrideSort?: string) {
    e?.preventDefault();
    setAfrLoading(true);
    setAfrResults([]);
    setAfrTotal(null);
    try {
      const params = new URLSearchParams();
      if (afrQuery.trim()) params.set("q", afrQuery.trim());
      const yr = overrideYear !== undefined ? overrideYear : afrYear;
      const st = overrideSort !== undefined ? overrideSort : afrSort;
      if (yr) params.set("year", yr);
      if (st) params.set("sort", st);
      const data = await apiAuth(`/api/admin/tv/import/archivefr?${params}`).then(r => r.json());
      setAfrResults(data.results ?? []);
      setAfrTotal(data.numFound ?? 0);
    } catch {
      toast({ title: "Erè rechèch Classiques FR", variant: "destructive" });
    } finally {
      setAfrLoading(false);
    }
  }

  async function searchCinemaFR(e?: FormEvent) {
    e?.preventDefault();
    setFrLoading(true);
    setFrResults([]);
    setFrTotal(null);
    try {
      const params = new URLSearchParams();
      if (frQuery.trim()) params.set("q", frQuery.trim());
      if (frGenre)        params.set("genre", frGenre);
      const data = await apiAuth(`/api/admin/tv/import/cinemafr?${params}`).then(r => r.json());
      setFrResults(data.results ?? []);
      setFrTotal(data.numFound ?? 0);
    } catch {
      toast({ title: "Erè rechèch Ciné FR", variant: "destructive" });
    } finally {
      setFrLoading(false);
    }
  }

  async function searchYTS(e?: FormEvent, overrideGenre?: string, overrideQuality?: string) {
    e?.preventDefault();
    setYtsLoading(true);
    setYtsResults([]);
    setYtsTotal(null);
    try {
      const q       = ytsQuery.trim() || "";
      const genre   = overrideGenre   !== undefined ? overrideGenre   : ytsGenre;
      const quality = overrideQuality !== undefined ? overrideQuality : ytsQuality;

      // Call YTS directly from the browser — avoids server-side geo/IP block.
      // yts.mx supports CORS for public API requests.
      const params = new URLSearchParams({
        limit    : "24",
        sort_by  : "year",
        order_by : "desc",
      });
      if (q)       params.set("query_term", q);
      if (genre)   params.set("genre", genre);
      if (quality && quality !== "all") params.set("quality", quality);

      const resp = await fetch(`https://yts.mx/api/v2/list_movies.json?${params.toString()}`);
      if (!resp.ok) throw new Error("YTS unreachable");
      const data = await resp.json() as {
        data?: { movie_count?: number; movies?: Array<Record<string, unknown>> };
      };
      const movies = data?.data?.movies ?? [];
      const results = movies.map((m) => {
        const imdbCode = String(m.imdb_code ?? "");
        const genres   = Array.isArray(m.genres) ? (m.genres as string[]) : [];
        return {
          identifier      : `yts-${imdbCode || m.id}`,
          title           : String(m.title_long ?? m.title ?? ""),
          description     : String(m.summary ?? m.description_intro ?? "").replace(/<[^>]+>/g, "").slice(0, 500),
          year            : m.year ? Number(m.year) : null,
          creator         : null as string | null,
          subjects        : genres,
          durationMinutes : m.runtime ? Number(m.runtime) : null,
          thumbnailUrl    : String(m.large_cover_image ?? m.medium_cover_image ?? ""),
          videoUrl        : imdbCode
            ? `https://vidsrc.me/embed/movie?imdb=${imdbCode}`
            : `https://vidsrc.me/embed/movie?tmdb=${m.id}`,
          downloads       : m.download_count ? Number(m.download_count) : 0,
        };
      });
      setYtsResults(results);
      setYtsTotal(data?.data?.movie_count ?? results.length);
    } catch {
      toast({ title: "Erè rechèch YTS", variant: "destructive" });
    } finally {
      setYtsLoading(false);
    }
  }

  async function searchDailymotion(e?: FormEvent) {
    e?.preventDefault();
    setDmLoading(true);
    setDmResults([]);
    setDmTotal(null);
    try {
      const q = dmQuery.trim() || "full movie";
      const params = new URLSearchParams({ q });
      if (dmCategory) params.set("category", dmCategory);
      const data = await apiAuth(`/api/admin/tv/import/dailymotion?${params}`).then(r => r.json());
      setDmResults(data.results ?? []);
      setDmTotal(data.numFound ?? 0);
    } catch {
      toast({ title: t("tv.importError"), variant: "destructive" });
    } finally {
      setDmLoading(false);
    }
  }

  // Poll viewer count every 10s when broadcasting
  useEffect(() => {
    if (broadcastState === "stopped") return;
    const poll = () =>
      apiAuth("/api/admin/tv/broadcast/viewers").then(r => r.json())
        .then(d => { setViewerCount(d.viewerCount ?? 0); setBroadcastState(d.state ?? broadcastState); })
        .catch(() => {});
    poll();
    const timer = setInterval(poll, 10_000);
    return () => clearInterval(timer);
  }, [broadcastState]); // eslint-disable-line

  // Sync initial broadcast state on mount
  useEffect(() => {
    apiAuth("/api/admin/tv/broadcast/viewers").then(r => r.json())
      .then(d => { setViewerCount(d.viewerCount ?? 0); if (d.state) setBroadcastState(d.state); })
      .catch(() => {});
  }, []);

  // Auto-restart when broadcast stops and loop is enabled
  const prevBroadcastState = useRef(broadcastState);
  useEffect(() => {
    if (
      prevBroadcastState.current !== "stopped" &&
      broadcastState === "stopped" &&
      loopProgramId !== null
    ) {
      // Small delay so the stop is fully processed before we restart
      const loopLabel = t("tv.loopOn");
      const timer = setTimeout(() => {
        broadcastPlay.mutate(loopProgramId);
        toast({ title: `🔁 ${loopLabel} — rekomanse otomatik` });
      }, 2000);
      prevBroadcastState.current = broadcastState;
      return () => clearTimeout(timer);
    }
    prevBroadcastState.current = broadcastState;
    return undefined;
  }, [broadcastState]); // eslint-disable-line

  // Returns { url, isIframe } so the preview player knows whether to render
  // <iframe> or <video>. Archive.org and Dailymotion are iframe sources.
  function getAdminEmbedInfo(p: TvProgram): { url: string; isIframe: boolean } | null {
    if (p.videoUrl) {
      try {
        const u = new URL(p.videoUrl);
        const ytParams = "autoplay=1&rel=0&modestbranding=1&controls=1&playsinline=1";
        if (u.hostname.includes("youtu.be"))
          return { url: `https://www.youtube.com/embed/${u.pathname.slice(1).split("?")[0]}?${ytParams}`, isIframe: true };
        if (u.hostname.includes("youtube.com")) {
          const live = u.pathname.match(/\/live\/([^/?]+)/);
          if (live) return { url: `https://www.youtube.com/embed/${live[1]}?${ytParams}`, isIframe: true };
          const v = u.searchParams.get("v");
          if (v) return { url: `https://www.youtube.com/embed/${v}?${ytParams}`, isIframe: true };
        }
        const vm = p.videoUrl.match(/vimeo\.com\/(\d+)/);
        if (vm) return { url: `https://player.vimeo.com/video/${vm[1]}?autoplay=1`, isIframe: true };
        // iframe-only embed pages — must NOT render as <video>
        if (p.videoUrl.includes("archive.org/embed/"))     return { url: p.videoUrl, isIframe: true };
        if (p.videoUrl.includes("dailymotion.com/embed/")) return { url: p.videoUrl, isIframe: true };
        if (p.videoUrl.includes("vidsrc.me/embed/"))       return { url: p.videoUrl, isIframe: true };
        if (p.videoUrl.includes("vidsrc.to/embed/"))       return { url: p.videoUrl, isIframe: true };
        return { url: p.videoUrl, isIframe: false }; // direct mp4 / mov
      } catch { return { url: p.videoUrl, isIframe: false }; }
    }
    if (p.videoKey) return { url: `/api/storage/objects/${p.videoKey}`, isIframe: false };
    return null;
  }

  function confirmDelete(label: string, onConfirm: () => void) {
    if (window.confirm(t("tv.confirmDelete", { title: label }))) onConfirm();
  }

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  if (!hasAdminAccess) return null;

  return (
    <div className="max-w-4xl mx-auto px-3 py-4 pb-24">

      {/* ── Admin Preview Player ── */}
      {previewProgram && (() => {
        const embedInfo = getAdminEmbedInfo(previewProgram);
        return (
          <div className="mb-5 rounded-2xl overflow-hidden border-2 border-violet-500 shadow-xl shadow-violet-500/20 bg-black">
            <div className="flex items-center justify-between px-3 py-2 bg-violet-700 text-white">
              <p className="font-bold text-sm truncate flex items-center gap-2"><Play size={14} /> {previewProgram.title}</p>
              <button onClick={() => setPreviewProgram(null)} className="p-1 rounded-lg hover:bg-white/20"><X size={16} /></button>
            </div>
            <div className="relative" style={{ paddingBottom: "56.25%" }}>
              {embedInfo ? embedInfo.isIframe ? (
                <iframe
                  src={embedInfo.url}
                  className="absolute inset-0 w-full h-full"
                  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                  allowFullScreen
                  title={previewProgram.title}
                  style={{ border: "none" }}
                />
              ) : (
                <video src={embedInfo.url} autoPlay playsInline className="absolute inset-0 w-full h-full object-contain bg-black" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-white/40">
                  <p className="text-sm">{t("tv.noVideo")}</p>
                </div>
              )}
              {/* When LIVE: block all interaction (admin uses broadcast controls only) */}
              {broadcastState !== "stopped" && (
                <>
                  <div className="absolute inset-0 z-10" style={{ background: "transparent" }} />
                  <div className="absolute top-0 right-0 w-28 h-10 z-20 bg-black pointer-events-none" />
                  <div className="absolute top-3 left-3 z-20 flex items-center gap-1 bg-red-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg animate-pulse pointer-events-none">
                    <Radio size={10} /> {broadcastState === "paused" ? "PAUSE" : "LIVE"}
                  </div>
                </>
              )}
            </div>
            {/* Broadcast Controls */}
            <div className="px-3 py-2.5 bg-black border-t border-white/10">
              {broadcastState !== "stopped" && (
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span className="inline-flex items-center gap-1 text-[10px] bg-red-600 text-white px-2 py-0.5 rounded-full font-bold animate-pulse">
                    <Radio size={8} /> {broadcastState === "paused" ? "PAUSE" : "LIVE"}
                  </span>
                  <span className="text-xs text-white/70 flex items-center gap-1">
                    <Eye size={11} /> <strong className="text-white">{viewerCount}</strong> {t("tv.viewers")}
                  </span>
                  {bs.startedAt && (
                    <span className="flex items-center gap-1 text-white/60 text-[10px]">
                      <Timer size={9} /> <BroadcastTimer startedAt={bs.startedAt} />
                    </span>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                {broadcastState === "stopped" ? (
                  <button
                    onClick={() => broadcastPlay.mutate(previewProgram.id)}
                    disabled={broadcastPlay.isPending}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold py-2 rounded-xl transition-colors disabled:opacity-60"
                  >
                    <Radio size={11} /> {t("tv.broadcastGoLive")}
                  </button>
                ) : (
                  <>
                    {broadcastState === "paused" ? (
                      <button
                        onClick={() => broadcastPlay.mutate(previewProgram.id)}
                        disabled={broadcastPlay.isPending}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-bold py-2 rounded-xl transition-colors"
                      >
                        <Play size={11} /> {t("tv.broadcastResume")}
                      </button>
                    ) : (
                      <button
                        onClick={() => broadcastPause.mutate()}
                        disabled={broadcastPause.isPending}
                        className="flex-1 flex items-center justify-center gap-1.5 bg-yellow-500 hover:bg-yellow-600 text-black text-xs font-bold py-2 rounded-xl transition-colors"
                      >
                        <Pause size={11} /> {t("tv.broadcastPause")}
                      </button>
                    )}
                    <button
                      onClick={() => broadcastStop.mutate()}
                      disabled={broadcastStop.isPending}
                      className="flex items-center justify-center gap-1 bg-gray-700 hover:bg-gray-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors"
                    >
                      <Square size={11} /> {t("tv.broadcastStop")}
                    </button>
                  </>
                )}
              </div>
              {broadcastState === "stopped" && (
                <p className="text-[10px] text-white/40 mt-1.5 text-center">{t("tv.broadcastHint")}</p>
              )}
            </div>

            {/* ── Viewer Preview ── */}
            {broadcastState !== "stopped" && (
              <div className="border-t border-white/10">
                <div className="flex items-center gap-2 px-3 py-2 bg-black/80">
                  <Monitor size={13} className="text-violet-400" />
                  <p className="text-xs font-semibold text-white/80">{t("tv.viewerPreview")}</p>
                  <span className="text-[10px] text-white/40 ml-1">{t("tv.viewerPreviewSub")}</span>
                </div>
                <div className="relative bg-black overflow-hidden" style={{ paddingBottom: "56.25%" }}>
                  <iframe
                    src="/tv"
                    className="absolute inset-0 w-full h-full"
                    title={t("tv.viewerPreview")}
                    style={{ border: "none", transform: "scale(1)", transformOrigin: "top left" }}
                    scrolling="no"
                  />
                  <div className="absolute inset-0 z-10" style={{ pointerEvents: "none" }} />
                  <div className="absolute top-2 right-2 z-20 bg-black/70 text-white text-[9px] px-1.5 py-0.5 rounded-full pointer-events-none">
                    👁 {t("tv.viewerPreview")}
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Tv size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">{t("tv.adminTitle")}</h1>
            <p className="text-xs text-muted-foreground">{t("tv.adminSubtitle")}</p>
          </div>
        </div>
        <button
          onClick={() => setLocation("/tv")}
          className="text-xs text-violet-500 hover:underline"
        >
          {t("tv.seeTV")}
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { icon: Film, label: t("tv.totalPrograms"), value: programs?.length ?? "—" },
          { icon: List, label: t("tv.totalSeries"), value: series?.length ?? "—" },
          { icon: Eye, label: t("tv.totalViews"), value: programs ? programs.reduce((s, p) => s + p.viewCount, 0).toLocaleString() : "—" },
        ].map(stat => (
          <div key={stat.label} className="bg-card border border-border rounded-xl p-3 text-center">
            <stat.icon size={18} className="mx-auto mb-1 text-violet-500" />
            <p className="text-lg font-bold">{stat.value}</p>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted rounded-xl p-1 mb-4">
        {[
          { key: "programs", label: t("tv.tabAdminPrograms") },
          { key: "series",   label: t("tv.tabAdminSeries") },
          { key: "import",   label: t("tv.tabImport") },
        ].map(tab_ => (
          <button
            key={tab_.key}
            onClick={() => { setTab(tab_.key as any); if (tab_.key === "import" && archiveResults.length === 0) searchArchive(); }}
            className={cn("flex-1 py-2 rounded-lg text-xs font-medium transition-all", tab === tab_.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}
          >
            {tab_.label}
          </button>
        ))}
      </div>

      {/* Programs Tab */}
      {tab === "programs" && (
        <>
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-muted-foreground">{programs?.length ?? 0} {t("tv.programCount")}</p>
            <button
              onClick={() => setLocation("/admin/tv/programs/new")}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
            >
              <Plus size={16} /> {t("tv.addProgram")}
            </button>
          </div>

          {loadingP ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}</div>
          ) : !programs?.length ? (
            <div className="text-center py-16 text-muted-foreground">
              <Film size={48} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">{t("tv.noDataPrograms")}</p>
              <p className="text-sm">{t("tv.noDataProgramsHint")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {programs.map(p => (
                <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-violet-500/30 transition-colors">
                  {p.thumbnailUrl ? (
                    <img src={p.thumbnailUrl} alt={p.title} className="w-14 h-10 rounded-lg object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-14 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                      <Film size={16} className="text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-sm truncate">{p.title}</p>
                      {p.type === "live" && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full font-bold animate-pulse">
                          <Radio size={8} /> LIVE
                        </span>
                      )}
                      {p.isFeatured && <Star size={12} className="text-yellow-500 flex-shrink-0" />}
                      {!p.isActive && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">{t("tv.hidden")}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{typeLabel(p.type)}{p.seriesTitle ? ` · ${p.seriesTitle}` : ""}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {p.durationMinutes && <span className="flex items-center gap-1"><Clock size={10} /> {p.durationMinutes}min</span>}
                      {p.scheduledAt && <span className="flex items-center gap-1"><Calendar size={10} /> {formatDateTime(p.scheduledAt)}</span>}
                      <span className="flex items-center gap-1"><Eye size={10} /> {p.viewCount}</span>
                    </div>
                    {/* Quick action buttons */}
                    <div className="flex gap-2 mt-1.5 flex-wrap">
                      <button
                        onClick={() => setPreviewProgram(prev => prev?.id === p.id ? null : p)}
                        className={cn(
                          "flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors",
                          previewProgram?.id === p.id
                            ? "bg-violet-600 text-white"
                            : "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 hover:bg-violet-200"
                        )}
                      >
                        <Play size={9} /> {previewProgram?.id === p.id ? "Fèmen" : "Preview"}
                      </button>
                      {/* 🔁 Loop/Repeat toggle */}
                      <button
                        onClick={() => setLoopProgramId(prev => prev === p.id ? null : p.id)}
                        title={t("tv.loopTooltip")}
                        className={cn(
                          "flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full transition-colors",
                          loopProgramId === p.id
                            ? "bg-green-500 text-white"
                            : "bg-muted text-muted-foreground hover:bg-green-100 hover:text-green-700"
                        )}
                      >
                        <Repeat2 size={9} />
                        {loopProgramId === p.id ? t("tv.loopOn") : t("tv.loopOff")}
                      </button>
                      {p.type === "live" ? (
                        <button
                          onClick={() => toggleLive.mutate({ id: p.id, makeLive: false })}
                          disabled={toggleLive.isPending && goingLive === p.id}
                          className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 transition-colors"
                        >
                          <Square size={9} /> {t("tv.stopLive")}
                        </button>
                      ) : (
                        <button
                          onClick={() => { setGoingLive(p.id); toggleLive.mutate({ id: p.id, makeLive: true }); }}
                          disabled={toggleLive.isPending && goingLive === p.id}
                          className="flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors disabled:opacity-60"
                        >
                          <Radio size={9} /> {t("tv.goLive")}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1 flex-shrink-0">
                    <button
                      onClick={() => setLocation(`/admin/tv/programs/${p.id}/edit`)}
                      className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      onClick={() => confirmDelete(p.title, () => deleteProgram.mutate(p.id))}
                      className="p-2 rounded-lg hover:bg-red-500/10 transition-colors text-muted-foreground hover:text-red-500"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Series Tab */}
      {tab === "series" && (
        <>
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-muted-foreground">{series?.length ?? 0} seri</p>
            <button
              onClick={() => setEditSeries("new")}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
            >
              <Plus size={16} /> {t("tv.addSeries")}
            </button>
          </div>

          {loadingS ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-xl" />)}</div>
          ) : !series?.length ? (
            <div className="text-center py-16 text-muted-foreground">
              <List size={48} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">{t("tv.noDataSeries")}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {series.map(s => {
                const eps = programs?.filter(p => p.seriesId === s.id).length ?? 0;
                const epOpen = epImportSeriesId === s.id;
                // Next episode number = current count + 1
                const nextEpNum = eps + 1;
                return (
                  <div key={s.id} className="rounded-xl border border-border bg-card overflow-hidden">
                    {/* Series row */}
                    <div className="flex items-center gap-3 p-3 hover:border-violet-500/30 transition-colors">
                      {s.thumbnailUrl ? (
                        <img src={s.thumbnailUrl} alt={s.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                      ) : (
                        <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                          <List size={18} className="text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm">{s.title}</p>
                        <p className="text-xs text-muted-foreground">{eps} {t("tv.episodes")}{!s.isActive ? ` · ${t("tv.hidden")}` : ""}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {/* 📥 Import episodes button */}
                        <button
                          onClick={() => {
                            if (epOpen) { setEpImportSeriesId(null); setEpResults([]); }
                            else searchEpisodes(s.title, s.id);
                          }}
                          title="Importe episòd"
                          className={cn(
                            "p-2 rounded-lg text-xs font-bold transition-colors flex items-center gap-1",
                            epOpen
                              ? "bg-violet-600 text-white"
                              : "hover:bg-violet-500/10 text-violet-500 hover:text-violet-600"
                          )}
                        >
                          <Download size={14} />
                        </button>
                        <button onClick={() => setEditSeries(s)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                          <Pencil size={15} />
                        </button>
                        <button onClick={() => confirmDelete(s.title, () => deleteSeries.mutate(s.id))} className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>

                    {/* ── Inline episode import panel ── */}
                    {epOpen && (
                      <div className="border-t border-border bg-violet-50/50 dark:bg-violet-950/10 p-3 space-y-2">
                        <div className="flex items-center gap-2 mb-1">
                          <Download size={12} className="text-violet-500" />
                          <p className="text-[11px] font-bold text-violet-700 dark:text-violet-300">
                            Importe episòd pou "{s.title}"
                          </p>
                          <span className="ml-auto text-[10px] text-muted-foreground">Dailymotion · &gt;10 min</span>
                        </div>

                        {epLoading && (
                          <div className="space-y-2">
                            {[...Array(3)].map((_, i) => (
                              <div key={i} className="flex gap-2 rounded-lg border border-border p-2 animate-pulse">
                                <div className="w-16 h-10 bg-muted rounded flex-shrink-0" />
                                <div className="flex-1 space-y-1.5 py-0.5">
                                  <div className="h-2.5 bg-muted rounded w-3/4" />
                                  <div className="h-5 bg-muted rounded w-full" />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {!epLoading && epResults.length === 0 && (
                          <div className="text-center py-4 text-muted-foreground">
                            <p className="text-xs">Pa jwenn episòd. Eseye edite tit seri a.</p>
                          </div>
                        )}

                        {!epLoading && epResults.length > 0 && (
                          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                            {epResults.map((item, idx) => {
                              const isImported  = epImportedIds.has(item.identifier);
                              const isImporting = importEpisode.isPending &&
                                (importEpisode.variables as { item: ArchiveResult } | undefined)?.item?.identifier === item.identifier;
                              const epNum = nextEpNum + idx;
                              return (
                                <div key={item.identifier} className="flex gap-2 rounded-lg border border-border bg-card p-2">
                                  {/* Thumbnail */}
                                  <div className="w-20 h-12 flex-shrink-0 rounded overflow-hidden bg-muted relative">
                                    {item.thumbnailUrl ? (
                                      <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center"><Play size={14} className="text-muted-foreground" /></div>
                                    )}
                                    {item.durationMinutes && (
                                      <span className="absolute bottom-0.5 right-0.5 text-[8px] bg-black/80 text-white px-1 rounded">{item.durationMinutes}m</span>
                                    )}
                                  </div>
                                  {/* Info + button */}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-semibold line-clamp-2 leading-tight mb-1">{item.title}</p>
                                    <button
                                      onClick={() => !isImported && importEpisode.mutate({ item, seriesId: s.id, episodeNumber: epNum })}
                                      disabled={isImported || isImporting}
                                      className={cn(
                                        "w-full flex items-center justify-center gap-1 text-[10px] font-bold py-1 rounded transition-colors",
                                        isImported
                                          ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                          : "bg-violet-600 hover:bg-violet-700 text-white disabled:opacity-60"
                                      )}
                                    >
                                      {isImported ? (
                                        <><Check size={9} /> Ep {epNum} ajoute</>
                                      ) : isImporting ? "…" : (
                                        <><Download size={9} /> Ajoute kòm Ep {epNum}</>
                                      )}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ── Import Tab (Archive.org) ───────────────────────────────────── */}
      {tab === "import" && (
        <div className="space-y-3">
          {/* ── Import header + source sub-tabs ── */}
          <div className="flex items-center gap-2 mb-2">
            <Globe size={16} className="text-violet-500" />
            <p className="text-sm font-semibold">{t("tv.importTitle2")}</p>
          </div>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            <button
              onClick={() => { setImportSubTab("archive"); if (archiveResults.length === 0) searchArchive(); }}
              className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold py-2.5 rounded-xl border transition-colors",
                importSubTab === "archive"
                  ? "bg-violet-600 text-white border-violet-600"
                  : "border-border text-muted-foreground hover:border-violet-400")}
            >
              🗄 Archive.org
              <span className={cn("text-[9px] font-medium",
                importSubTab === "archive" ? "text-white/70" : "text-muted-foreground")}>
                {t("tv.importFree")}
              </span>
            </button>
            <button
              onClick={() => { setImportSubTab("dailymotion"); if (dmResults.length === 0) searchDailymotion(); }}
              className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold py-2.5 rounded-xl border transition-colors",
                importSubTab === "dailymotion"
                  ? "bg-blue-600 text-white border-blue-600"
                  : "border-border text-muted-foreground hover:border-blue-400")}
            >
              📺 Dailymotion
              <span className={cn("text-[9px] font-medium",
                importSubTab === "dailymotion" ? "text-white/70" : "text-muted-foreground")}>
                {t("tv.dmFree")}
              </span>
            </button>
            <button
              onClick={() => { setImportSubTab("tvmaze"); if (tmResults.length === 0) searchTVMaze(); }}
              className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold py-2.5 rounded-xl border transition-colors",
                importSubTab === "tvmaze"
                  ? "bg-orange-500 text-white border-orange-500"
                  : "border-border text-muted-foreground hover:border-orange-400")}
            >
              📡 TVMaze
              <span className={cn("text-[9px] font-medium",
                importSubTab === "tvmaze" ? "text-white/70" : "text-muted-foreground")}>
                {t("tv.tmFree")}
              </span>
            </button>
            <button
              onClick={() => { setImportSubTab("yts"); if (ytsResults.length === 0) searchYTS(); }}
              className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold py-2.5 rounded-xl border transition-colors",
                importSubTab === "yts"
                  ? "bg-green-600 text-white border-green-600"
                  : "border-border text-muted-foreground hover:border-green-400")}
            >
              🎬 YTS · HD Films
              <span className={cn("text-[9px] font-medium",
                importSubTab === "yts" ? "text-white/70" : "text-muted-foreground")}>
                720p · 1080p · 4K
              </span>
            </button>
            <button
              onClick={() => { setImportSubTab("cinemafr"); if (frResults.length === 0) searchCinemaFR(); }}
              className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold py-2.5 rounded-xl border transition-colors",
                importSubTab === "cinemafr"
                  ? "bg-blue-700 text-white border-blue-700"
                  : "border-border text-muted-foreground hover:border-blue-500")}
            >
              🇫🇷 Ciné FR
              <span className={cn("text-[9px] font-medium",
                importSubTab === "cinemafr" ? "text-white/70" : "text-muted-foreground")}>
                Films Modèn
              </span>
            </button>
            <button
              onClick={() => { setImportSubTab("archivefr"); if (afrResults.length === 0) searchArchiveFR(); }}
              className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold py-2.5 rounded-xl border transition-colors",
                importSubTab === "archivefr"
                  ? "bg-purple-700 text-white border-purple-700"
                  : "border-border text-muted-foreground hover:border-purple-500")}
            >
              🏛 Classiques FR
              <span className={cn("text-[9px] font-medium",
                importSubTab === "archivefr" ? "text-white/70" : "text-muted-foreground")}>
                33 000+ films
              </span>
            </button>
            <button
              onClick={() => { setImportSubTab("seriesfr"); if (srfrResults.length === 0) searchSeriesFR(); }}
              className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold py-2.5 rounded-xl border transition-colors",
                importSubTab === "seriesfr"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "border-border text-muted-foreground hover:border-indigo-400")}
            >
              🇫🇷 Séries FR
              <span className={cn("text-[9px] font-medium",
                importSubTab === "seriesfr" ? "text-white/70" : "text-muted-foreground")}>
                TVMaze · Gratis
              </span>
            </button>
            <button
              onClick={() => { setImportSubTab("anime"); if (animeResults.length === 0) searchAnime(); }}
              className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold py-2.5 rounded-xl border transition-colors",
                importSubTab === "anime"
                  ? "bg-pink-600 text-white border-pink-600"
                  : "border-border text-muted-foreground hover:border-pink-400")}
            >
              🎌 Anime
              <span className={cn("text-[9px] font-medium",
                importSubTab === "anime" ? "text-white/70" : "text-muted-foreground")}>
                MyAnimeList · Gratis
              </span>
            </button>
            <button
              onClick={() => { setImportSubTab("seriesen"); if (srenResults.length === 0) searchSeriesEN(); }}
              className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold py-2.5 rounded-xl border transition-colors",
                importSubTab === "seriesen"
                  ? "bg-sky-600 text-white border-sky-600"
                  : "border-border text-muted-foreground hover:border-sky-400")}
            >
              📺 Séries EN
              <span className={cn("text-[9px] font-medium",
                importSubTab === "seriesen" ? "text-white/70" : "text-muted-foreground")}>
                TVMaze · Anglè
              </span>
            </button>
            <button
              onClick={() => { setImportSubTab("tvarchi"); if (tvaResults.length === 0) searchTVArchi(); }}
              className={cn("flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold py-2.5 rounded-xl border transition-colors",
                importSubTab === "tvarchi"
                  ? "bg-amber-600 text-white border-amber-600"
                  : "border-border text-muted-foreground hover:border-amber-400")}
            >
              📡 TV Archive
              <span className={cn("text-[9px] font-medium",
                importSubTab === "tvarchi" ? "text-white/70" : "text-muted-foreground")}>
                Archive.org · TV
              </span>
            </button>
          </div>

          {/* ════ ARCHIVE.ORG PANEL ════ */}
          {importSubTab === "archive" && (<>
            {/* Search form */}
            <form onSubmit={searchArchive} className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={archiveQuery}
                  onChange={e => setArchiveQuery(e.target.value)}
                  placeholder={t("tv.importSearchPlaceholder")}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/40"
                />
              </div>
              <button
                type="submit"
                disabled={archiveLoading}
                className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-60 flex-shrink-0"
              >
                {archiveLoading ? "…" : t("tv.importSearch")}
              </button>
            </form>

            {/* Genre quick-filters */}
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => { setArchiveGenre(""); setArchiveQuery(""); }}
                className={cn("text-[11px] px-2.5 py-1 rounded-full border transition-colors font-medium",
                  archiveGenre === "" && archiveQuery === ""
                    ? "bg-violet-600 text-white border-violet-600"
                    : "border-border text-muted-foreground hover:border-violet-500")}
              >
                🌐 {t("tv.importAll")}
              </button>
              {ARCHIVE_GENRES.map(g => (
                <button
                  key={g.value}
                  onClick={() => { setArchiveGenre(g.value); setArchiveQuery(""); setTimeout(() => searchArchive(), 0); }}
                  className={cn("text-[11px] px-2.5 py-1 rounded-full border transition-colors font-medium",
                    archiveGenre === g.value
                      ? "bg-violet-600 text-white border-violet-600"
                      : "border-border text-muted-foreground hover:border-violet-500")}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {archiveTotal !== null && !archiveLoading && (
              <p className="text-xs text-muted-foreground">
                {archiveTotal.toLocaleString()} {t("tv.importResults")} — {t("tv.importShowing")} {archiveResults.length}
              </p>
            )}
            {archiveLoading && <ImportSkeleton />}
            {!archiveLoading && archiveResults.length === 0 && archiveTotal === 0 && <ImportEmpty label={t("tv.importNoResults")} />}
            {!archiveLoading && archiveResults.length > 0 && (
              <ImportGrid items={archiveResults} importedIds={importedIds} isPending={importProgram.isPending}
                pendingId={(importProgram.variables as ArchiveResult | undefined)?.identifier}
                onAdd={item => importProgram.mutate(item)}
                addLabel={t("tv.importAdd")} addedLabel={t("tv.importAdded")} />
            )}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
              <Globe size={10} />
              <span>Powered by <a href="https://archive.org" target="_blank" rel="noopener" className="underline hover:text-foreground">Internet Archive</a> — Public Domain</span>
            </div>
          </>)}

          {/* ════ DAILYMOTION PANEL ════ */}
          {importSubTab === "dailymotion" && (<>
            <form onSubmit={searchDailymotion} className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={dmQuery}
                  onChange={e => setDmQuery(e.target.value)}
                  placeholder={t("tv.dmSearchPlaceholder")}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <button
                type="submit"
                disabled={dmLoading}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-60 flex-shrink-0"
              >
                {dmLoading ? "…" : t("tv.importSearch")}
              </button>
            </form>

            {/* Category quick-filters */}
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => { setDmCategory(""); setDmQuery(""); }}
                className={cn("text-[11px] px-2.5 py-1 rounded-full border transition-colors font-medium",
                  dmCategory === "" && dmQuery === ""
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-border text-muted-foreground hover:border-blue-500")}
              >
                🌐 {t("tv.importAll")}
              </button>
              {DM_CATEGORIES.map(g => (
                <button
                  key={g.value}
                  onClick={() => { setDmCategory(g.value); setDmQuery(""); setTimeout(() => searchDailymotion(), 0); }}
                  className={cn("text-[11px] px-2.5 py-1 rounded-full border transition-colors font-medium",
                    dmCategory === g.value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-border text-muted-foreground hover:border-blue-500")}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {dmTotal !== null && !dmLoading && (
              <p className="text-xs text-muted-foreground">
                {dmTotal.toLocaleString()} {t("tv.importResults")} — {t("tv.importShowing")} {dmResults.length}
              </p>
            )}
            {dmLoading && <ImportSkeleton />}
            {!dmLoading && dmResults.length === 0 && dmTotal === 0 && <ImportEmpty label={t("tv.importNoResults")} />}
            {!dmLoading && dmResults.length > 0 && (
              <ImportGrid items={dmResults} importedIds={importedIds} isPending={importProgram.isPending}
                pendingId={(importProgram.variables as ArchiveResult | undefined)?.identifier}
                onAdd={item => importProgram.mutate(item)}
                addLabel={t("tv.importAdd")} addedLabel={t("tv.importAdded")} />
            )}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
              <Globe size={10} />
              <span>Powered by <a href="https://www.dailymotion.com" target="_blank" rel="noopener" className="underline hover:text-foreground">Dailymotion</a> — {t("tv.dmFree")}</span>
            </div>
          </>)}

          {/* ════ TVMAZE PANEL — import TV series metadata ════ */}
          {importSubTab === "tvmaze" && (<>
            {/* Info banner */}
            <div className="rounded-xl bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800/40 p-3 flex gap-2">
              <span className="text-lg flex-shrink-0">📡</span>
              <div>
                <p className="text-xs font-semibold text-orange-800 dark:text-orange-300">{t("tv.tmFree")}</p>
                <p className="text-[11px] text-orange-700 dark:text-orange-400 mt-0.5">
                  {t("tv.tmSearchPlaceholder").replace("…", "")} → {t("tv.tmImportSeries")} → lye episòd ak videyo ou vle
                </p>
              </div>
            </div>

            {/* Search form */}
            <form onSubmit={searchTVMaze} className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={tmQuery}
                  onChange={e => setTmQuery(e.target.value)}
                  placeholder={t("tv.tmSearchPlaceholder")}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                />
              </div>
              <button
                type="submit"
                disabled={tmLoading}
                className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-60 flex-shrink-0"
              >
                {tmLoading ? "…" : t("tv.importSearch")}
              </button>
            </form>

            {/* Loading skeleton */}
            {tmLoading && (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex gap-3 rounded-xl border border-border p-3 animate-pulse">
                    <div className="w-14 h-20 bg-muted rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3.5 bg-muted rounded w-3/4" />
                      <div className="h-2.5 bg-muted rounded w-1/2" />
                      <div className="h-2.5 bg-muted rounded w-2/3" />
                      <div className="h-7 bg-muted rounded-lg w-full mt-3" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* No results */}
            {!tmLoading && tmResults.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <Tv size={40} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t("tv.importNoResults")}</p>
              </div>
            )}

            {/* Results list */}
            {!tmLoading && tmResults.length > 0 && (
              <div className="space-y-3">
                {tmResults.map(item => {
                  const isImported  = importedSeriesIds.has(item.identifier);
                  const isImporting = importSeries.isPending && (importSeries.variables as TVMazeResult | undefined)?.identifier === item.identifier;
                  return (
                    <div key={item.identifier} className="flex gap-3 rounded-xl border border-border bg-card hover:border-orange-400/40 transition-colors p-3">
                      {/* Poster */}
                      <div className="w-14 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                        {item.thumbnailUrl ? (
                          <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><Tv size={20} className="text-muted-foreground" /></div>
                        )}
                      </div>
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <p className="font-semibold text-sm truncate">{item.title}</p>
                          {item.year && <span className="text-[10px] text-muted-foreground flex-shrink-0">{item.year}</span>}
                          {item.status && item.status !== "Ended" && (
                            <span className="text-[9px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">{item.status}</span>
                          )}
                        </div>
                        {item.network && <p className="text-[10px] text-muted-foreground mb-1">{t("tv.tmNetwork")}: {item.network}</p>}
                        {item.genres.length > 0 && <p className="text-[10px] text-muted-foreground mb-1.5">{item.genres.slice(0,3).join(" · ")}</p>}
                        {item.description && <p className="text-[10px] text-muted-foreground line-clamp-2 mb-2">{item.description}</p>}
                        <button
                          onClick={() => !isImported && importSeries.mutate(item)}
                          disabled={isImported || isImporting}
                          className={cn(
                            "w-full flex items-center justify-center gap-1 text-[11px] font-bold py-1.5 rounded-lg transition-colors",
                            isImported
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                              : "bg-orange-500 hover:bg-orange-600 text-white disabled:opacity-60"
                          )}
                        >
                          {isImported ? (
                            <><Check size={10} /> {t("tv.tmImportedSeries")}</>
                          ) : isImporting ? "…" : (
                            <><Download size={10} /> {t("tv.tmImportSeries")}</>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
              <Globe size={10} />
              <span>Powered by <a href="https://www.tvmaze.com" target="_blank" rel="noopener" className="underline hover:text-foreground">TVMaze</a> — Free TV metadata</span>
            </div>
          </>)}

          {/* ════ YTS HD FILMS PANEL ════ */}
          {importSubTab === "yts" && (<>
            {/* Info banner */}
            <div className="rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800/40 p-3 flex gap-2">
              <span className="text-lg flex-shrink-0">🎬</span>
              <div>
                <p className="text-xs font-semibold text-green-800 dark:text-green-300">YTS · 40 000+ fim HD — Gratis</p>
                <p className="text-[11px] text-green-700 dark:text-green-400 mt-0.5">
                  Rechèche fim → chwazi kalite (720p / 1080p / 4K) → enpòte nan pwogram Flexa TV
                </p>
              </div>
            </div>

            {/* Quality + search form */}
            <div className="flex gap-1.5 mb-1.5">
              {(["720p","1080p","2160p"] as const).map(q => (
                <button key={q}
                  onClick={() => { setYtsQuality(q); searchYTS(undefined, ytsGenre, q); }}
                  className={cn("text-[10px] px-2.5 py-1 rounded-full border font-bold transition-colors",
                    ytsQuality === q
                      ? "bg-green-600 text-white border-green-600"
                      : "border-border text-muted-foreground hover:border-green-500")}
                >
                  {q === "2160p" ? "4K" : q}
                </button>
              ))}
            </div>
            <form onSubmit={searchYTS} className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={ytsQuery}
                  onChange={e => setYtsQuery(e.target.value)}
                  placeholder="Rechèche fim… ex: Avengers, 2024"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40"
                />
              </div>
              <button
                type="submit"
                disabled={ytsLoading}
                className="px-4 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-60 flex-shrink-0"
              >
                {ytsLoading ? "…" : t("tv.importSearch")}
              </button>
            </form>

            {/* Genre quick-filters */}
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => { setYtsGenre(""); searchYTS(undefined, "", ytsQuality); }}
                className={cn("text-[11px] px-2.5 py-1 rounded-full border transition-colors font-medium",
                  ytsGenre === ""
                    ? "bg-green-600 text-white border-green-600"
                    : "border-border text-muted-foreground hover:border-green-500")}
              >
                🌐 {t("tv.importAll")}
              </button>
              {YTS_GENRES.map(g => (
                <button key={g.value}
                  onClick={() => { setYtsGenre(g.value); setYtsQuery(""); searchYTS(undefined, g.value, ytsQuality); }}
                  className={cn("text-[11px] px-2.5 py-1 rounded-full border transition-colors font-medium",
                    ytsGenre === g.value
                      ? "bg-green-600 text-white border-green-600"
                      : "border-border text-muted-foreground hover:border-green-500")}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {ytsTotal !== null && !ytsLoading && (
              <p className="text-xs text-muted-foreground">
                {ytsTotal.toLocaleString()} fim — {t("tv.importShowing")} {ytsResults.length}
              </p>
            )}
            {ytsLoading && <ImportSkeleton />}
            {!ytsLoading && ytsResults.length === 0 && ytsTotal === 0 && <ImportEmpty label={t("tv.importNoResults")} />}
            {!ytsLoading && ytsResults.length > 0 && (
              <ImportGrid
                items={ytsResults}
                importedIds={importedIds}
                isPending={importProgram.isPending}
                pendingId={(importProgram.variables as ArchiveResult | undefined)?.identifier}
                onAdd={item => importProgram.mutate(item)}
                addLabel={t("tv.importAdd")}
                addedLabel={t("tv.importAdded")}
              />
            )}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
              <Globe size={10} />
              <span>Powered by <a href="https://yts.mx" target="_blank" rel="noopener" className="underline hover:text-foreground">YTS.mx</a> · Streaming via <a href="https://vidsrc.me" target="_blank" rel="noopener" className="underline hover:text-foreground">vidsrc.me</a> — Free HD</span>
            </div>
          </>)}

          {/* ════ CINÉ FR — Films Français via Dailymotion (language=fr) ════ */}
          {importSubTab === "cinemafr" && (<>
            <div className="rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 p-3 flex gap-2">
              <span className="text-lg flex-shrink-0">🇫🇷</span>
              <div>
                <p className="text-xs font-semibold text-blue-800 dark:text-blue-300">Films Français — Gratis · Modèn</p>
                <p className="text-[11px] text-blue-700 dark:text-blue-400 mt-0.5">
                  Rechèche nan fim fransè resan — filtre pa jener epi enpòte dirèkteman nan Flexa TV
                </p>
              </div>
            </div>

            <form onSubmit={searchCinemaFR} className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={frQuery}
                  onChange={e => setFrQuery(e.target.value)}
                  placeholder="Rechèche… ex: comédie 2024, romance français"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                />
              </div>
              <button
                type="submit"
                disabled={frLoading}
                className="px-4 py-2.5 bg-blue-700 hover:bg-blue-800 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-60 flex-shrink-0"
              >
                {frLoading ? "…" : t("tv.importSearch")}
              </button>
            </form>

            {/* Genre quick-filters */}
            <div className="flex gap-1.5 flex-wrap">
              <button
                onClick={() => { setFrGenre(""); setTimeout(() => searchCinemaFR(), 0); }}
                className={cn("text-[11px] px-2.5 py-1 rounded-full border transition-colors font-medium",
                  frGenre === ""
                    ? "bg-blue-700 text-white border-blue-700"
                    : "border-border text-muted-foreground hover:border-blue-500")}
              >
                🌐 {t("tv.importAll")}
              </button>
              {FR_GENRES.map(g => (
                <button key={g.value}
                  onClick={() => { setFrGenre(g.value); setFrQuery(""); setTimeout(() => searchCinemaFR(), 0); }}
                  className={cn("text-[11px] px-2.5 py-1 rounded-full border transition-colors font-medium",
                    frGenre === g.value
                      ? "bg-blue-700 text-white border-blue-700"
                      : "border-border text-muted-foreground hover:border-blue-500")}
                >
                  {g.label}
                </button>
              ))}
            </div>

            {frTotal !== null && !frLoading && (
              <p className="text-xs text-muted-foreground">
                {frTotal.toLocaleString()} rezilta — {t("tv.importShowing")} {frResults.length}
              </p>
            )}
            {frLoading && <ImportSkeleton />}
            {!frLoading && frResults.length === 0 && frTotal === 0 && <ImportEmpty label={t("tv.importNoResults")} />}
            {!frLoading && frResults.length > 0 && (
              <ImportGrid
                items={frResults}
                importedIds={importedIds}
                isPending={importProgram.isPending}
                pendingId={(importProgram.variables as ArchiveResult | undefined)?.identifier}
                onAdd={item => importProgram.mutate(item)}
                addLabel={t("tv.importAdd")}
                addedLabel={t("tv.importAdded")}
              />
            )}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
              <Globe size={10} />
              <span>Powered by <a href="https://www.dailymotion.com" target="_blank" rel="noopener" className="underline hover:text-foreground">Dailymotion</a> · language=fr&country=fr — Gratis</span>
            </div>
          </>)}

          {/* ════ CLASSIQUES FR — Archive.org language:French ════ */}
          {importSubTab === "archivefr" && (<>
            <div className="rounded-xl bg-purple-50 dark:bg-purple-950/20 border border-purple-200 dark:border-purple-800/40 p-3 flex gap-2">
              <span className="text-lg flex-shrink-0">🏛</span>
              <div>
                <p className="text-xs font-semibold text-purple-800 dark:text-purple-300">Classiques François — 33 000+ fim · Gratis</p>
                <p className="text-[11px] text-purple-700 dark:text-purple-400 mt-0.5">
                  Archive.org · domèn piblik · soti 1895 rive jodi a — pa gen kle API
                </p>
              </div>
            </div>

            {/* Sort + year filters */}
            <div className="flex gap-1.5 flex-wrap">
              {[
                { label: "📥 Plis popilè", sort: "downloads desc", year: "" },
                { label: "🆕 Pi resan",    sort: "publicdate desc", year: "2000-2025" },
                { label: "⭐ Klasik",       sort: "downloads desc",  year: "1920-1980" },
                { label: "📅 2000-2024",    sort: "downloads desc",  year: "2000-2024" },
              ].map(opt => (
                <button key={opt.label}
                  onClick={() => {
                    setAfrSort(opt.sort); setAfrYear(opt.year);
                    searchArchiveFR(undefined, opt.year, opt.sort);
                  }}
                  className={cn("text-[11px] px-2.5 py-1 rounded-full border transition-colors font-medium",
                    afrSort === opt.sort && afrYear === opt.year
                      ? "bg-purple-700 text-white border-purple-700"
                      : "border-border text-muted-foreground hover:border-purple-500")}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <form onSubmit={searchArchiveFR} className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={afrQuery}
                  onChange={e => setAfrQuery(e.target.value)}
                  placeholder="Rechèche… ex: comédie, Godard, Truffaut, 1960"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                />
              </div>
              <button
                type="submit"
                disabled={afrLoading}
                className="px-4 py-2.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-60 flex-shrink-0"
              >
                {afrLoading ? "…" : t("tv.importSearch")}
              </button>
            </form>

            {afrTotal !== null && !afrLoading && (
              <p className="text-xs text-muted-foreground">
                {afrTotal.toLocaleString()} rezilta — {t("tv.importShowing")} {afrResults.length}
              </p>
            )}
            {afrLoading && <ImportSkeleton />}
            {!afrLoading && afrResults.length === 0 && afrTotal === 0 && <ImportEmpty label={t("tv.importNoResults")} />}
            {!afrLoading && afrResults.length > 0 && (
              <ImportGrid
                items={afrResults}
                importedIds={importedIds}
                isPending={importProgram.isPending}
                pendingId={(importProgram.variables as ArchiveResult | undefined)?.identifier}
                onAdd={item => importProgram.mutate(item)}
                addLabel={t("tv.importAdd")}
                addedLabel={t("tv.importAdded")}
              />
            )}
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
              <Globe size={10} />
              <span>Powered by <a href="https://archive.org" target="_blank" rel="noopener" className="underline hover:text-foreground">Archive.org</a> · language:French — 100% Gratis &amp; Legal</span>
            </div>
          </>)}

          {/* ════ SÉRIES FR — TVMaze French-language series ════ */}
          {importSubTab === "seriesfr" && (<>
            <div className="rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/40 p-3 flex gap-2">
              <span className="text-lg flex-shrink-0">🇫🇷</span>
              <div>
                <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300">Séries Françaises — TVMaze · Gratis</p>
                <p className="text-[11px] text-indigo-700 dark:text-indigo-400 mt-0.5">
                  Enpòte seri fransè (Lupin, Skam France, Criminal: France…) → lye episòd ak lyen videyo w vle
                </p>
              </div>
            </div>

            <form onSubmit={searchSeriesFR} className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={srfrQuery}
                  onChange={e => setSrfrQuery(e.target.value)}
                  placeholder="Rechèche… ex: Lupin, Paris, Skam France"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                />
              </div>
              <button
                type="submit"
                disabled={srfrLoading}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-60 flex-shrink-0"
              >
                {srfrLoading ? "…" : t("tv.importSearch")}
              </button>
            </form>

            {srfrLoading && (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex gap-3 rounded-xl border border-border p-3 animate-pulse">
                    <div className="w-14 h-20 bg-muted rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3.5 bg-muted rounded w-3/4" />
                      <div className="h-2.5 bg-muted rounded w-1/2" />
                      <div className="h-7 bg-muted rounded-lg w-full mt-3" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!srfrLoading && srfrResults.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <Tv size={40} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t("tv.importNoResults")}</p>
              </div>
            )}

            {!srfrLoading && srfrResults.length > 0 && (
              <div className="space-y-3">
                {srfrResults.map(item => {
                  const isImported  = importedSeriesIds.has(item.identifier);
                  const isImporting = importSeries.isPending && (importSeries.variables as TVMazeResult | undefined)?.identifier === item.identifier;
                  return (
                    <div key={item.identifier} className="flex gap-3 rounded-xl border border-border bg-card hover:border-indigo-400/40 transition-colors p-3">
                      <div className="w-14 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                        {item.thumbnailUrl ? (
                          <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><Tv size={20} className="text-muted-foreground" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <p className="font-semibold text-sm truncate">{item.title}</p>
                          {item.year && <span className="text-[10px] text-muted-foreground flex-shrink-0">{item.year}</span>}
                          {item.status && item.status !== "Ended" && (
                            <span className="text-[9px] bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">{item.status}</span>
                          )}
                        </div>
                        {item.network && <p className="text-[10px] text-muted-foreground mb-1">{t("tv.tmNetwork")}: {item.network}</p>}
                        {item.genres.length > 0 && <p className="text-[10px] text-muted-foreground mb-1.5">{item.genres.slice(0,3).join(" · ")}</p>}
                        {item.description && <p className="text-[10px] text-muted-foreground line-clamp-2 mb-2">{item.description}</p>}
                        <button
                          onClick={() => !isImported && importSeries.mutate(item)}
                          disabled={isImported || isImporting}
                          className={cn(
                            "w-full flex items-center justify-center gap-1 text-[11px] font-bold py-1.5 rounded-lg transition-colors",
                            isImported
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                              : "bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
                          )}
                        >
                          {isImported ? (
                            <><Check size={10} /> {t("tv.tmImportedSeries")}</>
                          ) : isImporting ? "…" : (
                            <><Download size={10} /> {t("tv.tmImportSeries")}</>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
              <Globe size={10} />
              <span>Powered by <a href="https://www.tvmaze.com" target="_blank" rel="noopener" className="underline hover:text-foreground">TVMaze</a> · French language filter — Gratis</span>
            </div>
          </>)}

          {/* ════ ANIME — Jikan/MyAnimeList (no API key) ════ */}
          {importSubTab === "anime" && (<>
            <div className="rounded-xl bg-pink-50 dark:bg-pink-950/20 border border-pink-200 dark:border-pink-800/40 p-3 flex gap-2">
              <span className="text-lg flex-shrink-0">🎌</span>
              <div>
                <p className="text-xs font-semibold text-pink-800 dark:text-pink-300">Anime — MyAnimeList · Gratis</p>
                <p className="text-[11px] text-pink-700 dark:text-pink-400 mt-0.5">
                  Enpòte seri anime popilè — enpòte kòm seri epi ajoute episòd apre
                </p>
              </div>
            </div>

            {/* Genre filter */}
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => { setAnimeGenre(""); searchAnime(); }}
                className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors",
                  animeGenre === "" ? "bg-pink-600 text-white border-pink-600" : "border-border text-muted-foreground hover:border-pink-400")}
              >All</button>
              {ANIME_GENRES.map(g => (
                <button key={g.value}
                  onClick={() => { setAnimeGenre(g.value); setAnimeQuery(""); setTimeout(() => searchAnime(), 0); }}
                  className={cn("text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-colors",
                    animeGenre === g.value ? "bg-pink-600 text-white border-pink-600" : "border-border text-muted-foreground hover:border-pink-400")}
                >{g.label}</button>
              ))}
            </div>

            <form onSubmit={searchAnime} className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={animeQuery}
                  onChange={e => setAnimeQuery(e.target.value)}
                  placeholder="Rechèche… ex: Naruto, Attack on Titan, One Piece"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-pink-500/40"
                />
              </div>
              <button type="submit" disabled={animeLoading}
                className="px-4 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-60 flex-shrink-0">
                {animeLoading ? "…" : t("tv.importSearch")}
              </button>
            </form>

            {animeLoading && (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex gap-3 rounded-xl border border-border p-3 animate-pulse">
                    <div className="w-14 h-20 bg-muted rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3.5 bg-muted rounded w-3/4" />
                      <div className="h-2.5 bg-muted rounded w-1/2" />
                      <div className="h-7 bg-muted rounded-lg w-full mt-3" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!animeLoading && animeResults.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <Tv size={40} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t("tv.importNoResults")}</p>
              </div>
            )}

            {!animeLoading && animeResults.length > 0 && (
              <div className="space-y-3">
                {animeResults.map(item => {
                  const isImported  = importedSeriesIds.has(item.identifier);
                  const isImporting = importSeries.isPending && (importSeries.variables as TVMazeResult | undefined)?.identifier === item.identifier;
                  return (
                    <div key={item.identifier} className="flex gap-3 rounded-xl border border-border bg-card hover:border-pink-400/40 transition-colors p-3">
                      <div className="w-14 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                        {item.thumbnailUrl ? (
                          <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><Tv size={20} className="text-muted-foreground" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <p className="font-semibold text-sm truncate">{item.title}</p>
                          {item.year && <span className="text-[10px] text-muted-foreground flex-shrink-0">{item.year}</span>}
                          {item.status && item.status !== "Finished Airing" && (
                            <span className="text-[9px] bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">{item.status}</span>
                          )}
                        </div>
                        {item.network && <p className="text-[10px] text-muted-foreground mb-1">Studio: {item.network}</p>}
                        {item.genres.length > 0 && <p className="text-[10px] text-muted-foreground mb-1.5">{item.genres.slice(0,3).join(" · ")}</p>}
                        {item.description && <p className="text-[10px] text-muted-foreground line-clamp-2 mb-2">{item.description}</p>}
                        <button
                          onClick={() => !isImported && importSeries.mutate(item)}
                          disabled={isImported || isImporting}
                          className={cn(
                            "w-full flex items-center justify-center gap-1 text-[11px] font-bold py-1.5 rounded-lg transition-colors",
                            isImported
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                              : "bg-pink-600 hover:bg-pink-700 text-white disabled:opacity-60"
                          )}
                        >
                          {isImported ? (<><Check size={10} /> {t("tv.tmImportedSeries")}</>) : isImporting ? "…" : (<><Download size={10} /> {t("tv.tmImportSeries")}</>)}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
              <Globe size={10} />
              <span>Powered by <a href="https://jikan.moe" target="_blank" rel="noopener" className="underline hover:text-foreground">Jikan</a> · MyAnimeList unofficial API — 100% Gratis</span>
            </div>
          </>)}

          {/* ════ SÉRIES EN — TVMaze popular English series ════ */}
          {importSubTab === "seriesen" && (<>
            <div className="rounded-xl bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800/40 p-3 flex gap-2">
              <span className="text-lg flex-shrink-0">📺</span>
              <div>
                <p className="text-xs font-semibold text-sky-800 dark:text-sky-300">Séries Angle — TVMaze · Gratis</p>
                <p className="text-[11px] text-sky-700 dark:text-sky-400 mt-0.5">
                  Breaking Bad, Stranger Things, Game of Thrones, The Office ak plis — enpòte kòm seri
                </p>
              </div>
            </div>

            <form onSubmit={searchSeriesEN} className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={srenQuery}
                  onChange={e => setSrenQuery(e.target.value)}
                  placeholder="Rechèche… ex: Breaking Bad, Stranger Things, CSI"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                />
              </div>
              <button type="submit" disabled={srenLoading}
                className="px-4 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-60 flex-shrink-0">
                {srenLoading ? "…" : t("tv.importSearch")}
              </button>
            </form>

            {srenLoading && (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex gap-3 rounded-xl border border-border p-3 animate-pulse">
                    <div className="w-14 h-20 bg-muted rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3.5 bg-muted rounded w-3/4" />
                      <div className="h-2.5 bg-muted rounded w-1/2" />
                      <div className="h-7 bg-muted rounded-lg w-full mt-3" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!srenLoading && srenResults.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <Tv size={40} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t("tv.importNoResults")}</p>
              </div>
            )}

            {!srenLoading && srenResults.length > 0 && (
              <div className="space-y-3">
                {srenResults.map(item => {
                  const isImported  = importedSeriesIds.has(item.identifier);
                  const isImporting = importSeries.isPending && (importSeries.variables as TVMazeResult | undefined)?.identifier === item.identifier;
                  return (
                    <div key={item.identifier} className="flex gap-3 rounded-xl border border-border bg-card hover:border-sky-400/40 transition-colors p-3">
                      <div className="w-14 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                        {item.thumbnailUrl ? (
                          <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><Tv size={20} className="text-muted-foreground" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <p className="font-semibold text-sm truncate">{item.title}</p>
                          {item.year && <span className="text-[10px] text-muted-foreground flex-shrink-0">{item.year}</span>}
                          {item.status && item.status !== "Ended" && (
                            <span className="text-[9px] bg-sky-100 dark:bg-sky-900/30 text-sky-700 dark:text-sky-400 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">{item.status}</span>
                          )}
                        </div>
                        {item.network && <p className="text-[10px] text-muted-foreground mb-1">{t("tv.tmNetwork")}: {item.network}</p>}
                        {item.genres.length > 0 && <p className="text-[10px] text-muted-foreground mb-1.5">{item.genres.slice(0,3).join(" · ")}</p>}
                        {item.description && <p className="text-[10px] text-muted-foreground line-clamp-2 mb-2">{item.description}</p>}
                        <button
                          onClick={() => !isImported && importSeries.mutate(item)}
                          disabled={isImported || isImporting}
                          className={cn(
                            "w-full flex items-center justify-center gap-1 text-[11px] font-bold py-1.5 rounded-lg transition-colors",
                            isImported
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                              : "bg-sky-600 hover:bg-sky-700 text-white disabled:opacity-60"
                          )}
                        >
                          {isImported ? (<><Check size={10} /> {t("tv.tmImportedSeries")}</>) : isImporting ? "…" : (<><Download size={10} /> {t("tv.tmImportSeries")}</>)}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
              <Globe size={10} />
              <span>Powered by <a href="https://www.tvmaze.com" target="_blank" rel="noopener" className="underline hover:text-foreground">TVMaze</a> · English series — Gratis</span>
            </div>
          </>)}

          {/* ════ TV ARCHIVE — Archive.org TV shows ════ */}
          {importSubTab === "tvarchi" && (<>
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 p-3 flex gap-2">
              <span className="text-lg flex-shrink-0">📡</span>
              <div>
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-300">TV Archive — Archive.org · Gratis</p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400 mt-0.5">
                  Emisyon televizyon klasik — episòd konplè gratis sou Archive.org
                </p>
              </div>
            </div>

            {tvaTotal !== null && (
              <p className="text-[11px] text-muted-foreground">{tvaTotal.toLocaleString()} rezilta</p>
            )}

            <form onSubmit={searchTVArchi} className="flex gap-2">
              <div className="flex-1 relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  value={tvaQuery}
                  onChange={e => setTvaQuery(e.target.value)}
                  placeholder="Rechèche… ex: Twilight Zone, Star Trek, I Love Lucy"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-border bg-muted/50 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                />
              </div>
              <button type="submit" disabled={tvaLoading}
                className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-sm font-bold transition-colors disabled:opacity-60 flex-shrink-0">
                {tvaLoading ? "…" : t("tv.importSearch")}
              </button>
            </form>

            {tvaLoading && (
              <div className="space-y-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex gap-3 rounded-xl border border-border p-3 animate-pulse">
                    <div className="w-14 h-20 bg-muted rounded-lg flex-shrink-0" />
                    <div className="flex-1 space-y-2 py-1">
                      <div className="h-3.5 bg-muted rounded w-3/4" />
                      <div className="h-2.5 bg-muted rounded w-1/2" />
                      <div className="h-7 bg-muted rounded-lg w-full mt-3" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {!tvaLoading && tvaResults.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <Tv size={40} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">{t("tv.importNoResults")}</p>
              </div>
            )}

            {!tvaLoading && tvaResults.length > 0 && (
              <div className="space-y-3">
                {tvaResults.map(item => {
                  const isImported  = importedIds.has(item.identifier);
                  const isImporting = importProgram.isPending && (importProgram.variables as ArchiveResult | undefined)?.identifier === item.identifier;
                  return (
                    <div key={item.identifier} className="flex gap-3 rounded-xl border border-border bg-card hover:border-amber-400/40 transition-colors p-3">
                      <div className="w-14 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-muted">
                        {item.thumbnailUrl ? (
                          <img src={item.thumbnailUrl} alt={item.title} className="w-full h-full object-cover" onError={e => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center"><Tv size={20} className="text-muted-foreground" /></div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                          <p className="font-semibold text-sm truncate">{item.title}</p>
                          {item.year && <span className="text-[10px] text-muted-foreground flex-shrink-0">{item.year}</span>}
                        </div>
                        {item.creator && <p className="text-[10px] text-muted-foreground mb-1">{item.creator}</p>}
                        {item.subjects.length > 0 && <p className="text-[10px] text-muted-foreground mb-1.5">{item.subjects.slice(0,3).join(" · ")}</p>}
                        {item.description && <p className="text-[10px] text-muted-foreground line-clamp-2 mb-2">{item.description}</p>}
                        <button
                          onClick={() => !isImported && importProgram.mutate(item)}
                          disabled={isImported || isImporting}
                          className={cn(
                            "w-full flex items-center justify-center gap-1 text-[11px] font-bold py-1.5 rounded-lg transition-colors",
                            isImported
                              ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                              : "bg-amber-600 hover:bg-amber-700 text-white disabled:opacity-60"
                          )}
                        >
                          {isImported ? (<><Check size={10} /> {t("tv.importAdded")}</>) : isImporting ? "…" : (<><Download size={10} /> {t("tv.importAdd")}</>)}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
              <Globe size={10} />
              <span>Powered by <a href="https://archive.org" target="_blank" rel="noopener" className="underline hover:text-foreground">Archive.org</a> · TV collections — 100% Gratis &amp; Legal</span>
            </div>
          </>)}
        </div>
      )}

      {/* Series modal (kept — it's short and fits on screen) */}
      {editSeries !== null && (
        <SeriesModal
          series={editSeries === "new" ? null : editSeries}
          onClose={() => setEditSeries(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["/admin/tv/series"] })}
        />
      )}
    </div>
  );
}
