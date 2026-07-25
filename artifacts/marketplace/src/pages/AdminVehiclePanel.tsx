import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, Edit3, Save, X, Car, Loader2, Search, ExternalLink } from "lucide-react";
import { Link } from "wouter";

interface VehicleImage {
  id: number;
  brand: string;
  model: string;
  year_from: number | null;
  year_to: number | null;
  image_url: string;
  body_style: string | null;
  created_by_name: string | null;
  created_at: string;
}

const BODY_STYLE_OPTS = [
  { value: "", label: "Tout tip" },
  { value: "sedan", label: "🚗 Sedan / Berline" },
  { value: "suv", label: "🚙 SUV / 4×4" },
  { value: "pickup", label: "🛻 Pickup" },
  { value: "truck", label: "🚛 Kamyon" },
  { value: "moto", label: "🏍️ Moto" },
  { value: "scooter", label: "🛵 Scooter" },
];

const AUTH_HEADER = () => ({ Authorization: `Bearer ${localStorage.getItem("flexamarket_token")}` });

export default function AdminVehiclePanel() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [images, setImages] = useState<VehicleImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [styleFilter, setStyleFilter] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [saving, setSaving] = useState(false);

  const emptyDraft = { brand: "", model: "", yearFrom: "", yearTo: "", imageUrl: "", bodyStyle: "" };
  const [draft, setDraft] = useState(emptyDraft);
  const [editDraft, setEditDraft] = useState(emptyDraft);

  useEffect(() => {
    if (!user?.isAdmin && !user?.isSuperAdmin) { setLocation("/"); return; }
    fetchImages();
  }, [user]);

  async function fetchImages() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/vehicle-images", { headers: AUTH_HEADER() });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setImages(data.images ?? []);
    } catch {
      toast({ title: "Erreur", description: "Chajman echwe", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd() {
    if (!draft.brand.trim() || !draft.model.trim() || !draft.imageUrl.trim()) {
      toast({ title: "Enfòmasyon manke", description: "Brand, Model ak Image URL obligatwa", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/vehicle-images", {
        method: "POST",
        headers: { ...AUTH_HEADER(), "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: draft.brand, model: draft.model,
          yearFrom: draft.yearFrom ? parseInt(draft.yearFrom) : undefined,
          yearTo: draft.yearTo ? parseInt(draft.yearTo) : undefined,
          imageUrl: draft.imageUrl, bodyStyle: draft.bodyStyle || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "✅ Ajoute!", description: `${draft.brand} ${draft.model} ajoute avèk siksè` });
      setDraft(emptyDraft);
      setShowAdd(false);
      fetchImages();
    } catch {
      toast({ title: "Erreur", description: "Operasyon echwe", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleEdit(id: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/vehicle-images/${id}`, {
        method: "PUT",
        headers: { ...AUTH_HEADER(), "Content-Type": "application/json" },
        body: JSON.stringify({
          brand: editDraft.brand, model: editDraft.model,
          yearFrom: editDraft.yearFrom ? parseInt(editDraft.yearFrom) : undefined,
          yearTo: editDraft.yearTo ? parseInt(editDraft.yearTo) : undefined,
          imageUrl: editDraft.imageUrl, bodyStyle: editDraft.bodyStyle || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      toast({ title: "✅ Modifye!", description: "Chanjman sove" });
      setEditingId(null);
      fetchImages();
    } catch {
      toast({ title: "Erreur", description: "Modifikasyon echwe", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number, brand: string, model: string) {
    if (!confirm(`Efase foto pou ${brand} ${model}?`)) return;
    try {
      await fetch(`/api/admin/vehicle-images/${id}`, {
        method: "DELETE", headers: AUTH_HEADER(),
      });
      toast({ title: "Efase", description: `${brand} ${model} efase` });
      setImages(imgs => imgs.filter(i => i.id !== id));
    } catch {
      toast({ title: "Erreur", description: "Efase echwe", variant: "destructive" });
    }
  }

  function startEdit(img: VehicleImage) {
    setEditingId(img.id);
    setEditDraft({
      brand: img.brand, model: img.model,
      yearFrom: img.year_from?.toString() ?? "",
      yearTo: img.year_to?.toString() ?? "",
      imageUrl: img.image_url,
      bodyStyle: img.body_style ?? "",
    });
  }

  const filtered = images.filter(img => {
    const q = search.toLowerCase();
    const matchQ = !q || img.brand.toLowerCase().includes(q) || img.model.toLowerCase().includes(q);
    const matchS = !styleFilter || img.body_style === styleFilter;
    return matchQ && matchS;
  });

  if (!user?.isAdmin && !user?.isSuperAdmin) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin">
          <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Admin
          </button>
        </Link>
        <span className="text-muted-foreground">/</span>
        <h1 className="text-lg font-bold flex items-center gap-2">
          <Car className="h-5 w-5 text-primary" /> Gestion Imaj Veyikil
        </h1>
      </div>

      {/* Stats banner */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: "Total imaj", value: images.length },
          { label: "Mak diferan", value: new Set(images.map(i => i.brand)).size },
          { label: "Modèl diferan", value: new Set(images.map(i => i.model)).size },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4 text-center">
            <p className="text-2xl font-extrabold text-primary">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Chèche mak oswa modèl..."
            className="w-full h-10 rounded-xl border border-border bg-background pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </div>
        <select
          value={styleFilter} onChange={e => setStyleFilter(e.target.value)}
          className="h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
        >
          {BODY_STYLE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button
          onClick={() => setShowAdd(v => !v)}
          className="h-10 px-4 rounded-xl bg-primary text-white text-sm font-bold flex items-center gap-2 hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" /> Ajoute Imaj
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5 mb-6 space-y-4">
          <p className="text-sm font-bold text-foreground">➕ Nouvo Imaj Veyikil</p>
          <div className="grid grid-cols-2 gap-3">
            <input value={draft.brand} onChange={e => setDraft(d => ({ ...d, brand: e.target.value }))} placeholder="Mak *  (ex: Toyota)" className="h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <input value={draft.model} onChange={e => setDraft(d => ({ ...d, model: e.target.value }))} placeholder="Modèl *  (ex: Corolla)" className="h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <input value={draft.yearFrom} onChange={e => setDraft(d => ({ ...d, yearFrom: e.target.value }))} placeholder="Ane depi  (ex: 2015)" type="number" className="h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <input value={draft.yearTo} onChange={e => setDraft(d => ({ ...d, yearTo: e.target.value }))} placeholder="Ane jouk  (ex: 2020)" type="number" className="h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
            <select value={draft.bodyStyle} onChange={e => setDraft(d => ({ ...d, bodyStyle: e.target.value }))} className="h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
              {BODY_STYLE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <input value={draft.imageUrl} onChange={e => setDraft(d => ({ ...d, imageUrl: e.target.value }))} placeholder="URL Imaj *  (https://...)" className="w-full h-10 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {/* Preview */}
          {draft.imageUrl && (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-card border border-border">
              <img src={draft.imageUrl} alt="preview" className="h-16 w-28 object-cover rounded-lg border border-border" onError={e => (e.currentTarget.style.display = "none")} />
              <div className="text-xs text-muted-foreground">
                <p className="font-bold text-foreground">{draft.brand} {draft.model}</p>
                <p>{draft.yearFrom && draft.yearTo ? `${draft.yearFrom} – ${draft.yearTo}` : draft.yearFrom || draft.yearTo || "Tout ane"}</p>
                <a href={draft.imageUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline mt-1"><ExternalLink className="h-3 w-3" /> Wè imaj</a>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={handleAdd} disabled={saving} className="flex-1 h-10 bg-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Sove
            </button>
            <button onClick={() => { setShowAdd(false); setDraft(emptyDraft); }} className="h-10 px-4 rounded-xl border border-border text-sm hover:bg-accent">Anile</button>
          </div>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Car className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="font-medium">{images.length === 0 ? "Pa gen imaj anrejistre" : "Pa gen rezilta"}</p>
          <p className="text-sm mt-1">{images.length === 0 ? "Klike «Ajoute Imaj» pou kòmanse" : "Chanje filtre a"}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(img => (
            <div key={img.id} className="rounded-2xl border border-border bg-card overflow-hidden">
              {editingId === img.id ? (
                /* Edit form inline */
                <div className="p-4 space-y-3">
                  <p className="text-xs font-bold text-primary uppercase tracking-wider">Modifye #{img.id}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={editDraft.brand} onChange={e => setEditDraft(d => ({ ...d, brand: e.target.value }))} placeholder="Mak" className="h-9 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    <input value={editDraft.model} onChange={e => setEditDraft(d => ({ ...d, model: e.target.value }))} placeholder="Modèl" className="h-9 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    <input value={editDraft.yearFrom} onChange={e => setEditDraft(d => ({ ...d, yearFrom: e.target.value }))} placeholder="Ane depi" type="number" className="h-9 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    <input value={editDraft.yearTo} onChange={e => setEditDraft(d => ({ ...d, yearTo: e.target.value }))} placeholder="Ane jouk" type="number" className="h-9 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                    <select value={editDraft.bodyStyle} onChange={e => setEditDraft(d => ({ ...d, bodyStyle: e.target.value }))} className="h-9 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none col-span-2">
                      {BODY_STYLE_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <input value={editDraft.imageUrl} onChange={e => setEditDraft(d => ({ ...d, imageUrl: e.target.value }))} placeholder="URL Imaj" className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
                  <div className="flex gap-2">
                    <button onClick={() => handleEdit(img.id)} disabled={saving} className="flex-1 h-9 bg-primary text-white rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-primary/90 disabled:opacity-50">
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Sove
                    </button>
                    <button onClick={() => setEditingId(null)} className="h-9 px-3 rounded-xl border border-border text-sm hover:bg-accent"><X className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ) : (
                /* Display row */
                <div className="flex items-center gap-3 p-3">
                  <img src={img.image_url} alt={`${img.brand} ${img.model}`} className="h-16 w-24 object-cover rounded-xl border border-border shrink-0 bg-muted" onError={e => { e.currentTarget.style.opacity = "0.3"; }} />
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-foreground">{img.brand} {img.model}</p>
                    <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                      {img.body_style && (
                        <span className="text-[10px] font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                          {img.body_style}
                        </span>
                      )}
                      {(img.year_from || img.year_to) && (
                        <span className="text-[10px] text-muted-foreground">
                          {img.year_from ?? "?"} – {img.year_to ?? "kounye a"}
                        </span>
                      )}
                    </div>
                    <a href={img.image_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline mt-0.5">
                      <ExternalLink className="h-2.5 w-2.5" /> Wè imaj
                    </a>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => startEdit(img)} className="h-8 w-8 rounded-xl border border-border flex items-center justify-center hover:bg-accent transition-colors">
                      <Edit3 className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                    <button onClick={() => handleDelete(img.id, img.brand, img.model)} className="h-8 w-8 rounded-xl border border-red-200 dark:border-red-900/50 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors">
                      <Trash2 className="h-3.5 w-3.5 text-red-500" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
