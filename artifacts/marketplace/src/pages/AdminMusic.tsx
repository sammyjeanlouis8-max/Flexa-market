import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Music2, Plus, Pencil, Trash2, Upload, Star, Eye, EyeOff, Loader2, X, Check } from "lucide-react";
import { useLocation } from "wouter";

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
  is_active: boolean;
  is_featured: boolean;
  play_count: number;
  created_at: string;
};

const GENRES = ["Kompa","Rap","Zouk","R&B","Gospel","Reggaeton","Pop","Trap","Afrobeats","Latin","Klasik","Lòt"];
const TYPES  = ["free","premium","exclusive"];

const fmtDur = (s: number | null) => {
  if (!s) return "—";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const adminFetch = async (url: string, method = "GET", body?: Record<string, unknown>) => {
  const opts: RequestInit = { method, credentials: "include" };
  if (body) { opts.headers = { "Content-Type": "application/json" }; opts.body = JSON.stringify(body); }
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
};

// ── Track Form ────────────────────────────────────────────────────────────────
function TrackForm({ track, onSave, onCancel }: {
  track?: Track | null;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title:       track?.title       ?? "",
    artist:      track?.artist      ?? "",
    album:       track?.album       ?? "",
    genre:       track?.genre       ?? "",
    audio_url:   track?.audio_url   ?? "",
    cover_url:   track?.cover_url   ?? "",
    duration_seconds: track?.duration_seconds ? String(track.duration_seconds) : "",
    type:        track?.type        ?? "free",
    is_featured: track?.is_featured ?? false,
    is_active:   track?.is_active   ?? true,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (!form.title.trim()) { setErr("Titre obligatwa"); return; }
    if (!form.artist.trim()) { setErr("Atis obligatwa"); return; }
    setSaving(true);
    try {
      const payload = {
        ...form,
        duration_seconds: form.duration_seconds ? Number(form.duration_seconds) : undefined,
      };
      if (track) {
        await adminFetch(`/api/admin/music/${track.id}`, "PUT", payload as Record<string, unknown>);
      } else {
        await adminFetch("/api/admin/music", "POST", payload as Record<string, unknown>);
      }
      onSave();
    } catch (e: any) {
      setErr(e.message ?? "Erè");
    } finally {
      setSaving(false);
    }
  };

  const inp = "w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-violet-500/40 transition";
  const lbl = "block text-xs font-semibold text-muted-foreground mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {err && <p className="text-red-500 text-sm bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">{err}</p>}

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={lbl}>Titre *</label>
          <input className={inp} value={form.title} onChange={e => set("title", e.target.value)} placeholder="Non chante..." required />
        </div>
        <div>
          <label className={lbl}>Atis *</label>
          <input className={inp} value={form.artist} onChange={e => set("artist", e.target.value)} placeholder="Non atis..." required />
        </div>
        <div>
          <label className={lbl}>Album</label>
          <input className={inp} value={form.album} onChange={e => set("album", e.target.value)} placeholder="Non album..." />
        </div>

        <div>
          <label className={lbl}>Jen</label>
          <select className={inp} value={form.genre} onChange={e => set("genre", e.target.value)}>
            <option value="">— Chwazi —</option>
            {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>Tip</label>
          <select className={inp} value={form.type} onChange={e => set("type", e.target.value)}>
            {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        <div>
          <label className={lbl}>Dire (segonn)</label>
          <input type="number" className={inp} value={form.duration_seconds} onChange={e => set("duration_seconds", e.target.value)} placeholder="240" min={0} />
        </div>
      </div>

      <div>
        <label className={lbl}>URL Odyo (MP3 / stream link)</label>
        <input className={inp} value={form.audio_url} onChange={e => set("audio_url", e.target.value)} placeholder="https://... oswa /api/storage/objects/..." />
      </div>
      <div>
        <label className={lbl}>URL Kouvèti (pochette)</label>
        <input className={inp} value={form.cover_url} onChange={e => set("cover_url", e.target.value)} placeholder="https://..." />
      </div>

      <div className="flex items-center gap-4 pt-1">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_featured} onChange={e => set("is_featured", e.target.checked)} className="rounded" />
          <span className="text-sm font-medium">⭐ Featured</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_active} onChange={e => set("is_active", e.target.checked)} className="rounded" />
          <span className="text-sm font-medium">Aktif</span>
        </label>
      </div>

      <div className="flex gap-3 pt-2">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors">
          Anile
        </button>
        <button type="submit" disabled={saving}
          className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50">
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          {track ? "Modifye" : "Ajoute"}
        </button>
      </div>
    </form>
  );
}

// ── Main Admin Music Page ─────────────────────────────────────────────────────
export default function AdminMusic() {
  const [, setLocation] = useLocation();
  const [tracks, setTracks]     = useState<Track[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing]   = useState<Track | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [search, setSearch]     = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const d = await adminFetch("/api/admin/music");
      setTracks(d.tracks ?? []);
    } catch { setTracks([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Efase chante sa?")) return;
    setDeleting(id);
    try {
      await adminFetch(`/api/admin/music/${id}`, "DELETE");
      setTracks(prev => prev.filter(t => t.id !== id));
    } catch { alert("Erè efasaj"); }
    finally { setDeleting(null); }
  };

  const handleToggle = async (track: Track) => {
    try {
      await adminFetch(`/api/admin/music/${track.id}`, "PUT", { is_active: !track.is_active });
      setTracks(prev => prev.map(t => t.id === track.id ? { ...t, is_active: !t.is_active } : t));
    } catch { alert("Erè"); }
  };

  const openEdit = (track: Track) => { setEditing(track); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditing(null); };
  const afterSave = () => { closeForm(); load(); };

  const filtered = tracks.filter(t =>
    !search || t.title.toLowerCase().includes(search.toLowerCase()) ||
    t.artist.toLowerCase().includes(search.toLowerCase())
  );

  const typeColor: Record<string, string> = {
    free:      "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
    premium:   "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    exclusive: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300",
  };

  return (
    <div className="max-w-3xl mx-auto px-3 py-4 pb-24">

      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button onClick={() => setLocation("/admin")}
          className="w-9 h-9 rounded-full hover:bg-muted flex items-center justify-center transition-colors">
          <ArrowLeft size={18} />
        </button>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-fuchsia-700 flex items-center justify-center shadow shadow-violet-200 dark:shadow-violet-900">
          <Music2 size={20} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="font-black text-xl">Flexa Music</h1>
          <p className="text-xs text-muted-foreground">Jere tout mizik yo — {tracks.length} chante</p>
        </div>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-1.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors shadow">
          <Plus size={16} /> Ajoute
        </button>
      </div>

      {/* Add / Edit form */}
      {showForm && (
        <div className="mb-6 bg-card border border-border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-base">{editing ? "Modifye chante" : "Ajoute yon chante"}</h2>
            <button onClick={closeForm} className="text-muted-foreground hover:text-foreground">
              <X size={18} />
            </button>
          </div>
          <TrackForm track={editing} onSave={afterSave} onCancel={closeForm} />
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Chèche chante oswa atis..."
          className="w-full border border-border rounded-xl pl-4 pr-10 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-violet-500/40 transition"
        />
        {search && (
          <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            <X size={14} />
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="text-center py-16">
          <Loader2 size={28} className="animate-spin text-violet-500 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Chajman...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl">
          <Music2 size={32} className="text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-sm text-muted-foreground">{search ? "Pa gen rezilta" : "Pa gen chante ankò"}</p>
          {!search && (
            <button onClick={() => setShowForm(true)}
              className="mt-3 text-xs text-violet-500 font-semibold">
              + Ajoute premye chante a
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(track => (
            <div key={track.id}
              className={`flex items-center gap-3 p-3 rounded-2xl border transition-all ${track.is_active ? "border-border bg-card" : "border-border/50 bg-muted/40 opacity-60"}`}>

              {/* Cover */}
              <div className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center">
                {track.cover_url
                  ? <img src={track.cover_url} alt={track.title} className="w-full h-full object-cover" />
                  : <Music2 size={18} className="text-white/70" />}
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="font-bold text-sm truncate">{track.title}</p>
                  {track.is_featured && <Star size={11} className="text-amber-500 fill-amber-500 shrink-0" />}
                </div>
                <p className="text-xs text-muted-foreground truncate">{track.artist}{track.album ? ` · ${track.album}` : ""}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  {track.genre && <span className="text-[9px] bg-muted px-1.5 py-0.5 rounded-full">{track.genre}</span>}
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold ${typeColor[track.type] ?? ""}`}>{track.type}</span>
                  <span className="text-[10px] text-muted-foreground">{fmtDur(track.duration_seconds)}</span>
                  <span className="text-[10px] text-muted-foreground">▶ {track.play_count}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handleToggle(track)}
                  className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
                  title={track.is_active ? "Dezaktive" : "Aktive"}>
                  {track.is_active ? <Eye size={14} /> : <EyeOff size={14} className="text-muted-foreground" />}
                </button>
                <button onClick={() => openEdit(track)}
                  className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors">
                  <Pencil size={13} />
                </button>
                <button onClick={() => handleDelete(track.id)} disabled={deleting === track.id}
                  className="w-8 h-8 rounded-full hover:bg-red-50 dark:hover:bg-red-950/30 text-red-500 flex items-center justify-center transition-colors disabled:opacity-40">
                  {deleting === track.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
