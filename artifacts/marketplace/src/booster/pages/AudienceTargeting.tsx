import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { HAITI_COMMUNES_BY_DEPARTMENT, HAITI_DEPARTMENTS } from "@/lib/haitiCommunes";
import BoosterLayout from "../BoosterLayout";
import { loadDraft, saveDraft, type BoosterAudienceType } from "../draft";

interface SavedAudience {
  id: number;
  name: string;
  audienceType: string;
  country: string;
  state: string | null;
  cities: string[];
  radiusKm: number | null;
  isActive: boolean;
}

export default function AudienceTargetingPage() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const draft = loadDraft();

  const [audienceType, setAudienceType] = useState<BoosterAudienceType>(draft.audienceType);
  const [state, setState] = useState(draft.state);
  const [cities, setCities] = useState<string[]>(draft.cities);
  const [cityPick, setCityPick] = useState("");
  const [radiusKm, setRadiusKm] = useState(draft.radiusKm || 25);
  const [savedAudienceId, setSavedAudienceId] = useState<number | null>(draft.savedAudienceId);
  const [saved, setSaved] = useState<SavedAudience[]>([]);
  const country = draft.country || user?.country || "";

  const communes = useMemo(
    () => (state ? HAITI_COMMUNES_BY_DEPARTMENT[state] ?? [] : []),
    [state],
  );

  useEffect(() => {
    if (!token) return;
    fetch("/api/booster/audiences?active=1", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : null)
      .then((data) => setSaved(Array.isArray(data?.audiences) ? data.audiences : []))
      .catch(() => {});
  }, [token]);

  const addCity = (city: string) => {
    if (!city || cities.includes(city) || cities.length >= 20) return;
    const next = [...cities, city];
    setCities(next);
    setCityPick("");
  };

  const applySaved = (id: number) => {
    const a = saved.find((s) => s.id === id);
    if (!a) return;
    setSavedAudienceId(id);
    setAudienceType((a.audienceType as BoosterAudienceType) || "custom");
    setState(a.state || "");
    setCities(a.cities?.length ? a.cities : []);
    setRadiusKm(a.radiusKm || 25);
  };

  const next = () => {
    if (!draft.mediaUrl) {
      toast({ title: "Retounen nan Create Boost pou ajoute medya", variant: "destructive" });
      navigate("/booster/create");
      return;
    }
    if (audienceType === "custom" && country === "Haiti" && !state) {
      toast({ title: "Chwazi yon depatman", variant: "destructive" });
      return;
    }
    saveDraft({
      audienceType,
      country,
      state,
      cities,
      radiusKm,
      savedAudienceId,
    });
    navigate("/booster/budget");
  };

  return (
    <BoosterLayout
      title="Audience Targeting"
      subtitle="Advantage+ AI oswa targeting manyèl ak depatman, vil, ak reyon."
    >
      <div className="bp-stepper" aria-hidden>
        <div className="bp-step-dot done" />
        <div className="bp-step-dot active" />
        <div className="bp-step-dot" />
        <div className="bp-step-dot" />
      </div>

      <div className="bp-card">
        <label className="bp-label">Targeting Mode</label>
        <div className="bp-toggle-pair">
          <button
            type="button"
            className={`bp-toggle${audienceType === "advantage_plus" ? " active" : ""}`}
            onClick={() => setAudienceType("advantage_plus")}
            data-testid="booster-audience-advantage"
          >
            Advantage+ AI
          </button>
          <button
            type="button"
            className={`bp-toggle${audienceType === "custom" ? " active" : ""}`}
            onClick={() => setAudienceType("custom")}
            data-testid="booster-audience-manual"
          >
            Manual (Custom)
          </button>
        </div>
        {audienceType === "advantage_plus" && (
          <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--bp-muted)" }}>
            Sistèm nan ajiste odyans lan otomatikman pou pi bon rezilta nan peyi ou ({country || "—"}).
          </p>
        )}
      </div>

      {audienceType === "custom" && (
        <div className="bp-card">
          <label className="bp-label">Location</label>
          <input className="bp-input" value={country || "—"} disabled />

          {country === "Haiti" && (
            <>
              <label className="bp-label" style={{ marginTop: 12 }}>Departments</label>
              <select
                className="bp-select"
                value={state}
                onChange={(e) => { setState(e.target.value); setCities([]); }}
                data-testid="booster-department"
              >
                <option value="">Chwazi depatman</option>
                {HAITI_DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>

              <label className="bp-label" style={{ marginTop: 12 }}>Cities (multiple)</label>
              <div className="bp-row" style={{ alignItems: "center" }}>
                <select
                  className="bp-select"
                  style={{ flex: 1 }}
                  value={cityPick}
                  onChange={(e) => addCity(e.target.value)}
                  data-testid="booster-city-select"
                >
                  <option value="">Ajoute yon vil</option>
                  {communes.map((c) => (
                    <option key={c} value={c} disabled={cities.includes(c)}>{c}</option>
                  ))}
                </select>
              </div>
              {cities.length > 0 && (
                <div className="bp-pill-row" style={{ marginTop: 8 }}>
                  {cities.map((c) => (
                    <span key={c} className="bp-chip">
                      {c}
                      <button type="button" aria-label={`Retire ${c}`} onClick={() => setCities(cities.filter((x) => x !== c))}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          <label className="bp-label" style={{ marginTop: 14 }}>
            Radius (around cities): {radiusKm} km
          </label>
          <input
            type="range"
            className="bp-slider"
            min={5}
            max={100}
            step={1}
            value={radiusKm}
            onChange={(e) => setRadiusKm(Number(e.target.value))}
            data-testid="booster-radius"
          />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--bp-muted)" }}>
            <span>5 km</span>
            <span>100 km</span>
          </div>
          <p style={{ margin: "8px 0 0", fontSize: 11, color: "var(--bp-muted)" }}>
            Reyon an sèvi ak kowòdone otorize itilizatè a — pa sipoze lokalizasyon fizik soti nan vil enskripsyon sèlman.
          </p>
        </div>
      )}

      <div className="bp-card">
        <label className="bp-label">Saved Audience</label>
        <select
          className="bp-select"
          value={savedAudienceId ?? ""}
          onChange={(e) => {
            const id = e.target.value ? Number(e.target.value) : null;
            setSavedAudienceId(id);
            if (id) applySaved(id);
          }}
          data-testid="booster-saved-audience"
        >
          <option value="">None — configure above</option>
          {saved.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="bp-actions">
        <button type="button" className="bp-btn bp-btn-ghost" onClick={() => navigate("/booster/create")}>
          ← Back
        </button>
        <button
          type="button"
          className="bp-btn bp-btn-primary"
          style={{ flex: 1 }}
          onClick={next}
          data-testid="booster-next-budget"
        >
          Next: Budget →
        </button>
      </div>
    </BoosterLayout>
  );
}
