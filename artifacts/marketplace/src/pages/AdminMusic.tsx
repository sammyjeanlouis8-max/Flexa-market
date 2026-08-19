/**
 * AdminMusic — Professional Flexa Music Management Dashboard
 * Tabs: Dashboard · Songs · Add Song · Import · Stats · Playlists · Artists · Monetization · Copyright · Storage
 */
import { useState, useEffect, useRef, useCallback } from "react";
import {
  ArrowLeft, Music2, Plus, Pencil, Trash2, Eye, EyeOff,
  Loader2, X, Check, Star, BarChart2, DollarSign, TrendingUp,
  RefreshCw, Users, Upload, Download, Shield, HardDrive,
  ListMusic, Mic2, Tag, Search, Filter, Globe, Zap,
  ChevronDown, CheckSquare, Square, AlertCircle, Copy,
  BadgeCheck, Clock, Play, Heart,
} from "lucide-react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ── Types ─────────────────────────────────────────────────────────────────────
type Track = {
  id: number; title: string; artist: string; album: string | null;
  genre: string | null; audio_url: string | null; cover_url: string | null;
  duration_seconds: number | null; type: string; monetization_type: string;
  price_usd: number | null; license: string | null; copyright_status: string;
  tags: string | null; is_active: boolean; is_featured: boolean;
  is_artist_verified: boolean; play_count: number; valid_impressions: number;
  download_count: number; artist_user_id: number | null; artist_name: string | null;
  stats_impressions: number; stats_estimated: number; stats_confirmed: number;
  sales_count: number;
  created_at: string;
};
type PlatformStats = {
  total_tracks: number; total_valid_impressions: number; total_paid_out: string;
  total_estimated: string;
};
type DailyStats = { date: string; impressions: number; paid_out: number };
type Playlist = {
  id: number; title: string; description: string | null; cover_url: string | null;
  is_featured: boolean; is_trending: boolean; track_count: number; created_at: string;
};
type Artist = {
  name: string; user_id: number | null; user_name: string | null; is_verified: boolean;
  track_count: number; total_plays: number; total_downloads: number; total_revenue: number;
};
type StorageStats = {
  track_count: number; pending_count: number; total_duration: number;
  avg_duration: number; estimated_storage_bytes: number;
  audio_bytes: number; cover_bytes: number;
};

// ── Constants ─────────────────────────────────────────────────────────────────
const GENRES = ["Kompa","Rap","Zouk","R&B","Gospel","Reggaeton","Pop","Trap","Afrobeats","Latin","Klasik","Lòt"];
const MONETIZATION_TYPES = ["free","premium","paid_download","streaming_only","subscription_only"];
const COPYRIGHT_STATUSES = ["verified","creative_commons","public_domain","dmca","copyright_claim"];
const PIE_COLORS = ["#7c3aed","#c026d3","#10b981","#f59e0b","#3b82f6","#ef4444","#06b6d4","#84cc16"];

const TAB_ICONS: Record<string, React.ElementType> = {
  dashboard: BarChart2, songs: Music2, add: Plus, import: Download,
  stats: TrendingUp, playlists: ListMusic, artists: Mic2,
  monetization: DollarSign, copyright: Shield, storage: HardDrive,
};
const TABS: TabId[] = ["dashboard","songs","add","import","stats","playlists","artists","monetization","copyright","storage"];
type TabId = "dashboard"|"songs"|"add"|"import"|"stats"|"playlists"|"artists"|"monetization"|"copyright"|"storage";

// ── Helpers ───────────────────────────────────────────────────────────────────
const fmtDur = (s: number | null) => !s ? "—" : `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;
const fmt$   = (n: number)  => `$${Number(n).toFixed(2)}`;
const fmtN   = (n: number)  => n>=1e6?`${(n/1e6).toFixed(1)}M`:n>=1000?`${(n/1000).toFixed(1)}k`:String(n);
const fmtBytes=(b:number)=>{if(b<1024)return`${b}B`;if(b<1024**2)return`${(b/1024).toFixed(1)}KB`;if(b<1024**3)return`${(b/1024**2).toFixed(1)}MB`;return`${(b/1024**3).toFixed(2)}GB`};

async function adminFetch(url: string, method = "GET", body?: Record<string, unknown>) {
  const token = localStorage.getItem("flexamarket_token");
  const headers: Record<string, string> = { Authorization: `Bearer ${token ?? ""}` };
  if (body) headers["Content-Type"] = "application/json";
  const r = await fetch(url, { method, headers, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? r.statusText);
  return r.json();
}

// ── Loading skeleton ──────────────────────────────────────────────────────────
function Skeleton({ h = "h-4", w = "w-full", className = "" }: { h?: string; w?: string; className?: string }) {
  return <div className={`${h} ${w} rounded-lg bg-white/5 animate-pulse ${className}`} />;
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color, loading }:
  { icon: React.ElementType; label: string; value: string; sub?: string; color: string; loading?: boolean }) {
  return (
    <div className="rounded-2xl p-4 flex items-start gap-3"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }}>
      <div className={`w-10 h-10 rounded-xl ${color} flex items-center justify-center shrink-0 shadow-lg`}>
        <Icon size={18} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        {loading ? <><Skeleton h="h-5" w="w-20" className="mb-1" /><Skeleton h="h-3" w="w-28" /></> : (
          <>
            <p className="font-black text-lg leading-tight">{value}</p>
            <p className="text-xs opacity-50 truncate">{label}</p>
            {sub && <p className="text-[10px] text-violet-400 mt-0.5">{sub}</p>}
          </>
        )}
      </div>
    </div>
  );
}

// ── Cover thumbnail ───────────────────────────────────────────────────────────
function Cover({ src, title, size=40 }: { src?: string|null; title?: string; size?: number }) {
  return (
    <div className="shrink-0 rounded-lg overflow-hidden flex items-center justify-center"
      style={{ width: size, height: size, background: "linear-gradient(135deg,#4c1d95,#7c3aed)" }}>
      {src ? <img src={src} alt={title} className="w-full h-full object-cover" /> : <Music2 size={size*0.4} className="text-white/40" />}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function Badge({ label, color }: { label: string; color: string }) {
  return <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${color}`}>{label}</span>;
}

// ── Type / monetization colors ────────────────────────────────────────────────
const typeColor: Record<string,string> = {
  free:              "bg-emerald-500/20 text-emerald-400",
  premium:           "bg-amber-500/20 text-amber-400",
  exclusive:         "bg-violet-500/20 text-violet-400",
  paid_download:     "bg-blue-500/20 text-blue-400",
  streaming_only:    "bg-cyan-500/20 text-cyan-400",
  subscription_only: "bg-fuchsia-500/20 text-fuchsia-400",
};
const copyrightColor: Record<string,string> = {
  verified:         "bg-emerald-500/20 text-emerald-400",
  creative_commons: "bg-blue-500/20 text-blue-400",
  public_domain:    "bg-teal-500/20 text-teal-400",
  dmca:             "bg-red-500/20 text-red-400",
  copyright_claim:  "bg-orange-500/20 text-orange-400",
};

// ── Inline select ─────────────────────────────────────────────────────────────
function Sel({ value, options, onChange, placeholder }: { value: string; options: string[]; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="text-[10px] font-bold rounded-lg px-2 py-1 outline-none appearance-none cursor-pointer"
      style={{ background: "#2a2a3a", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" }}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Dashboard
// ══════════════════════════════════════════════════════════════════════════════
function DashboardTab({ tracks, platform, storage, daily, loading }:
  { tracks: Track[]; platform: PlatformStats|null; storage: StorageStats|null; daily: DailyStats[]; loading: boolean }) {
  const { t } = useTranslation();
  const pending  = tracks.filter(t => !t.is_active).length;
  const artists  = new Set(tracks.map(t => t.artist)).size;
  const albums   = new Set(tracks.map(t => t.album).filter(Boolean)).size;
  const totalRev = platform ? Number(platform.total_paid_out) : 0;
  const totalDl  = tracks.reduce((s,t) => s + (t.download_count||0), 0);
  const totalPlays = tracks.reduce((s,t) => s + (t.play_count||0), 0);

  const cards = [
    { icon: Music2,     label: t("adminMusic.totalSongsLabel"), value: fmtN(platform?.total_tracks ?? tracks.length), color: "bg-violet-600" },
    { icon: Mic2,       label: t("adminMusic.artistsLabel"),    value: fmtN(artists),                                color: "bg-fuchsia-600" },
    { icon: ListMusic,  label: t("adminMusic.albumsLabel"),     value: fmtN(albums),                                 color: "bg-blue-600" },
    { icon: Play,       label: t("adminMusic.totalPlays"),      value: fmtN(totalPlays),                             color: "bg-emerald-600" },
    { icon: Download,   label: "Downloads",                     value: fmtN(totalDl),                                color: "bg-cyan-600" },
    { icon: DollarSign, label: t("music.confirmedRevenue"),     value: fmt$(totalRev),                               color: "bg-amber-600" },
    { icon: Clock,      label: t("adminMusic.pendingSongs"),    value: fmtN(pending),                                color: "bg-orange-600" },
    { icon: HardDrive,  label: t("adminMusic.estimatedStorage"),value: storage ? fmtBytes(storage.estimated_storage_bytes) : "—", color: "bg-pink-600" },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3">
        {cards.map(c => <StatCard key={c.label} icon={c.icon} label={c.label} value={c.value} color={c.color} loading={loading} />)}
      </div>
      {/* Mini charts */}
      {daily.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-sm font-bold mb-3">{t("adminMusic.impressionsLast30")}</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={[...daily].reverse()} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#888" }} tickFormatter={d => d.slice(5)} />
              <YAxis tick={{ fontSize: 9, fill: "#888" }} />
              <Tooltip contentStyle={{ background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 11 }} />
              <Line type="monotone" dataKey="impressions" stroke="#7c3aed" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {/* Top 5 tracks */}
      {tracks.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-sm font-bold mb-3">{t("adminMusic.top5Songs")}</p>
          <div className="space-y-2">
            {[...tracks].sort((a,b) => b.play_count-a.play_count).slice(0,5).map((t,i) => (
              <div key={t.id} className="flex items-center gap-3">
                <span className="text-xs font-black opacity-30 w-4">#{i+1}</span>
                <Cover src={t.cover_url} title={t.title} size={32} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{t.title}</p>
                  <p className="text-[10px] opacity-50">{t.artist}</p>
                </div>
                <span className="text-xs font-bold text-violet-400">{fmtN(t.play_count)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Song Management
// ══════════════════════════════════════════════════════════════════════════════
function SongsTab({ tracks, onEdit, onRefresh, loading }:
  { tracks: Track[]; onEdit: (t: Track) => void; onRefresh: () => void; loading: boolean }) {
  const { t } = useTranslation();
  const [search,    setSearch]    = useState("");
  const [genreF,    setGenreF]    = useState("");
  const [statusF,   setStatusF]   = useState("");
  const [selected,  setSelected]  = useState<Set<number>>(new Set());
  const [bulking,   setBulking]   = useState(false);
  const [deleting,  setDeleting]  = useState<number|null>(null);
  const [page,      setPage]      = useState(0);
  const PAGE = 20;

  const filtered = tracks.filter(t => {
    if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !t.artist.toLowerCase().includes(search.toLowerCase())) return false;
    if (genreF  && t.genre !== genreF) return false;
    if (statusF === "active"  && !t.is_active) return false;
    if (statusF === "pending" && t.is_active)  return false;
    return true;
  });
  const paged = filtered.slice(page*PAGE, (page+1)*PAGE);
  const totalPages = Math.ceil(filtered.length/PAGE);

  const toggleSelect = (id: number) => setSelected(s => { const n = new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
  const toggleAll    = () => setSelected(s => s.size===paged.length ? new Set() : new Set(paged.map(t=>t.id)));

  const bulkAction = async (action: string) => {
    if (!selected.size) return;
    if (action==="delete" && !confirm(t("adminMusic.confirmBulkDelete", { count: selected.size }))) return;
    setBulking(true);
    try {
      await adminFetch("/api/admin/music/bulk-action","POST",{ action, ids:[...selected] });
      setSelected(new Set()); onRefresh();
    } catch { alert(t("adminMusic.err")); }
    finally { setBulking(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm(t("adminMusic.confirmDelete"))) return;
    setDeleting(id);
    try { await adminFetch(`/api/admin/music/${id}`,"DELETE"); onRefresh(); }
    catch { alert(t("adminMusic.errDelete")); }
    finally { setDeleting(null); }
  };

  const handleToggle = async (trk: Track) => {
    try { await adminFetch(`/api/admin/music/${trk.id}`,"PUT",{is_active:!trk.is_active}); onRefresh(); }
    catch { alert(t("adminMusic.err")); }
  };

  const handleFeature = async (trk: Track) => {
    try { await adminFetch(`/api/admin/music/${trk.id}`,"PUT",{is_featured:!trk.is_featured}); onRefresh(); }
    catch { alert(t("adminMusic.err")); }
  };

  const handleDuplicate = async (trk: Track) => {
    try {
      await adminFetch("/api/admin/music","POST",{
        title: trk.title+" (Copy)", artist:trk.artist, album:trk.album||undefined,
        genre:trk.genre||undefined, audio_url:trk.audio_url||undefined, cover_url:trk.cover_url||undefined,
        duration_seconds:trk.duration_seconds||undefined, type:trk.type, is_featured:false,
      });
      onRefresh();
    } catch { alert(t("adminMusic.errDuplicate")); }
  };

  const genres = [...new Set(tracks.map(t=>t.genre).filter(Boolean))] as string[];

  return (
    <div>
      {/* Filters */}
      <div className="flex gap-2 mb-3 flex-wrap">
        <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2 min-w-[160px]"
          style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.08)" }}>
          <Search size={13} className="text-white/40 shrink-0" />
          <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}}
            placeholder={t("adminMusic.search")+"…"} className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none" />
          {search && <button onClick={()=>setSearch("")}><X size={12} className="text-white/30" /></button>}
        </div>
        <Sel value={genreF}  options={genres} onChange={v=>{setGenreF(v);setPage(0)}}  placeholder={t("adminMusic.genre")} />
        <Sel value={statusF} options={["active","pending"]} onChange={v=>{setStatusF(v);setPage(0)}} placeholder={t("adminMusic.status")} />
        {(search||genreF||statusF) && (
          <button onClick={()=>{setSearch("");setGenreF("");setStatusF("");setPage(0)}}
            className="text-[10px] text-violet-400 font-bold px-2">
            {t("adminMusic.clearFilters")}
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 mb-3 rounded-xl px-3 py-2"
          style={{ background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)" }}>
          <span className="text-xs font-bold text-violet-400">{t("adminMusic.selected", { count: selected.size })}</span>
          <div className="flex-1" />
          {bulking ? <Loader2 size={14} className="animate-spin text-violet-400" /> : (
            <>
              <button onClick={()=>bulkAction("approve")}  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-emerald-500/20 text-emerald-400">{t("adminMusic.approve")}</button>
              <button onClick={()=>bulkAction("reject")}   className="text-[10px] font-bold px-2 py-1 rounded-lg bg-orange-500/20 text-orange-400">{t("adminMusic.reject")}</button>
              <button onClick={()=>bulkAction("feature")}  className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-500/20 text-amber-400">{t("adminMusic.featured")}</button>
              <button onClick={()=>bulkAction("delete")}   className="text-[10px] font-bold px-2 py-1 rounded-lg bg-red-500/20 text-red-400">{t("adminMusic.delete")}</button>
            </>
          )}
          <button onClick={()=>setSelected(new Set())} className="text-white/30"><X size={14} /></button>
        </div>
      )}

      {/* Count */}
      <p className="text-xs opacity-40 mb-2">{search||genreF||statusF ? t("adminMusic.songCountFiltered", { count: filtered.length }) : t("adminMusic.songCount", { count: filtered.length })}</p>

      {loading ? (
        <div className="space-y-2">
          {[...Array(6)].map((_,i) => <Skeleton key={i} h="h-16" />)}
        </div>
      ) : paged.length === 0 ? (
        <div className="text-center py-16 opacity-30">
          <Music2 size={32} className="mx-auto mb-2" />
          <p className="text-sm">{search||genreF||statusF ? "Pa gen rezilta" : "Pa gen chante"}</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
          {/* Table header */}
          <div className="grid grid-cols-[24px_40px_1fr_auto] gap-2 items-center px-3 py-2 text-[9px] font-bold uppercase tracking-wider opacity-40"
            style={{ background: "rgba(255,255,255,0.03)" }}>
            <button onClick={toggleAll} className="flex items-center justify-center">
              {selected.size===paged.length && paged.length>0 ? <CheckSquare size={13} className="text-violet-400" /> : <Square size={13} />}
            </button>
            <span />
            <span>{t("adminMusic.colSong")}</span>
            <span>{t("adminMusic.colAction")}</span>
          </div>
          {/* Rows */}
          <div className="divide-y" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
            {paged.map(track => (
              <div key={track.id} className={`grid grid-cols-[24px_40px_1fr_auto] gap-2 items-center px-3 py-2.5 transition-colors hover:bg-white/[0.02] ${!track.is_active?"opacity-60":""}`}>
                {/* Checkbox */}
                <button onClick={()=>toggleSelect(track.id)} className="flex items-center justify-center">
                  {selected.has(track.id) ? <CheckSquare size={13} className="text-violet-400" /> : <Square size={13} className="text-white/20" />}
                </button>
                {/* Cover */}
                <Cover src={track.cover_url} title={track.title} size={36} />
                {/* Info */}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold truncate max-w-[140px]">{track.title}</span>
                    {track.is_featured && <Star size={9} className="text-amber-400 fill-amber-400 shrink-0" />}
                    {!track.is_active && <Badge label={t("adminMusic.pending")} color="bg-orange-500/20 text-orange-400" />}
                  </div>
                  <p className="text-[10px] opacity-50 truncate">{track.artist}{track.album?` · ${track.album}`:""}</p>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    {track.genre && <Badge label={track.genre} color="bg-white/5 text-white/50" />}
                    <Badge label={track.monetization_type||track.type} color={typeColor[track.monetization_type]||typeColor[track.type]||"bg-white/5 text-white/50"} />
                    <Badge label={track.copyright_status} color={copyrightColor[track.copyright_status]||"bg-white/5 text-white/50"} />
                    <span className="text-[9px] opacity-30">{fmtDur(track.duration_seconds)}</span>
                    <span className="text-[9px] opacity-30">{fmtN(track.play_count)} {t("adminMusic.plays")}</span>
                    {(track.sales_count > 0) && (
                      <span className="text-[9px] font-semibold text-emerald-400">{track.sales_count} vann</span>
                    )}
                  </div>
                </div>
                {/* Actions */}
                <div className="flex items-center gap-0.5">
                  <button onClick={()=>handleToggle(track)} title={track.is_active?t("adminMusic.hide"):t("adminMusic.show")}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors">
                    {track.is_active ? <Eye size={13} className="text-emerald-400" /> : <EyeOff size={13} className="text-white/30" />}
                  </button>
                  <button onClick={()=>handleFeature(track)} title={track.is_featured?"Unfeature":"Feature"}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors">
                    <Star size={13} className={track.is_featured?"text-amber-400 fill-amber-400":"text-white/20"} />
                  </button>
                  <button onClick={()=>onEdit(track)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors">
                    <Pencil size={12} className="text-violet-400" />
                  </button>
                  <button onClick={()=>handleDuplicate(track)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10 transition-colors">
                    <Copy size={11} className="text-white/30" />
                  </button>
                  <button onClick={()=>handleDelete(track.id)} disabled={deleting===track.id}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-500/10 transition-colors">
                    {deleting===track.id ? <Loader2 size={11} className="animate-spin text-red-400" /> : <Trash2 size={11} className="text-red-400" />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={page===0}
            className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-30"
            style={{ background:"rgba(255,255,255,0.08)" }}>{t("adminMusic.prevPage")}</button>
          <span className="text-xs opacity-40">{page+1} / {totalPages}</span>
          <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={page===totalPages-1}
            className="text-xs px-3 py-1.5 rounded-lg disabled:opacity-30"
            style={{ background:"rgba(255,255,255,0.08)" }}>{t("adminMusic.nextPage")}</button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Add / Edit Song
// ══════════════════════════════════════════════════════════════════════════════
function AddSongTab({ track, onSave, onCancel }: { track?: Track|null; onSave: ()=>void; onCancel: ()=>void }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    title:            track?.title ?? "",
    artist:           track?.artist ?? "",
    album:            track?.album ?? "",
    genre:            track?.genre ?? "",
    type:             track?.type ?? "free",
    monetization_type: track?.monetization_type ?? "free",
    price_usd:        track?.price_usd ? String(track.price_usd) : "",
    license:          track?.license ?? "",
    copyright_status: track?.copyright_status ?? "verified",
    tags:             track?.tags ?? "",
    duration_seconds: track?.duration_seconds ? String(track.duration_seconds) : "",
    audio_url:        track?.audio_url ?? "",
    cover_url:        track?.cover_url ?? "",
    is_featured:      track?.is_featured ?? false,
    is_active:        track?.is_active ?? true,
    artist_user_id:   track?.artist_user_id ? String(track.artist_user_id) : "",
  });

  const [audioFile,  setAudioFile]  = useState<File|null>(null);
  const [coverFile,  setCoverFile]  = useState<File|null>(null);
  const [audioPreview, setAudioPreview] = useState<string|null>(null);
  const [coverPreview, setCoverPreview] = useState<string|null>(track?.cover_url||null);
  const [progress,   setProgress]   = useState(0);
  const [uploading,  setUploading]  = useState(false);
  const [err,        setErr]        = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  const set = (k: string, v: unknown) => setForm(f => ({ ...f, [k]: v }));

  const onAudioPick = (file: File) => {
    setAudioFile(file);
    const url = URL.createObjectURL(file);
    setAudioPreview(url);
    // Auto-detect duration
    const a = new Audio(url);
    a.onloadedmetadata = () => set("duration_seconds", String(Math.round(a.duration)));
  };
  const onCoverPick = (file: File) => {
    setCoverFile(file);
    const url = URL.createObjectURL(file);
    setCoverPreview(url);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(""); setProgress(0);
    if (!form.title.trim())  { setErr(t("adminMusic.errTitleRequired")); return; }
    if (!form.artist.trim()) { setErr(t("adminMusic.errArtistRequired")); return; }
    setUploading(true);
    try {
      const _tok = localStorage.getItem("flexamarket_token");
      const authH = _tok ? { Authorization: `Bearer ${_tok}` } : {} as Record<string,string>;

      // ── Editing existing track: use old multipart PUT (no file size concerns) ──
      if (track) {
        const fd = new FormData();
        Object.entries(form).forEach(([k,v]) => { if (v !== "" && v !== undefined) fd.append(k, String(v)); });
        if (audioFile) fd.append("audio", audioFile);
        if (coverFile) fd.append("cover", coverFile);
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.onprogress = e => { if (e.lengthComputable) setProgress(Math.round(e.loaded/e.total*100)); };
          xhr.onload  = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(); else { try { reject(new Error(JSON.parse(xhr.responseText).error)); } catch { reject(new Error(xhr.statusText)); } } };
          xhr.onerror = () => reject(new Error(t("adminMusic.connEchwe")));
          xhr.open("PUT", `/api/admin/music/${track.id}`);
          if (_tok) xhr.setRequestHeader("Authorization", `Bearer ${_tok}`);
          xhr.send(fd);
        });
        onSave();
        return;
      }

      // ── New track: Wasabi proxy upload ────────────────────────────────────
      if (!audioFile) { setErr(t("adminMusic.errAudioRequired") || "Audio file required"); return; }
      setProgress(5);
      const sigRes = await fetch("/api/music/upload-signature", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authH },
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
      const audioResult = await new Promise<{storageKey:string;url:string}>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", sig.audio.uploadUrl);
        xhr.setRequestHeader("Content-Type", audioFile.type || "audio/mpeg");
        if (authH.Authorization) xhr.setRequestHeader("Authorization", authH.Authorization);
        xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setProgress(10 + Math.round((ev.loaded/ev.total)*75)); };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText) as { url: string };
            const storageKey = new URL(data.url, location.origin).searchParams.get("key") ?? "";
            resolve({ storageKey, url: data.url });
          } else { let msg = "Upload " + xhr.status; try { msg = (JSON.parse(xhr.responseText) as {error?:string}).error ?? msg; } catch {/***/} reject(new Error(msg)); }
        };
        xhr.onerror = () => reject(new Error(t("adminMusic.connEchwe")));
        xhr.send(audioFile);
      });
      setProgress(85);
      let coverResult: {storageKey:string;url:string}|null = null;
      if (coverFile && sig.cover?.uploadUrl) {
        try {
          const cd = await new Promise<{storageKey:string;url:string}>((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", sig.cover.uploadUrl);
            xhr.setRequestHeader("Content-Type", coverFile.type || "image/jpeg");
            if (authH.Authorization) xhr.setRequestHeader("Authorization", authH.Authorization);
            xhr.onload = () => {
              if (xhr.status >= 200 && xhr.status < 300) {
                const data = JSON.parse(xhr.responseText) as { url: string };
                const storageKey = new URL(data.url, location.origin).searchParams.get("key") ?? "";
                resolve({ storageKey, url: data.url });
              } else { reject(new Error("Cover " + xhr.status)); }
            };
            xhr.onerror = () => reject(new Error("Cover upload failed"));
            xhr.send(coverFile);
          });
          coverResult = cd;
        } catch { /* non-fatal */ }
      }
      setProgress(95);
      const regRes = await fetch("/api/music/register", {
        method: "POST", headers: { "Content-Type": "application/json", ...authH },
        body: JSON.stringify({
          title: form.title, artist: form.artist,
          album: form.album || "", genre: form.genre || "", type: form.type || "free",
          storageKey: audioResult.storageKey, audioUrl: audioResult.url,
          coverStorageKey: coverResult?.storageKey ?? null, coverUrl: coverResult?.url ?? null,
        }),
      });
      if (!regRes.ok) { const d = await regRes.json().catch(()=>({})); throw new Error(d.error ?? "Register failed"); }
      setProgress(100);

      onSave();
    } catch (e: any) { setErr(e.message ?? t("adminMusic.err")); }
    finally { setUploading(false); }
  };

  const inp = "w-full rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500/40 transition";
  const inpStyle = { background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#e2e8f0" };
  const lbl = "block text-xs font-bold opacity-60 mb-1";

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-6">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-black text-base">{track ? t("adminMusic.editSong") : t("adminMusic.addSong")}</h2>
        {track && <button type="button" onClick={onCancel} className="text-xs opacity-40 hover:opacity-70">{t("adminMusic.cancel")}</button>}
      </div>

      {err && (
        <div className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm" style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)" }}>
          <AlertCircle size={14} className="text-red-400 shrink-0" /> <span className="text-red-400">{err}</span>
        </div>
      )}

      {/* Audio upload */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(124,58,237,0.4)" }}>
        <label className="block text-sm font-bold text-violet-400">{t("adminMusic.audioFileLabel")}</label>
        <label className="flex flex-col items-center justify-center gap-2 py-4 rounded-xl cursor-pointer hover:bg-white/5 transition-colors"
          style={{ border: "1px dashed rgba(255,255,255,0.1)" }}>
          <Upload size={24} className="text-violet-400" />
          <span className="text-xs opacity-50">{audioFile ? audioFile.name : t("adminMusic.chooseFile")}</span>
          <span className="text-[10px] opacity-30">{t("adminMusic.orPasteUrl")}</span>
          <input type="file" accept="audio/*" className="hidden" onChange={e => e.target.files?.[0] && onAudioPick(e.target.files[0])} />
        </label>
        {audioPreview && (
          <audio ref={audioRef} src={audioPreview} controls className="w-full h-8 rounded-lg" style={{ filter: "invert(0.85) hue-rotate(230deg)" }} />
        )}
        <div>
          <label className={lbl}>{t("adminMusic.audioUrlLabel")}</label>
          <input className={inp} style={inpStyle} value={form.audio_url} onChange={e=>set("audio_url",e.target.value)} placeholder="https://…/audio.mp3" />
        </div>
      </div>

      {/* Cover upload */}
      <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(255,255,255,0.03)", border: "1px dashed rgba(192,38,211,0.4)" }}>
        <label className="block text-sm font-bold text-fuchsia-400">{t("adminMusic.coverLabel")}</label>
        <div className="flex items-center gap-3">
          {coverPreview && <img src={coverPreview} alt="cover" className="w-16 h-16 rounded-xl object-cover" />}
          <label className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl cursor-pointer hover:bg-white/5 transition-colors"
            style={{ border: "1px dashed rgba(255,255,255,0.1)" }}>
            <Upload size={16} className="text-fuchsia-400" />
            <span className="text-xs opacity-50">{coverFile ? coverFile.name : t("adminMusic.chooseImage")}</span>
            <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && onCoverPick(e.target.files[0])} />
          </label>
        </div>
        <div>
          <label className={lbl}>{t("adminMusic.coverUrlLabel")}</label>
          <input className={inp} style={inpStyle} value={form.cover_url} onChange={e=>set("cover_url",e.target.value)} placeholder="https://…/cover.jpg" />
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={lbl}>{t("adminMusic.titleLabel")}</label>
          <input className={inp} style={inpStyle} value={form.title} onChange={e=>set("title",e.target.value)} placeholder={t("upload.trackTitlePlaceholder")} required />
        </div>
        <div>
          <label className={lbl}>{t("adminMusic.artistLabel")}</label>
          <input className={inp} style={inpStyle} value={form.artist} onChange={e=>set("artist",e.target.value)} required />
        </div>
        <div>
          <label className={lbl}>{t("adminMusic.albumLabel")}</label>
          <input className={inp} style={inpStyle} value={form.album} onChange={e=>set("album",e.target.value)} />
        </div>
        <div>
          <label className={lbl}>{t("adminMusic.genreLabel")}</label>
          <select className={inp} style={inpStyle} value={form.genre} onChange={e=>set("genre",e.target.value)}>
            <option value="">— {t("upload.genreSelect")} —</option>
            {GENRES.map(g=><option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>{t("adminMusic.durationLabel")}</label>
          <input type="number" className={inp} style={inpStyle} value={form.duration_seconds} onChange={e=>set("duration_seconds",e.target.value)} placeholder="240" min={0} />
        </div>
        <div>
          <label className={lbl}>{t("adminMusic.monetizationLabel")}</label>
          <select className={inp} style={inpStyle} value={form.monetization_type} onChange={e=>set("monetization_type",e.target.value)}>
            {MONETIZATION_TYPES.map(m=><option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className={lbl}>{t("adminMusic.priceLabel")}</label>
          <input type="number" className={inp} style={inpStyle} value={form.price_usd} onChange={e=>set("price_usd",e.target.value)} placeholder="0.00" min={0} step={0.01} />
        </div>
        <div>
          <label className={lbl}>{t("adminMusic.licenseLabel")}</label>
          <input className={inp} style={inpStyle} value={form.license} onChange={e=>set("license",e.target.value)} placeholder="CC BY 4.0…" />
        </div>
        <div>
          <label className={lbl}>{t("adminMusic.copyrightLabel")}</label>
          <select className={inp} style={inpStyle} value={form.copyright_status} onChange={e=>set("copyright_status",e.target.value)}>
            {COPYRIGHT_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className={lbl}>{t("adminMusic.tagsLabel")}</label>
          <input className={inp} style={inpStyle} value={form.tags} onChange={e=>set("tags",e.target.value)} placeholder="haitian, kompa, 2024…" />
        </div>
        <div>
          <label className={lbl}>{t("adminMusic.artistUserIdLabel")}</label>
          <input type="number" className={inp} style={inpStyle} value={form.artist_user_id} onChange={e=>set("artist_user_id",e.target.value)} placeholder="ID…" />
        </div>
      </div>

      {/* Toggles */}
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_featured} onChange={e=>set("is_featured",e.target.checked)} className="rounded accent-amber-400" />
          <span className="text-sm font-medium">⭐ Featured</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_active} onChange={e=>set("is_active",e.target.checked)} className="rounded accent-violet-400" />
          <span className="text-sm font-medium">Aktif</span>
        </label>
      </div>

      {/* Progress bar */}
      {uploading && (
        <div className="rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.08)" }}>
          <div className="h-2 bg-violet-600 transition-all duration-300 rounded-xl" style={{ width:`${progress}%` }} />
          <p className="text-center text-xs py-1.5 opacity-60">{progress}%</p>
        </div>
      )}

      <div className="flex gap-3">
        {track && (
          <button type="button" onClick={onCancel}
            className="flex-1 py-3 rounded-xl text-sm font-bold transition-colors"
            style={{ background:"rgba(255,255,255,0.08)", color:"#e2e8f0" }}>
            {t("adminMusic.cancel")}
          </button>
        )}
        <button type="submit" disabled={uploading}
          className="flex-1 py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          style={{ background:"linear-gradient(135deg,#7c3aed,#c026d3)", color:"#fff" }}>
          {uploading ? <><Loader2 size={14} className="animate-spin" /> {progress}%</> : <><Check size={14} /> {track ? t("adminMusic.save") : t("adminMusic.publish")}</>}
        </button>
      </div>
    </form>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Import Free Music
// ══════════════════════════════════════════════════════════════════════════════
const FREE_APIS = [
  {
    id: "jamendo", name: "Jamendo", icon: "🎸", live: true,
    descKey: "adminMusic.descJamendo",
    color: "from-emerald-900/40 to-emerald-800/20",
    border: "rgba(16,185,129,0.3)",
  },
  {
    id: "pixabay", name: "Pixabay Music", icon: "🎹", live: false,
    descKey: "adminMusic.descPixabay",
    color: "from-yellow-900/40 to-yellow-800/20",
    border: "rgba(234,179,8,0.3)",
  },
  {
    id: "fma", name: "Free Music Archive", icon: "📻", live: false,
    descKey: "adminMusic.descFma",
    color: "from-blue-900/40 to-blue-800/20",
    border: "rgba(59,130,246,0.3)",
  },
  {
    id: "archive", name: "Internet Archive", icon: "🏛️", live: false,
    descKey: "adminMusic.descArchive",
    color: "from-slate-900/40 to-slate-800/20",
    border: "rgba(100,116,139,0.3)",
  },
  {
    id: "ccmixter", name: "ccMixter", icon: "🎧", live: false,
    descKey: "adminMusic.descCcmixter",
    color: "from-purple-900/40 to-purple-800/20",
    border: "rgba(168,85,247,0.3)",
  },
];

type JamendoTrack = { id:number; name:string; artist_name:string; album_name:string; duration:number; audio:string; image:string; license_ccurl:string; tags:string };

function ImportTab({ onImportDone }: { onImportDone: () => void }) {
  const { t } = useTranslation();
  const [apiKeys,    setApiKeys]    = useState<Record<string,string>>({});
  const [connected,  setConnected]  = useState<Record<string,boolean>>({});
  const [searching,  setSearching]  = useState<Record<string,boolean>>({});
  const [testing,    setTesting]    = useState<Record<string,boolean>>({});
  const [testMsg,    setTestMsg]    = useState<Record<string,string>>({});
  const [connecting, setConnecting] = useState<Record<string,boolean>>({});
  const [results,    setResults]    = useState<Record<string,JamendoTrack[]>>({});
  const [query,      setQuery]      = useState("");
  const [importing,  setImporting]  = useState<Record<string|number,boolean>>({});
  const [imported,   setImported]   = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  // Load saved provider connection status on mount
  useEffect(() => {
    adminFetch("/api/admin/music/providers")
      .then(d => setConnected(d.connected ?? {}))
      .catch(() => {});
  }, []);

  const connectProvider = async (id: string) => {
    const key = apiKeys[id]?.trim();
    if (!key) { setTestMsg(m => ({...m, [id]: "❌ " + t("adminMusic.enterKeyFirst")})); return; }
    setConnecting(c => ({...c, [id]: true}));
    setTestMsg(m => ({...m, [id]: ""}));
    try {
      await adminFetch("/api/admin/music/providers/connect","POST",{ provider: id, apiKey: key });
      setConnected(c => ({...c, [id]: true}));
      setTestMsg(m => ({...m, [id]: t("adminMusic.keySaved")}));
      // Auto-test immediately after saving
      setTimeout(() => testProvider(id), 400);
    } catch (e:any) { setTestMsg(m => ({...m, [id]: "❌ " + (e.message || t("adminMusic.errConnect"))})); }
    finally { setConnecting(c => ({...c, [id]: false})); }
  };

  const disconnectProvider = async (id: string) => {
    if (!confirm(t("adminMusic.confirmRemoveKey"))) return;
    try {
      await adminFetch("/api/admin/music/providers/disconnect","POST",{ provider: id });
      setConnected(c => ({...c, [id]: false}));
      setApiKeys(k => ({...k, [id]: ""}));
      setTestMsg(m => ({...m, [id]: ""}));
    } catch (e:any) { alert(e.message || t("adminMusic.err")); }
  };

  const testProvider = async (id: string) => {
    setTesting(t => ({...t, [id]: true}));
    setTestMsg(m => ({...m, [id]: ""}));
    try {
      const d = await adminFetch("/api/admin/music/providers/test","POST",{ provider: id, apiKey: apiKeys[id] || "" });
      setTestMsg(m => ({...m, [id]: d.message ?? (d.ok ? t("adminMusic.testOk") : t("adminMusic.testFailed"))}));
    } catch (e:any) { setTestMsg(m => ({...m, [id]: "❌ " + (e.message || t("adminMusic.err"))})); }
    finally { setTesting(t => ({...t, [id]: false})); }
  };

  const searchProvider = async (id: string) => {
    setSearching(s => ({...s, [id]:true}));
    try {
      const q2 = query.trim() || "music";
      const endpoint = id === "jamendo"
        ? `/api/admin/music/jamendo/search?q=${encodeURIComponent(q2)}&limit=20`
        : `/api/admin/music/pixabay/search?q=${encodeURIComponent(q2)}&limit=20`;
      const d = await adminFetch(endpoint);
      setResults(rv => ({...rv, [id]: d.results ?? []}));
    } catch (e:any) { alert(e.message || t("adminMusic.errConnect")); }
    finally { setSearching(s => ({...s, [id]:false})); }
  };

  // Keep legacy alias
  const searchJamendo = () => searchProvider("jamendo");

  const importJamendo = async (trk: JamendoTrack) => {
    setImporting(m => ({...m, [trk.id]:true}));
    try {
      await adminFetch("/api/admin/music/import","POST",{
        title: trk.name, artist: trk.artist_name, album: trk.album_name||undefined,
        audio_url: trk.audio, cover_url: trk.image||undefined,
        duration_seconds: trk.duration ? String(trk.duration) : undefined,
        license: trk.license_ccurl||"creative_commons",
        tags: trk.tags||undefined, source: "jamendo",
      });
      setImported(s => new Set([...s, trk.id]));
      onImportDone();
    } catch (e:any) { alert(e.message || t("adminMusic.errImport")); }
    finally { setImporting(m => ({...m, [trk.id]:false})); }
  };

  const bulkImportJamendo = async (count: number) => {
    setBulkLoading(true);
    try {
      const d = await adminFetch("/api/admin/music/jamendo/bulk","POST",{ count });
      onImportDone();
      alert(d.skipped
        ? t("adminMusic.bulkSuccessSkipped", { count: d.imported, skipped: d.skipped })
        : t("adminMusic.bulkSuccess", { count: d.imported }));
    } catch (e:any) { alert(e.message || t("adminMusic.errBulkImport")); }
    finally { setBulkLoading(false); }
  };

  return (
    <div className="space-y-4">
      {/* Bulk import controls */}
      <div className="rounded-2xl p-4" style={{ background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.3)" }}>
        <p className="text-sm font-black text-violet-400 mb-3">{t("adminMusic.quickImport")}</p>
        <div className="flex gap-2 flex-wrap">
          {["100","500"].map(n => (
            <button key={n} onClick={() => { if(confirm(t("adminMusic.confirmBulkImport", { count: n }))) bulkImportJamendo(Number(n)); }}
              disabled={bulkLoading}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50 transition-all"
              style={{ background:"rgba(124,58,237,0.3)", border:"1px solid rgba(124,58,237,0.5)", color:"#c4b5fd" }}>
              {bulkLoading ? <Loader2 size={13} className="animate-spin" /> : <Zap size={13} />}
              {t("adminMusic.importN", { n })}
            </button>
          ))}
          <button onClick={() => { if(confirm(t("adminMusic.confirmImportAll"))) bulkImportJamendo(10000); }}
            disabled={bulkLoading}
            className="px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
            style={{ background:"rgba(192,38,211,0.3)", border:"1px solid rgba(192,38,211,0.5)", color:"#f0abfc" }}>
            {t("adminMusic.importAll")}
          </button>
        </div>
      </div>

      {/* Provider cards */}
      {FREE_APIS.map(api => {
        const isLive     = api.live || connected[api.id];
        const noKeyNeeded = api.id === "archive" || api.id === "ccmixter";
        const canSearch  = isLive && (api.id === "jamendo" || api.id === "pixabay");

        return (
        <div key={api.id} className={`rounded-2xl p-4 bg-gradient-to-br ${api.color}`}
          style={{ border: `1px solid ${api.border}` }}>
          <div className="flex items-start gap-3 mb-3">
            <span className="text-2xl">{api.icon}</span>
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-black text-sm">{api.name}</h3>
                <Badge
                  label={isLive ? t("adminMusic.active") : t("adminMusic.notAvailable")}
                  color={isLive ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/40"}
                />
                {connected[api.id] && !api.live && (
                  <button onClick={() => disconnectProvider(api.id)}
                    className="text-[10px] text-red-400 hover:text-red-300 underline">
                    {t("adminMusic.removeKey")}
                  </button>
                )}
              </div>
              <p className="text-[11px] opacity-60 mt-0.5">{t(api.descKey)}</p>
            </div>
          </div>

          {/* API key input row — shown if not live-built-in AND not yet connected */}
          {!api.live && !connected[api.id] && (
            <div className="space-y-2">
              {!noKeyNeeded && (
                <div className="flex gap-2">
                  <input
                    value={apiKeys[api.id]||""}
                    onChange={e=>setApiKeys(k=>({...k,[api.id]:e.target.value}))}
                    onKeyDown={e=>e.key==="Enter"&&connectProvider(api.id)}
                    placeholder={`Kle API ${api.name}…`}
                    className="flex-1 text-xs rounded-lg px-3 py-2 outline-none"
                    style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"#e2e8f0" }}
                  />
                  <button onClick={()=>connectProvider(api.id)} disabled={!!connecting[api.id]}
                    className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                    style={{ background:"rgba(124,58,237,0.4)", color:"#c4b5fd", border:"1px solid rgba(124,58,237,0.5)" }}>
                    {connecting[api.id] ? <Loader2 size={11} className="animate-spin" /> : null}
                    {t("adminMusic.connect")}
                  </button>
                  <button onClick={()=>testProvider(api.id)} disabled={!!testing[api.id]}
                    className="px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                    style={{ background:"rgba(255,255,255,0.07)", color:"#94a3b8", border:"1px solid rgba(255,255,255,0.1)" }}>
                    {testing[api.id] ? <Loader2 size={11} className="animate-spin" /> : t("adminMusic.test")}
                  </button>
                </div>
              )}
              {noKeyNeeded && (
                <button onClick={()=>testProvider(api.id)} disabled={!!testing[api.id]}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                  style={{ background:"rgba(255,255,255,0.07)", color:"#94a3b8", border:"1px solid rgba(255,255,255,0.1)" }}>
                  {testing[api.id] ? <Loader2 size={11} className="animate-spin" /> : null}
                  {t("adminMusic.testConnection")}
                </button>
              )}
              {testMsg[api.id] && (
                <p className={`text-[11px] ${testMsg[api.id].startsWith("✅") ? "text-emerald-400" : "text-red-400"}`}>
                  {testMsg[api.id]}
                </p>
              )}
              {!noKeyNeeded && <p className="text-[10px] opacity-30">{t("adminMusic.searchAvailableWhenKey")}</p>}
            </div>
          )}

          {/* Connected — show test / disconnect controls */}
          {!api.live && connected[api.id] && (
            <div className="space-y-2">
              <div className="flex gap-2">
                <button onClick={()=>testProvider(api.id)} disabled={!!testing[api.id]}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-bold disabled:opacity-50"
                  style={{ background:"rgba(255,255,255,0.07)", color:"#94a3b8", border:"1px solid rgba(255,255,255,0.1)" }}>
                  {testing[api.id] ? <Loader2 size={11} className="animate-spin" /> : null}
                  {t("adminMusic.testConnection")}
                </button>
              </div>
              {testMsg[api.id] && (
                <p className={`text-[11px] ${testMsg[api.id].startsWith("✅") ? "text-emerald-400" : "text-red-400"}`}>
                  {testMsg[api.id]}
                </p>
              )}
            </div>
          )}

          {/* Search + import panel — Jamendo (always live) and Pixabay (when connected) */}
          {canSearch && (
            <div className="space-y-3 mt-3">
              <div className="flex gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-lg px-3 py-2"
                  style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)" }}>
                  <Search size={12} className="text-white/40 shrink-0" />
                  <input value={query} onChange={e=>setQuery(e.target.value)}
                    onKeyDown={e=>e.key==="Enter"&&searchProvider(api.id)}
                    placeholder={t("adminMusic.searchPlaceholder")}
                    className="flex-1 bg-transparent text-xs text-white placeholder:text-white/30 outline-none" />
                </div>
                <button onClick={()=>searchProvider(api.id)} disabled={!!searching[api.id]}
                  className="px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-60 transition-all"
                  style={{ background:"linear-gradient(135deg,#7c3aed,#c026d3)", color:"#fff" }}>
                  {searching[api.id] ? <Loader2 size={12} className="animate-spin" /> : t("adminMusic.search")}
                </button>
              </div>

              {(results[api.id] ?? []).length > 0 && (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {(results[api.id] ?? []).map(trk => (
                    <div key={trk.id} className="flex items-center gap-2 rounded-xl px-3 py-2"
                      style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.06)" }}>
                      <img src={trk.image} alt={trk.name} className="w-9 h-9 rounded-lg object-cover shrink-0" onError={e=>{(e.target as HTMLImageElement).style.display="none"}} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold truncate">{trk.name}</p>
                        <p className="text-[10px] opacity-50 truncate">{trk.artist_name} · {fmtDur(trk.duration)}</p>
                      </div>
                      <button onClick={()=>importJamendo(trk)} disabled={!!importing[trk.id]||imported.has(trk.id)}
                        className="shrink-0 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all disabled:opacity-40"
                        style={{ background: imported.has(trk.id)?"rgba(16,185,129,0.2)":"rgba(124,58,237,0.3)", color: imported.has(trk.id)?"#34d399":"#c4b5fd" }}>
                        {importing[trk.id] ? <Loader2 size={10} className="animate-spin" /> : imported.has(trk.id) ? <Check size={10} /> : t("adminMusic.import")}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      ); })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Statistics
// ══════════════════════════════════════════════════════════════════════════════
function StatsTab({ tracks, daily }: { tracks: Track[]; daily: DailyStats[] }) {
  const { t } = useTranslation();
  const [range, setRange] = useState<"7"|"30"|"90">("30");

  const sliced = [...daily].reverse().slice(-(Number(range)));

  const topGenres = Object.entries(
    tracks.reduce((acc, t) => {
      const g = t.genre || "Lòt";
      acc[g] = (acc[g]||0) + t.play_count;
      return acc;
    }, {} as Record<string,number>)
  ).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([name,value])=>({name,value}));

  const topTracks = [...tracks].sort((a,b)=>b.play_count-a.play_count).slice(0,10)
    .map(t => ({ name: t.title.slice(0,18), plays: t.play_count, rev: Number(t.stats_confirmed||0) }));

  const tooltipStyle = { background: "#1a1a2e", border: "1px solid #333", borderRadius: 8, fontSize: 11 };

  return (
    <div className="space-y-5">
      {/* Range selector */}
      <div className="flex gap-1 rounded-xl p-1" style={{ background:"rgba(255,255,255,0.04)", display:"inline-flex" }}>
        {(["7","30","90"] as const).map(r => (
          <button key={r} onClick={()=>setRange(r)}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${range===r?"bg-violet-600 text-white":"text-white/40"}`}>
            {r}j
          </button>
        ))}
      </div>

      {/* Daily impressions */}
      <div className="rounded-2xl p-4" style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)" }}>
        <p className="text-xs font-black mb-3 opacity-70">{t("adminMusic.impressionsByDay")}</p>
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={sliced} margin={{top:0,right:4,left:-24,bottom:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="date" tick={{fontSize:9,fill:"#888"}} tickFormatter={d=>d.slice(5)} interval="preserveStartEnd" />
            <YAxis tick={{fontSize:9,fill:"#888"}} />
            <Tooltip contentStyle={tooltipStyle} />
            <Line type="monotone" dataKey="impressions" stroke="#7c3aed" dot={false} strokeWidth={2} name="Impressions" />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Revenue */}
      {sliced.some(d=>d.paid_out>0) && (
        <div className="rounded-2xl p-4" style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-xs font-black mb-3 opacity-70">{t("adminMusic.confirmedRevenueLbl")}</p>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={sliced} margin={{top:0,right:4,left:-24,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{fontSize:9,fill:"#888"}} tickFormatter={d=>d.slice(5)} interval="preserveStartEnd" />
              <YAxis tick={{fontSize:9,fill:"#888"}} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v:any)=>[`$${Number(v).toFixed(2)}`]} />
              <Bar dataKey="paid_out" fill="#10b981" radius={[4,4,0,0]} name="Revni" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Top genres pie */}
      {topGenres.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-xs font-black mb-3 opacity-70">{t("adminMusic.topGenresByPlays")}</p>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={topGenres} cx="50%" cy="50%" innerRadius={35} outerRadius={60} dataKey="value" paddingAngle={2}>
                  {topGenres.map((_,i)=><Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {topGenres.map((g,i)=>(
                <div key={g.name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{background:PIE_COLORS[i%PIE_COLORS.length]}} />
                  <span className="text-[10px] flex-1 truncate opacity-70">{g.name}</span>
                  <span className="text-[10px] font-bold">{fmtN(g.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Top tracks */}
      {topTracks.length > 0 && (
        <div className="rounded-2xl p-4" style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)" }}>
          <p className="text-xs font-black mb-3 opacity-70">{t("adminMusic.topSongs")}</p>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topTracks} layout="vertical" margin={{top:0,right:8,left:4,bottom:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
              <XAxis type="number" tick={{fontSize:9,fill:"#888"}} />
              <YAxis type="category" dataKey="name" tick={{fontSize:9,fill:"#888"}} width={80} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="plays" fill="#7c3aed" radius={[0,4,4,0]} name="Plays" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Playlists
// ══════════════════════════════════════════════════════════════════════════════
function PlaylistsTab({ tracks }: { tracks: Track[] }) {
  const { t } = useTranslation();
  const [playlists,   setPlaylists]   = useState<Playlist[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [showModal,   setShowModal]   = useState(false);
  const [editing,     setEditing]     = useState<Playlist|null>(null);
  const [form,        setForm]        = useState({ title:"", description:"", is_featured:false, is_trending:false });
  const [trackSel,    setTrackSel]    = useState<Set<number>>(new Set());
  const [saving,      setSaving]      = useState(false);

  const load = async () => {
    setLoading(true);
    try { const d = await adminFetch("/api/admin/music/playlists"); setPlaylists(d.playlists??[]); }
    catch { /* */ } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm({title:"",description:"",is_featured:false,is_trending:false}); setTrackSel(new Set()); setShowModal(true); };
  const openEdit = (p: Playlist) => { setEditing(p); setForm({title:p.title,description:p.description||"",is_featured:p.is_featured,is_trending:p.is_trending}); setTrackSel(new Set()); setShowModal(true); };

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await adminFetch(`/api/admin/music/playlists/${editing.id}`,"PUT",{...form, track_ids:[...trackSel]});
      } else {
        await adminFetch("/api/admin/music/playlists","POST",form as any);
      }
      setShowModal(false); load();
    } catch { alert(t("adminMusic.err")); }
    finally { setSaving(false); }
  };

  const del = async (id: number) => {
    if (!confirm(t("adminMusic.confirmDeletePlaylist"))) return;
    await adminFetch(`/api/admin/music/playlists/${id}`,"DELETE");
    load();
  };

  const toggleTrack = (id:number) => setTrackSel(s => { const n=new Set(s); n.has(id)?n.delete(id):n.add(id); return n; });
  const inp = "w-full rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-violet-500/40";
  const inpStyle = { background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)", color:"#e2e8f0" };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs opacity-40">{playlists.length} playlist</p>
        <button onClick={openNew} className="flex items-center gap-1.5 text-sm font-bold px-4 py-2 rounded-xl"
          style={{ background:"linear-gradient(135deg,#7c3aed,#c026d3)", color:"#fff" }}>
          <Plus size={14} /> {t("adminMusic.newPlaylist")}
        </button>
      </div>

      {loading ? <div className="space-y-2">{[...Array(4)].map((_,i)=><Skeleton key={i} h="h-16" />)}</div> :
        playlists.length === 0 ? (
          <div className="text-center py-16 opacity-30"><ListMusic size={32} className="mx-auto mb-2" /><p className="text-sm">{t("adminMusic.noPlaylists")}</p></div>
        ) : (
          <div className="space-y-2">
            {playlists.map(pl => (
              <div key={pl.id} className="flex items-center gap-3 rounded-2xl px-4 py-3"
                style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)" }}>
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background:"linear-gradient(135deg,#4c1d95,#7c3aed)" }}>
                  {pl.cover_url ? <img src={pl.cover_url} alt={pl.title} className="w-full h-full object-cover rounded-xl" /> : <ListMusic size={20} className="text-white/40" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold truncate">{pl.title}</p>
                    {pl.is_featured && <Badge label={t("adminMusic.featured")} color="bg-amber-500/20 text-amber-400" />}
                    {pl.is_trending && <Badge label={t("adminMusic.trending")} color="bg-fuchsia-500/20 text-fuchsia-400" />}
                  </div>
                  <p className="text-[10px] opacity-40">{t("adminMusic.songCount", { count: pl.track_count })}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={()=>openEdit(pl)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/10"><Pencil size={12} className="text-violet-400" /></button>
                  <button onClick={()=>del(pl.id)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-red-500/10"><Trash2 size={12} className="text-red-400" /></button>
                </div>
              </div>
            ))}
          </div>
        )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end" onClick={()=>setShowModal(false)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div className="relative w-full rounded-t-3xl overflow-hidden max-h-[90vh] overflow-y-auto"
            style={{ background:"#1a1a2e", border:"1px solid rgba(255,255,255,0.08)" }}
            onClick={e=>e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-white/20" /></div>
            <div className="px-5 py-4 space-y-3">
              <h2 className="font-black text-base">{editing ? t("adminMusic.editPlaylist") : t("adminMusic.newPlaylist")}</h2>
              <div>
                <label className="block text-xs font-bold opacity-60 mb-1">{t("adminMusic.titleLabel")}</label>
                <input className={inp} style={inpStyle} value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))} />
              </div>
              <div>
                <label className="block text-xs font-bold opacity-60 mb-1">{t("adminMusic.playlistDesc")}</label>
                <textarea className={inp} style={inpStyle} rows={2} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} />
              </div>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.is_featured} onChange={e=>setForm(f=>({...f,is_featured:e.target.checked}))} className="accent-amber-400" />
                  ⭐ Featured
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={form.is_trending} onChange={e=>setForm(f=>({...f,is_trending:e.target.checked}))} className="accent-fuchsia-400" />
                  🔥 Trending
                </label>
              </div>
              {/* Track selector */}
              <div>
                <label className="block text-xs font-bold opacity-60 mb-2">{t("adminMusic.playlistTracks", { count: trackSel.size })}</label>
                <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl p-2" style={{background:"rgba(255,255,255,0.03)"}}>
                  {tracks.map(t => (
                    <label key={t.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer hover:bg-white/5">
                      <input type="checkbox" checked={trackSel.has(t.id)} onChange={()=>toggleTrack(t.id)} className="accent-violet-400 shrink-0" />
                      <Cover src={t.cover_url} title={t.title} size={28} />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs truncate font-medium">{t.title}</p>
                        <p className="text-[10px] opacity-40 truncate">{t.artist}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 pb-4">
                <button onClick={()=>setShowModal(false)} className="flex-1 py-3 rounded-xl text-sm font-bold" style={{background:"rgba(255,255,255,0.08)"}}>{t("adminMusic.cancel")}</button>
                <button onClick={save} disabled={saving||!form.title.trim()} className="flex-1 py-3 rounded-xl text-sm font-black flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{background:"linear-gradient(135deg,#7c3aed,#c026d3)",color:"#fff"}}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {t("adminMusic.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Artists
// ══════════════════════════════════════════════════════════════════════════════
function ArtistsTab() {
  const { t } = useTranslation();
  const [artists,  setArtists]  = useState<Artist[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [toggling, setToggling] = useState<string|null>(null);

  const load = async () => {
    setLoading(true);
    try { const d = await adminFetch("/api/admin/music/artists"); setArtists(d.artists??[]); }
    catch { /* */ } finally { setLoading(false); }
  };
  useEffect(()=>{ load(); },[]);

  const toggleVerify = async (artist: Artist) => {
    setToggling(artist.name);
    try { await adminFetch("/api/admin/music/artists/verify","PUT",{artist:artist.name, is_verified:!artist.is_verified}); load(); }
    catch { alert(t("adminMusic.err")); } finally { setToggling(null); }
  };

  if (loading) return <div className="space-y-2">{[...Array(5)].map((_,i)=><Skeleton key={i} h="h-16" />)}</div>;
  if (!artists.length) return <div className="text-center py-16 opacity-30"><Mic2 size={32} className="mx-auto mb-2" /><p className="text-sm">{t("adminMusic.noArtists")}</p></div>;

  return (
    <div className="space-y-2">
      {artists.map(a => (
        <div key={a.name} className="rounded-2xl px-4 py-3 flex items-center gap-3"
          style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)" }}>
          <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-black text-sm"
            style={{ background:"linear-gradient(135deg,#7c3aed,#c026d3)" }}>
            {(a.user_name||a.name)[0]?.toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="text-sm font-bold truncate">{a.name}</p>
              {a.is_verified && <BadgeCheck size={13} className="text-blue-400 shrink-0" />}
            </div>
            <div className="flex flex-wrap gap-2 text-[10px] opacity-50 mt-0.5">
              <span>🎵 {t("adminMusic.songCount", { count: a.track_count })}</span>
              <span>▶ {fmtN(a.total_plays)} plays</span>
              <span>💰 {fmt$(Number(a.total_revenue))}</span>
            </div>
          </div>
          <button onClick={()=>toggleVerify(a)} disabled={toggling===a.name}
            className={`flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-lg transition-all ${a.is_verified?"bg-blue-500/20 text-blue-400":"bg-white/10 text-white/40"}`}>
            {toggling===a.name ? <Loader2 size={10} className="animate-spin" /> : <BadgeCheck size={10} />}
            {a.is_verified ? t("adminMusic.verified") : t("adminMusic.verify")}
          </button>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Monetization
// ══════════════════════════════════════════════════════════════════════════════
function MonetizationTab({ tracks, onRefresh }: { tracks: Track[]; onRefresh: ()=>void }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState<number|null>(null);
  const [vals,   setVals]   = useState<Record<number,{type:string;price:string}>>({});

  const getVal = (t: Track) => vals[t.id] || {type:t.monetization_type||t.type, price:t.price_usd?String(t.price_usd):""};
  const setV = (id:number, k:string, v:string) => setVals(m=>({...m,[id]:{...getVal(tracks.find(t=>t.id===id)!), [k]:v}}));

  const save = async (trk: Track) => {
    const v = getVal(trk);
    setSaving(trk.id);
    try {
      await adminFetch(`/api/admin/music/${trk.id}/monetization`,"PUT",{
        monetization_type: v.type, price_usd: v.price ? Number(v.price) : undefined,
      });
      onRefresh();
    } catch { alert(t("adminMusic.err")); }
    finally { setSaving(null); }
  };

  return (
    <div className="space-y-2">
      {tracks.map(t => {
        const v = getVal(t);
        return (
          <div key={t.id} className="flex items-center gap-2 rounded-2xl px-3 py-2.5"
            style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)" }}>
            <Cover src={t.cover_url} title={t.title} size={36} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">{t.title}</p>
              <p className="text-[10px] opacity-40 truncate">{t.artist}</p>
            </div>
            <select value={v.type} onChange={e=>setV(t.id,"type",e.target.value)}
              className="text-[10px] rounded-lg px-2 py-1 outline-none"
              style={{ background:"#2a2a3a", border:"1px solid rgba(255,255,255,0.1)", color:"#e2e8f0" }}>
              {MONETIZATION_TYPES.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            {["paid_download","premium"].includes(v.type) && (
              <input type="number" value={v.price} onChange={e=>setV(t.id,"price",e.target.value)}
                placeholder="$" min={0} step={0.01}
                className="w-14 text-[10px] rounded-lg px-2 py-1 outline-none"
                style={{ background:"#2a2a3a", border:"1px solid rgba(255,255,255,0.1)", color:"#e2e8f0" }} />
            )}
            <button onClick={()=>save(t)} disabled={saving===t.id}
              className="w-7 h-7 flex items-center justify-center rounded-lg"
              style={{ background:"rgba(124,58,237,0.3)" }}>
              {saving===t.id ? <Loader2 size={11} className="animate-spin text-violet-400" /> : <Check size={11} className="text-violet-400" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Copyright
// ══════════════════════════════════════════════════════════════════════════════
function CopyrightTab({ tracks, onRefresh }: { tracks: Track[]; onRefresh: ()=>void }) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState<number|null>(null);
  const [vals,   setVals]   = useState<Record<number,string>>({});

  const getV = (t: Track) => vals[t.id] ?? (t.copyright_status||"verified");

  const save = async (trk: Track) => {
    setSaving(trk.id);
    try { await adminFetch(`/api/admin/music/${trk.id}/copyright`,"PUT",{copyright_status:getV(trk)}); onRefresh(); }
    catch { alert(t("adminMusic.err")); } finally { setSaving(null); }
  };

  return (
    <div className="space-y-2">
      {tracks.map(t => (
        <div key={t.id} className="flex items-center gap-2 rounded-2xl px-3 py-2.5"
          style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)" }}>
          <Cover src={t.cover_url} title={t.title} size={36} />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold truncate">{t.title}</p>
            <p className="text-[10px] opacity-40 truncate">{t.artist}</p>
          </div>
          <select value={getV(t)} onChange={e=>setVals(m=>({...m,[t.id]:e.target.value}))}
            className="text-[10px] rounded-lg px-2 py-1 outline-none"
            style={{ background:"#2a2a3a", border:"1px solid rgba(255,255,255,0.1)", color:"#e2e8f0" }}>
            {COPYRIGHT_STATUSES.map(s=><option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={()=>save(t)} disabled={saving===t.id}
            className="w-7 h-7 flex items-center justify-center rounded-lg"
            style={{ background:"rgba(124,58,237,0.3)" }}>
            {saving===t.id ? <Loader2 size={11} className="animate-spin text-violet-400" /> : <Check size={11} className="text-violet-400" />}
          </button>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: Storage
// ══════════════════════════════════════════════════════════════════════════════
function StorageTab({ storage, tracks }: { storage: StorageStats|null; tracks: Track[] }) {
  const { t } = useTranslation();
  if (!storage) return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-violet-400" /></div>;

  const used = storage.estimated_storage_bytes;
  const FREE_LIMIT_GB = 5;
  const pct = Math.min(100, (used/(FREE_LIMIT_GB*1024**3))*100);
  const genres = [...new Set(tracks.map(t=>t.genre).filter(Boolean))].length;

  const items = [
    { label: t("adminMusic.totalSongsLabel"),    value: fmtN(storage.track_count),     icon: Music2,     color:"text-violet-400" },
    { label: t("adminMusic.pendingSongs"),        value: fmtN(storage.pending_count),   icon: Clock,      color:"text-orange-400" },
    { label: t("adminMusic.avgDuration"),         value: fmtDur(Math.round(storage.avg_duration)), icon: Play, color:"text-emerald-400" },
    { label: t("adminMusic.totalDuration"),       value: fmtDur(Math.round(storage.total_duration)), icon: BarChart2, color:"text-blue-400" },
    { label: t("adminMusic.estimatedAudio"),      value: fmtBytes(storage.audio_bytes), icon: HardDrive,  color:"text-fuchsia-400" },
    { label: t("adminMusic.estimatedCovers"),     value: fmtBytes(storage.cover_bytes), icon: Tag,        color:"text-cyan-400" },
    { label: t("adminMusic.uniqueGenres"),        value: String(genres),                 icon: Filter,     color:"text-amber-400" },
    { label: t("adminMusic.avgPerSong"),          value: fmtBytes(storage.track_count ? Math.round(used/storage.track_count) : 0), icon: Zap, color:"text-pink-400" },
  ];

  return (
    <div className="space-y-5">
      {/* Storage bar */}
      <div className="rounded-2xl p-5" style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)" }}>
        <div className="flex items-center justify-between mb-2">
          <div>
            <p className="font-black text-lg">{fmtBytes(used)}</p>
            <p className="text-xs opacity-40">{t("adminMusic.storageUsed")}</p>
          </div>
          <HardDrive size={28} className="text-violet-400 opacity-60" />
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background:"rgba(255,255,255,0.1)" }}>
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width:`${pct}%`, background:`linear-gradient(90deg,${pct>80?"#ef4444":"#7c3aed"},${pct>80?"#f97316":"#c026d3"})` }} />
        </div>
        <div className="flex justify-between text-[10px] opacity-40 mt-1">
          <span>{t("adminMusic.storageUsedPct", { pct: pct.toFixed(1) })}</span>
          <span>{t("adminMusic.storageLimit", { n: FREE_LIMIT_GB })}</span>
        </div>
        <div className="mt-3 rounded-xl p-3" style={{ background:"rgba(124,58,237,0.1)", border:"1px solid rgba(124,58,237,0.2)" }}>
          <p className="text-xs font-bold text-violet-400">🚀 Wasabi Cloud Storage</p>
          <p className="text-[10px] opacity-50 mt-0.5">{t("adminMusic.wasabiNote")}</p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        {items.map(it => (
          <div key={it.label} className="rounded-2xl p-3 flex items-center gap-3"
            style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.08)" }}>
            <it.icon size={18} className={`shrink-0 ${it.color}`} />
            <div className="min-w-0">
              <p className="font-black text-sm">{it.value}</p>
              <p className="text-[9px] opacity-40 leading-tight">{it.label}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN PAGE
// ══════════════════════════════════════════════════════════════════════════════
export default function AdminMusic() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();

  const [tracks,    setTracks]    = useState<Track[]>([]);
  const [platform,  setPlatform]  = useState<PlatformStats|null>(null);
  const [daily,     setDaily]     = useState<DailyStats[]>([]);
  const [storage,   setStorage]   = useState<StorageStats|null>(null);
  const [loading,   setLoading]   = useState(true);
  const [refreshing,setRefreshing]= useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [editTrack, setEditTrack] = useState<Track|null>(null);

  const load = useCallback(async (silent=false) => {
    if (!silent) setLoading(true); else setRefreshing(true);
    try {
      const [td, sd, stg] = await Promise.all([
        adminFetch("/api/admin/music"),
        adminFetch("/api/admin/music/stats"),
        adminFetch("/api/admin/music/storage-stats").catch(()=>null),
      ]);
      setTracks(td.tracks??[]);
      setPlatform(sd.summary??null);
      setDaily(sd.daily??[]);
      if (stg) setStorage(stg);
    } catch { /* stale */ }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openEdit = (t: Track) => { setEditTrack(t); setActiveTab("add"); };
  const afterSave = () => { setEditTrack(null); setActiveTab("songs"); load(); };
  const cancelEdit = () => { setEditTrack(null); setActiveTab("songs"); };

  // Pending buffer
  const pending = tracks.filter(t=>!t.is_active).length;

  // Tab scroll ref
  const tabScrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="min-h-screen pb-32" style={{ background:"#0d0d1a", color:"#e2e8f0" }}>
      <div className="max-w-2xl mx-auto px-3">

        {/* ── Header ── */}
        <div className="flex items-center gap-3 py-4 sticky top-0 z-30" style={{ background:"#0d0d1a" }}>
          <button onClick={()=>setLocation("/admin")}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/10 transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background:"linear-gradient(135deg,#7c3aed,#c026d3)" }}>
            <Music2 size={20} className="text-white" />
          </div>
          <div className="flex-1">
            <h1 className="font-black text-base leading-tight">Flexa Music Admin</h1>
            <p className="text-[10px] opacity-40">{t("adminMusic.headerSubtitle")}</p>
          </div>
          <div className="flex items-center gap-2">
            {pending > 0 && (
              <button onClick={()=>setActiveTab("songs")}
                className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 rounded-full"
                style={{ background:"rgba(249,115,22,0.2)", border:"1px solid rgba(249,115,22,0.4)", color:"#fb923c" }}>
                <AlertCircle size={10} /> {t("adminMusic.pendingCount", { count: pending })}
              </button>
            )}
            <button onClick={()=>load(true)} disabled={refreshing}
              className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center transition-colors">
              <RefreshCw size={14} className={refreshing?"animate-spin text-violet-400":"text-white/40"} />
            </button>
            <button onClick={()=>{setEditTrack(null);setActiveTab("add")}}
              className="flex items-center gap-1.5 text-xs font-black px-3 py-2 rounded-xl"
              style={{ background:"linear-gradient(135deg,#7c3aed,#c026d3)", color:"#fff" }}>
              <Plus size={14} /> {t("adminMusic.addBtn")}
            </button>
          </div>
        </div>

        {/* ── Tab bar (horizontal scroll) ── */}
        <div ref={tabScrollRef}
          className="flex gap-1 overflow-x-auto pb-3 mb-4 scrollbar-hide"
          style={{ scrollbarWidth:"none" }}>
          {TABS.map(tab => {
            const Icon = TAB_ICONS[tab];
            const active = activeTab === tab;
            return (
              <button key={tab} onClick={()=>setActiveTab(tab)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${active?"text-white":"text-white/40 hover:text-white/70"}`}
                style={{ background: active ? "rgba(124,58,237,0.4)" : "rgba(255,255,255,0.05)",
                         border: active ? "1px solid rgba(124,58,237,0.6)" : "1px solid transparent" }}>
                <Icon size={13} />
                {t(`adminMusic.tab${tab.charAt(0).toUpperCase()}${tab.slice(1)}`)}
                {tab==="songs" && tracks.length>0 && <span className="ml-0.5 opacity-60">({tracks.length})</span>}
              </button>
            );
          })}
        </div>

        {/* ── Tab content ── */}
        {activeTab === "dashboard" && (
          <DashboardTab tracks={tracks} platform={platform} storage={storage} daily={daily} loading={loading} />
        )}
        {activeTab === "songs" && (
          <SongsTab tracks={tracks} onEdit={openEdit} onRefresh={()=>load(true)} loading={loading} />
        )}
        {activeTab === "add" && (
          <AddSongTab track={editTrack} onSave={afterSave} onCancel={cancelEdit} />
        )}
        {activeTab === "import" && (
          <ImportTab onImportDone={()=>load(true)} />
        )}
        {activeTab === "stats" && (
          <StatsTab tracks={tracks} daily={daily} />
        )}
        {activeTab === "playlists" && (
          <PlaylistsTab tracks={tracks} />
        )}
        {activeTab === "artists" && (
          <ArtistsTab />
        )}
        {activeTab === "monetization" && (
          <MonetizationTab tracks={tracks} onRefresh={()=>load(true)} />
        )}
        {activeTab === "copyright" && (
          <CopyrightTab tracks={tracks} onRefresh={()=>load(true)} />
        )}
        {activeTab === "storage" && (
          <StorageTab storage={storage} tracks={tracks} />
        )}
      </div>
    </div>
  );
}
