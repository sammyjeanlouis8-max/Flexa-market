import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Power } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { HAITI_COMMUNES_BY_DEPARTMENT, HAITI_DEPARTMENTS } from "@/lib/haitiCommunes";
import BoosterLayout from "../BoosterLayout";

interface Audience {
  id: number;
  name: string;
  audienceType: string;
  country: string;
  state: string | null;
  cities: string[];
  radiusKm: number | null;
  isActive: boolean;
}

export default function SavedAudiencesPage() {
  const { token, user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<Audience[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [state, setState] = useState("Ouest");
  const [cities, setCities] = useState<string[]>([]);
  const [cityPick, setCityPick] = useState("");
  const [radiusKm, setRadiusKm] = useState(25);
  const [saving, setSaving] = useState(false);

  const communes = useMemo(
    () => HAITI_COMMUNES_BY_DEPARTMENT[state] ?? [],
    [state],
  );

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/booster/audiences", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setRows(Array.isArray(data.audiences) ? data.audiences : []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!token || !name.trim()) {
      toast({ title: "Mete yon non odyans", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/booster/audiences", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: name.trim(),
          audienceType: "custom",
          country: user?.country || "Haiti",
          state: user?.country === "Haiti" ? state : null,
          cities,
          radiusKm,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: data.error ?? "Echèk", variant: "destructive" });
        return;
      }
      toast({ title: "Odyans sove ✓" });
      setCreating(false);
      setName("");
      setCities([]);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (a: Audience) => {
    if (!token) return;
    const res = await fetch(`/api/booster/audiences/${a.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ isActive: !a.isActive }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      toast({ title: data.error ?? "Echèk", variant: "destructive" });
      return;
    }
    await load();
  };

  return (
    <BoosterLayout
      title="Saved Audiences"
      subtitle="Reutilize profil targeting ou atravè plizyè kampani."
    >
      {loading ? (
        <div className="bp-empty">Chaje…</div>
      ) : rows.length === 0 && !creating ? (
        <div className="bp-card bp-empty">Pa gen odyans sove ankò.</div>
      ) : (
        rows.map((a) => (
          <div key={a.id} className="bp-card" data-testid={`booster-audience-${a.id}`}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "flex-start" }}>
              <div>
                <strong style={{ fontSize: 14 }}>{a.name}</strong>
                <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--bp-muted)", lineHeight: 1.45 }}>
                  {[a.country, a.state, a.cities?.join(", "), a.radiusKm != null ? `${a.radiusKm} km` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <span className={`bp-badge ${a.isActive ? "bp-badge-active" : "bp-badge-completed"}`} style={{ marginTop: 8 }}>
                  {a.isActive ? "Active" : "Inactive"}
                </span>
              </div>
              <button
                type="button"
                className="bp-btn bp-btn-ghost"
                onClick={() => void toggleActive(a)}
                title={a.isActive ? "Deaktive" : "Aktive"}
              >
                <Power className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ))
      )}

      {creating && (
        <div className="bp-card">
          <label className="bp-label">Audience name</label>
          <input
            className="bp-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Kliyan Port-au-Prince"
            maxLength={100}
            data-testid="booster-audience-name"
          />
          {user?.country === "Haiti" && (
            <>
              <label className="bp-label" style={{ marginTop: 12 }}>Department</label>
              <select className="bp-select" value={state} onChange={(e) => { setState(e.target.value); setCities([]); }}>
                {HAITI_DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <label className="bp-label" style={{ marginTop: 12 }}>Cities</label>
              <select className="bp-select" value={cityPick} onChange={(e) => {
                const c = e.target.value;
                if (c && !cities.includes(c)) setCities([...cities, c]);
                setCityPick("");
              }}>
                <option value="">Ajoute vil</option>
                {communes.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              {cities.length > 0 && (
                <div className="bp-pill-row" style={{ marginTop: 8 }}>
                  {cities.map((c) => (
                    <span key={c} className="bp-chip">
                      {c}
                      <button type="button" onClick={() => setCities(cities.filter((x) => x !== c))}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}
          <label className="bp-label" style={{ marginTop: 12 }}>Radius: {radiusKm} km</label>
          <input type="range" className="bp-slider" min={5} max={100} value={radiusKm} onChange={(e) => setRadiusKm(Number(e.target.value))} />
          <div className="bp-actions">
            <button type="button" className="bp-btn bp-btn-ghost" onClick={() => setCreating(false)}>Anile</button>
            <button type="button" className="bp-btn bp-btn-primary" style={{ flex: 1 }} disabled={saving} onClick={() => void save()} data-testid="booster-audience-save">
              Save Audience
            </button>
          </div>
        </div>
      )}

      {!creating && (
        <div className="bp-actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="bp-btn bp-btn-primary bp-btn-block"
            onClick={() => setCreating(true)}
            data-testid="booster-audience-new"
          >
            <Plus className="h-4 w-4" /> Save New Audience
          </button>
        </div>
      )}
    </BoosterLayout>
  );
}
