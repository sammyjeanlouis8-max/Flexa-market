/**
 * AdminTVProgramForm — Full-page add / edit form for TV programs.
 * Replaces the old bottom-sheet modal so all fields + the Save button
 * are always visible and scrollable without any height constraints.
 *
 * Routes:
 *   /admin/tv/programs/new
 *   /admin/tv/programs/:id/edit
 */
import { useState, useRef, useEffect } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Youtube, Save, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/hooks/use-toast";

// ── Types ─────────────────────────────────────────────────────────────────────
type TvSeries = { id: number; title: string };

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

const EMPTY: ProgramForm = {
  title: "", description: "", type: "film", videoUrl: "", videoKey: "",
  thumbnailUrl: "", durationMinutes: "", scheduledAt: "",
  seriesId: "", episodeNumber: "", seasonNumber: "1",
  isActive: true, isFeatured: false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function apiAuth(path: string, opts: RequestInit = {}) {
  const tk = localStorage.getItem("flexamarket_token");
  return fetch(path, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(tk ? { Authorization: `Bearer ${tk}` } : {}),
      ...opts.headers,
    },
  });
}

const inputCls =
  "w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/50";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function AdminTVProgramForm() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const programId = params.id ? Number(params.id) : null;
  const isEditing = programId !== null;

  const qc = useQueryClient();
  const [form, setForm] = useState<ProgramForm>(EMPTY);
  const [loading, setLoading] = useState(isEditing);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof ProgramForm, v: any) => setForm(f => ({ ...f, [k]: v }));

  // Load existing program when editing
  useEffect(() => {
    if (!isEditing) return;
    apiAuth(`/api/admin/tv/programs/${programId}`)
      .then(r => r.json())
      .then(d => {
        const p = d.program ?? d;
        if (!p?.id) return;
        setForm({
          title: p.title ?? "",
          description: p.description ?? "",
          type: p.type ?? "film",
          videoUrl: p.videoUrl ?? "",
          videoKey: p.videoKey ?? "",
          thumbnailUrl: p.thumbnailUrl ?? "",
          durationMinutes: p.durationMinutes?.toString() ?? "",
          scheduledAt: p.scheduledAt ? new Date(p.scheduledAt).toISOString().slice(0, 16) : "",
          seriesId: p.seriesId?.toString() ?? "",
          episodeNumber: p.episodeNumber?.toString() ?? "",
          seasonNumber: p.seasonNumber?.toString() ?? "1",
          isActive: p.isActive ?? true,
          isFeatured: p.isFeatured ?? false,
        });
      })
      .catch(() => toast({ title: "Pa kapab chaje pwogram nan", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [programId]); // eslint-disable-line

  // Series list for the series type
  const { data: series } = useQuery<TvSeries[]>({
    queryKey: ["/admin/tv/series"],
    queryFn: () => apiAuth("/api/admin/tv/series").then(r => r.json()).then(d => d.series ?? []),
  });

  // ── Upload ─────────────────────────────────────────────────────────────────
  async function uploadVideo(file: File) {
    setUploading(true);
    setUploadProgress(0);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const fd = new FormData();
      fd.append("video", file);
      const result = await new Promise<{ videoKey: string; videoUrl: string }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () =>
          xhr.status >= 200 && xhr.status < 300
            ? resolve(JSON.parse(xhr.responseText))
            : reject(new Error(`HTTP ${xhr.status}`));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.open("POST", "/api/admin/tv/upload-video");
        if (tk) xhr.setRequestHeader("Authorization", `Bearer ${tk}`);
        xhr.send(fd);
      });
      set("videoKey", result.videoKey);
      set("videoUrl", result.videoUrl);
      toast({ title: "Videyo telechaje ✅" });
    } catch {
      toast({ title: "Erè nan telechajman", variant: "destructive" });
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  // ── Save ───────────────────────────────────────────────────────────────────
  async function save() {
    if (!form.title.trim()) {
      toast({ title: t("tv.titleRequired"), variant: "destructive" });
      return;
    }
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
    const url = isEditing ? `/api/admin/tv/programs/${programId}` : "/api/admin/tv/programs";
    const method = isEditing ? "PUT" : "POST";
    try {
      const r = await apiAuth(url, { method, body: JSON.stringify(body) });
      if (r.ok) {
        toast({ title: t("tv.savedProgram") });
        // Force-refresh the programs list even though staleTime=3min
        await qc.invalidateQueries({ queryKey: ["/admin/tv/programs"] });
        setLocation("/admin/tv");
      } else {
        const d = await r.json().catch(() => ({}));
        toast({ title: d.error ?? "Erè", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erè rezo", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-4 pb-6">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setLocation("/admin/tv")}
          className="p-2 rounded-xl hover:bg-muted transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold">
            {isEditing ? t("tv.editProgram") : t("tv.addProgram")}
          </h1>
          <p className="text-xs text-muted-foreground">Flexa TV</p>
        </div>
      </div>

      {/* ── Form ── */}
      <div className="space-y-5">
        <Field label={`${t("tv.fieldTitle")} *`}>
          <input
            className={inputCls}
            value={form.title}
            onChange={e => set("title", e.target.value)}
            placeholder={t("tv.fieldTitle")}
            autoFocus
          />
        </Field>

        <Field label={t("tv.fieldDescription")}>
          <textarea
            className={inputCls}
            rows={3}
            value={form.description}
            onChange={e => set("description", e.target.value)}
            placeholder="Deskripsyon opsyonèl…"
          />
        </Field>

        <Field label={t("tv.fieldType")}>
          <select
            className={inputCls}
            value={form.type}
            onChange={e => set("type", e.target.value)}
          >
            <option value="live">🔴 Live (transmisyon dirèk)</option>
            <option value="film">{t("tv.typeFilm")}</option>
            <option value="series">{t("tv.typeSeries")}</option>
            <option value="program">{t("tv.typeProgram")}</option>
            <option value="news">{t("tv.typeNews")}</option>
          </select>
        </Field>

        {/* YouTube / Live guide */}
        {form.type === "live" && (
          <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-4 space-y-1.5">
            <p className="text-sm font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
              <Youtube size={16} /> {t("tv.streamGuideTitle")}
            </p>
            {["streamGuideStep1","streamGuideStep2","streamGuideStep3","streamGuideStep4","streamGuideStep5"].map(k => (
              <p key={k} className="text-xs text-red-600 dark:text-red-400">{t(`tv.${k}`)}</p>
            ))}
          </div>
        )}

        <Field label={t("tv.fieldVideoUrl")}>
          <input
            className={inputCls}
            value={form.videoUrl}
            onChange={e => { set("videoUrl", e.target.value); set("videoKey", ""); }}
            placeholder="https://youtu.be/..."
          />
        </Field>

        {/* Direct video upload */}
        <div className="rounded-xl border border-dashed border-violet-400 dark:border-violet-700 bg-violet-50/50 dark:bg-violet-950/20 p-4">
          <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 mb-3">
            📁 Oswa Telechaje Videyo Dirèk
          </p>
          {form.videoKey ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 text-xs text-green-600 dark:text-green-400 font-medium truncate">
                ✅ Videyo telechaje
              </div>
              <button
                type="button"
                onClick={() => { set("videoKey", ""); set("videoUrl", ""); }}
                className="text-xs text-red-500 hover:underline"
              >
                Retire
              </button>
            </div>
          ) : uploading ? (
            <div className="space-y-2">
              <div className="w-full bg-muted rounded-full h-2.5">
                <div
                  className="bg-violet-500 h-2.5 rounded-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground text-center">{uploadProgress}%</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors"
            >
              📤 Chwazi Fichye Videyo (.mp4, .mov...)
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadVideo(f); e.target.value = ""; }}
          />
          <p className="text-[10px] text-muted-foreground mt-2">
            Videyo telechaje joue san kontwòl — pafè pou transmisyon linèyè
          </p>
        </div>

        <Field label={t("tv.fieldThumbnail")}>
          <input
            className={inputCls}
            value={form.thumbnailUrl}
            onChange={e => set("thumbnailUrl", e.target.value)}
            placeholder="https://..."
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("tv.fieldDuration")}>
            <input
              type="number"
              className={inputCls}
              value={form.durationMinutes}
              onChange={e => set("durationMinutes", e.target.value)}
              placeholder="90"
              min={1}
            />
          </Field>
          <Field label={t("tv.fieldScheduledAt")}>
            <input
              type="datetime-local"
              className={inputCls}
              value={form.scheduledAt}
              onChange={e => set("scheduledAt", e.target.value)}
            />
          </Field>
        </div>

        {/* Series-specific fields */}
        {form.type === "series" && (
          <>
            <Field label={t("tv.fieldSeries")}>
              <select
                className={inputCls}
                value={form.seriesId}
                onChange={e => set("seriesId", e.target.value)}
              >
                <option value="">{t("tv.chooseSeries")}</option>
                {(series ?? []).map(s => (
                  <option key={s.id} value={s.id}>{s.title}</option>
                ))}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t("tv.fieldSeason")}>
                <input
                  type="number"
                  className={inputCls}
                  value={form.seasonNumber}
                  onChange={e => set("seasonNumber", e.target.value)}
                  min={1}
                />
              </Field>
              <Field label={t("tv.fieldEpisode")}>
                <input
                  type="number"
                  className={inputCls}
                  value={form.episodeNumber}
                  onChange={e => set("episodeNumber", e.target.value)}
                  min={1}
                />
              </Field>
            </div>
          </>
        )}

        {/* Toggles */}
        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => set("isActive", e.target.checked)}
              className="w-4 h-4 accent-violet-500"
            />
            {t("tv.fieldActive")}
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
            <input
              type="checkbox"
              checked={form.isFeatured}
              onChange={e => set("isFeatured", e.target.checked)}
              className="w-4 h-4 accent-violet-500"
            />
            ⭐ {t("tv.fieldFeatured")}
          </label>
        </div>
      </div>

      {/* ── Save / Cancel — inline at bottom of form ── */}
      <div className="flex gap-3 mt-8 mb-6">
        <button
          onClick={() => setLocation("/admin/tv")}
          className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
        >
          {t("tv.cancel")}
        </button>
        <button
          onClick={save}
          disabled={saving || uploading}
          className="flex-1 py-3 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? (
            <><Loader2 size={16} className="animate-spin" /> {t("tv.saving")}</>
          ) : (
            <><Save size={16} /> {t("tv.save")}</>
          )}
        </button>
      </div>
    </div>
  );
}
