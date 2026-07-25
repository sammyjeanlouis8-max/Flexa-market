import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Tv, Plus, Pencil, Trash2, Film, List, Radio, Clock, Calendar, Star, Eye, X, Check, ChevronDown } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

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
  title: "", description: "", type: "film", videoUrl: "", thumbnailUrl: "",
  durationMinutes: "", scheduledAt: "", seriesId: "", episodeNumber: "", seasonNumber: "1",
  isActive: true, isFeatured: false,
};

const EMPTY_SERIES: SeriesForm = { title: "", description: "", thumbnailUrl: "", isActive: true };

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
  const { toast } = useToast();
  const [form, setForm] = useState<ProgramForm>(
    program
      ? {
          title: program.title,
          description: program.description ?? "",
          type: program.type,
          videoUrl: program.videoUrl ?? "",
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

  const set = (k: keyof ProgramForm, v: any) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.title.trim()) { toast({ title: "Titre obligatwa", variant: "destructive" }); return; }
    setSaving(true);
    const body: any = {
      title: form.title.trim(),
      description: form.description || null,
      type: form.type,
      videoUrl: form.videoUrl || null,
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
      toast({ title: program ? "Pwogram mize ajou ✅" : "Pwogram kreye ✅" });
      onSaved();
      onClose();
    } else {
      const d = await r.json().catch(() => ({}));
      toast({ title: d.error ?? "Erè", variant: "destructive" });
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div className="bg-background rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-background border-b border-border px-5 py-4 flex items-center justify-between">
          <h2 className="font-bold text-base">{program ? "Modifye Pwogram" : "Ajoute Pwogram"}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Titre *">
            <input className={inputCls} value={form.title} onChange={e => set("title", e.target.value)} placeholder="Non pwogram nan" />
          </Field>
          <Field label="Deskripsyon">
            <textarea className={inputCls} rows={2} value={form.description} onChange={e => set("description", e.target.value)} placeholder="Kout deskripsyon..." />
          </Field>
          <Field label="Kalite">
            <select className={inputCls} value={form.type} onChange={e => set("type", e.target.value)}>
              <option value="film">🎬 Film</option>
              <option value="series">📺 Episòd Seri</option>
              <option value="program">📡 Program</option>
              <option value="news">📰 Nouvèl</option>
            </select>
          </Field>
          <Field label="URL Videyo (YouTube / Vimeo)">
            <input className={inputCls} value={form.videoUrl} onChange={e => set("videoUrl", e.target.value)} placeholder="https://youtu.be/..." />
          </Field>
          <Field label="URL Imaj Miniati (thumbnail)">
            <input className={inputCls} value={form.thumbnailUrl} onChange={e => set("thumbnailUrl", e.target.value)} placeholder="https://..." />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dire (minit)">
              <input type="number" className={inputCls} value={form.durationMinutes} onChange={e => set("durationMinutes", e.target.value)} placeholder="90" min={1} />
            </Field>
            <Field label="Dat / Lè Difizyon">
              <input type="datetime-local" className={inputCls} value={form.scheduledAt} onChange={e => set("scheduledAt", e.target.value)} />
            </Field>
          </div>
          {form.type === "series" && (
            <>
              <Field label="Seri">
                <select className={inputCls} value={form.seriesId} onChange={e => set("seriesId", e.target.value)}>
                  <option value="">— Chwazi seri —</option>
                  {series.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sezon">
                  <input type="number" className={inputCls} value={form.seasonNumber} onChange={e => set("seasonNumber", e.target.value)} min={1} />
                </Field>
                <Field label="Episòd">
                  <input type="number" className={inputCls} value={form.episodeNumber} onChange={e => set("episodeNumber", e.target.value)} min={1} />
                </Field>
              </div>
            </>
          )}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.isActive} onChange={e => set("isActive", e.target.checked)} className="accent-violet-500" />
              Aktif (vizib)
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input type="checkbox" checked={form.isFeatured} onChange={e => set("isFeatured", e.target.checked)} className="accent-violet-500" />
              ⭐ Vedèt
            </label>
          </div>
        </div>
        <div className="sticky bottom-0 bg-background border-t border-border px-5 py-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted transition-colors">Anile</button>
          <button
            onClick={save}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors disabled:opacity-50"
          >
            {saving ? "Anrejist..." : "Anrejistre"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Series Modal ──────────────────────────────────────────────────────────────
function SeriesModal({ series, onClose, onSaved }: { series: TvSeries | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState<SeriesForm>(
    series ? { title: series.title, description: series.description ?? "", thumbnailUrl: series.thumbnailUrl ?? "", isActive: series.isActive }
           : EMPTY_SERIES
  );
  const [saving, setSaving] = useState(false);
  const set = (k: keyof SeriesForm, v: any) => setForm(f => ({ ...f, [k]: v }));

  async function save() {
    if (!form.title.trim()) { toast({ title: "Titre obligatwa", variant: "destructive" }); return; }
    setSaving(true);
    const url = series ? `/api/admin/tv/series/${series.id}` : "/api/admin/tv/series";
    const method = series ? "PUT" : "POST";
    const r = await apiAuth(url, { method, body: JSON.stringify({ ...form, description: form.description || null, thumbnailUrl: form.thumbnailUrl || null }) });
    setSaving(false);
    if (r.ok) {
      toast({ title: series ? "Seri mize ajou ✅" : "Seri kreye ✅" });
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
          <h2 className="font-bold text-base">{series ? "Modifye Seri" : "Nouvo Seri"}</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4">
          <Field label="Non Seri *">
            <input className={inputCls} value={form.title} onChange={e => set("title", e.target.value)} placeholder="Tit seri a" />
          </Field>
          <Field label="Deskripsyon">
            <textarea className={inputCls} rows={2} value={form.description} onChange={e => set("description", e.target.value)} />
          </Field>
          <Field label="URL Imaj Kouvèti">
            <input className={inputCls} value={form.thumbnailUrl} onChange={e => set("thumbnailUrl", e.target.value)} placeholder="https://..." />
          </Field>
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={form.isActive} onChange={e => set("isActive", e.target.checked)} className="accent-violet-500" />
            Aktif
          </label>
        </div>
        <div className="border-t border-border px-5 py-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-medium hover:bg-muted">Anile</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-50">
            {saving ? "Anrejist..." : "Anrejistre"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Admin TV Page ────────────────────────────────────────────────────────
export default function AdminTV() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tab, setTab] = useState<"programs" | "series">("programs");
  const [editProgram, setEditProgram] = useState<TvProgram | null | "new">(null);
  const [editSeries, setEditSeries] = useState<TvSeries | null | "new">(null);

  // Access check
  if (!user?.isAdmin && !user?.isSuperAdmin) {
    setLocation("/");
    return null;
  }

  const { data: programs, isLoading: loadingP } = useQuery<TvProgram[]>({
    queryKey: ["/admin/tv/programs"],
    queryFn: () => apiAuth("/api/admin/tv/programs").then(r => r.json()).then(d => d.programs ?? []),
  });

  const { data: series, isLoading: loadingS } = useQuery<TvSeries[]>({
    queryKey: ["/admin/tv/series"],
    queryFn: () => apiAuth("/api/admin/tv/series").then(r => r.json()).then(d => d.series ?? []),
  });

  const deleteProgram = useMutation({
    mutationFn: (id: number) => apiAuth(`/api/admin/tv/programs/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/tv/programs"] }); toast({ title: "Efase ✅" }); },
  });

  const deleteSeries = useMutation({
    mutationFn: (id: number) => apiAuth(`/api/admin/tv/series/${id}`, { method: "DELETE" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/admin/tv/series"] }); toast({ title: "Efase ✅" }); },
  });

  function confirmDelete(label: string, onConfirm: () => void) {
    if (window.confirm(`Efase "${label}" ? Aksyon sa pa ka defèt.`)) onConfirm();
  }

  return (
    <div className="max-w-4xl mx-auto px-3 py-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-500/30">
            <Tv size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Jere Flexa TV</h1>
            <p className="text-xs text-muted-foreground">Admin panel — pwogram, film, seri, orè</p>
          </div>
        </div>
        <button
          onClick={() => setLocation("/tv")}
          className="text-xs text-violet-500 hover:underline"
        >
          Wè TV →
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { icon: Film, label: "Total Pwogram", value: programs?.length ?? "—" },
          { icon: List, label: "Seri", value: series?.length ?? "—" },
          { icon: Eye, label: "Vye Total", value: programs ? programs.reduce((s, p) => s + p.viewCount, 0).toLocaleString() : "—" },
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
          { key: "programs", label: "📡 Pwogram & Films" },
          { key: "series",   label: "📺 Seri" },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key as any)}
            className={cn("flex-1 py-2 rounded-lg text-sm font-medium transition-all", tab === t.key ? "bg-background shadow-sm text-foreground" : "text-muted-foreground")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Programs Tab */}
      {tab === "programs" && (
        <>
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-muted-foreground">{programs?.length ?? 0} pwogram</p>
            <button
              onClick={() => setEditProgram("new")}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl text-sm font-bold transition-colors"
            >
              <Plus size={16} /> Ajoute Pwogram
            </button>
          </div>

          {loadingP ? (
            <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}</div>
          ) : !programs?.length ? (
            <div className="text-center py-16 text-muted-foreground">
              <Film size={48} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Pa gen pwogram ankò</p>
              <p className="text-sm">Klike "Ajoute Pwogram" pou kòmanse</p>
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
                      {p.isFeatured && <Star size={12} className="text-yellow-500 flex-shrink-0" />}
                      {!p.isActive && <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">Kache</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{typeLabel(p.type)}{p.seriesTitle ? ` · ${p.seriesTitle}` : ""}</p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                      {p.durationMinutes && <span className="flex items-center gap-1"><Clock size={10} /> {p.durationMinutes}min</span>}
                      {p.scheduledAt && <span className="flex items-center gap-1"><Calendar size={10} /> {formatDateTime(p.scheduledAt)}</span>}
                      <span className="flex items-center gap-1"><Eye size={10} /> {p.viewCount}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      onClick={() => setEditProgram(p)}
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
              <Plus size={16} /> Ajoute Seri
            </button>
          </div>

          {loadingS ? (
            <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-muted animate-pulse rounded-xl" />)}</div>
          ) : !series?.length ? (
            <div className="text-center py-16 text-muted-foreground">
              <List size={48} className="mx-auto mb-3 opacity-30" />
              <p className="font-medium">Pa gen seri ankò</p>
            </div>
          ) : (
            <div className="space-y-2">
              {series.map(s => {
                const eps = programs?.filter(p => p.seriesId === s.id).length ?? 0;
                return (
                  <div key={s.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card hover:border-violet-500/30 transition-colors">
                    {s.thumbnailUrl ? (
                      <img src={s.thumbnailUrl} alt={s.title} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <List size={18} className="text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm">{s.title}</p>
                      <p className="text-xs text-muted-foreground">{eps} episòd{!s.isActive ? " · Kache" : ""}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button onClick={() => setEditSeries(s)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground">
                        <Pencil size={15} />
                      </button>
                      <button onClick={() => confirmDelete(s.title, () => deleteSeries.mutate(s.id))} className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {editProgram !== null && (
        <ProgramModal
          program={editProgram === "new" ? null : editProgram}
          series={series ?? []}
          onClose={() => setEditProgram(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["/admin/tv/programs"] })}
        />
      )}
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
