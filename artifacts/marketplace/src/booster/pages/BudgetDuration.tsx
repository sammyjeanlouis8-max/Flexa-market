import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import BoosterLayout from "../BoosterLayout";
import { loadDraft, planFromDates, saveDraft } from "../draft";

const PRESETS = [2, 5, 10, 20] as const;
const MIN_BUDGET = 2;

export default function BudgetDurationPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const draft = loadDraft();

  const [budget, setBudget] = useState(Math.max(MIN_BUDGET, draft.budget || 10));
  const [custom, setCustom] = useState(!PRESETS.includes(draft.budget as any));
  const [startDate, setStartDate] = useState(draft.startDate);
  const [endDate, setEndDate] = useState(draft.endDate);
  const [estimate, setEstimate] = useState<{
    estimatedReach: number;
    dailyBudget: number;
    durationDays: number;
    estimateDisclaimer?: string;
  } | null>(null);
  const [estimating, setEstimating] = useState(false);

  const plan = useMemo(() => planFromDates(startDate, endDate), [startDate, endDate]);
  const durationDays = useMemo(() => {
    const a = new Date(startDate).getTime();
    const b = new Date(endDate).getTime();
    return Math.max(1, Math.ceil((b - a) / 86_400_000) || 1);
  }, [startDate, endDate]);

  useEffect(() => {
    if (!token || budget < MIN_BUDGET) return;
    const t = window.setTimeout(async () => {
      setEstimating(true);
      try {
        const res = await fetch("/api/boost/estimate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            plan,
            budget,
            audience: {
              country: draft.country,
              state: draft.state || null,
              cities: draft.cities,
              radiusKm: draft.radiusKm,
              audienceType: draft.audienceType,
            },
          }),
        });
        if (!res.ok) return;
        const data = await res.json();
        setEstimate({
          estimatedReach: data.estimatedReach,
          dailyBudget: data.dailyBudget,
          durationDays: data.durationDays ?? durationDays,
          estimateDisclaimer: data.estimateDisclaimer,
        });
      } catch { /* non-critical */ }
      finally { setEstimating(false); }
    }, 350);
    return () => window.clearTimeout(t);
  }, [token, budget, plan, draft.country, draft.state, draft.cities, draft.radiusKm, draft.audienceType, durationDays]);

  const next = () => {
    if (budget < MIN_BUDGET) {
      toast({ title: `Bidjè minimòm $${MIN_BUDGET.toFixed(2)}`, variant: "destructive" });
      return;
    }
    if (new Date(endDate) < new Date(startDate)) {
      toast({ title: "Dat fen dwe apre dat kòmansman", variant: "destructive" });
      return;
    }
    saveDraft({ budget, plan, startDate, endDate });
    navigate("/booster/review");
  };

  const reachLow = estimate ? Math.max(50, Math.round(estimate.estimatedReach * 0.55)) : null;
  const reachHigh = estimate ? estimate.estimatedReach : null;
  const impLow = reachLow != null ? reachLow * 2 : null;
  const impHigh = reachHigh != null ? reachHigh * 2 : null;

  return (
    <BoosterLayout
      title="Budget & Duration"
      subtitle="Bidjè total soti nan $2. Estimasyon yo pa garanti rezilta."
    >
      <div className="bp-stepper" aria-hidden>
        <div className="bp-step-dot done" />
        <div className="bp-step-dot done" />
        <div className="bp-step-dot active" />
        <div className="bp-step-dot" />
      </div>

      <div className="bp-card">
        <label className="bp-label">Total Budget (USD)</label>
        <input
          className="bp-input"
          type="number"
          min={MIN_BUDGET}
          step="0.01"
          value={budget}
          onChange={(e) => {
            setCustom(true);
            setBudget(Number(e.target.value) || 0);
          }}
          data-testid="booster-budget-input"
        />
        <div className="bp-pill-row" style={{ marginTop: 10 }}>
          {PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              className={`bp-pill${!custom && budget === p ? " active" : ""}`}
              onClick={() => { setCustom(false); setBudget(p); }}
            >
              ${p}
            </button>
          ))}
          <button
            type="button"
            className={`bp-pill${custom ? " active" : ""}`}
            onClick={() => setCustom(true)}
          >
            Custom
          </button>
        </div>
      </div>

      <div className="bp-card">
        <div className="bp-row">
          <div style={{ flex: 1, minWidth: 140 }}>
            <label className="bp-label">Start</label>
            <input
              type="date"
              className="bp-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              data-testid="booster-start-date"
            />
          </div>
          <div style={{ flex: 1, minWidth: 140 }}>
            <label className="bp-label">End</label>
            <input
              type="date"
              className="bp-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              data-testid="booster-end-date"
            />
          </div>
        </div>
        <p style={{ margin: "10px 0 0", fontSize: 12, color: "var(--bp-muted)" }}>
          Dire: {durationDays} jou · Plan: {plan} · Bidjè/jou: $
          {(estimate?.dailyBudget ?? budget / durationDays).toFixed(2)}
        </p>
      </div>

      <div className="bp-card">
        <label className="bp-label">Estimated Results</label>
        <div className="bp-estimate">
          <div className="bp-estimate-item">
            <strong>
              {estimating || reachLow == null
                ? "…"
                : `${reachLow.toLocaleString()}–${reachHigh!.toLocaleString()}`}
            </strong>
            <span>Reach (estimate)</span>
          </div>
          <div className="bp-estimate-item">
            <strong>
              {estimating || impLow == null
                ? "…"
                : `${impLow.toLocaleString()}–${impHigh!.toLocaleString()}`}
            </strong>
            <span>Impressions (estimate)</span>
          </div>
          <p className="bp-estimate-note">
            {estimate?.estimateDisclaimer
              ?? "Estimated reach only. Views, clicks, and sales are not guaranteed."}
          </p>
        </div>
      </div>

      <div className="bp-actions">
        <button type="button" className="bp-btn bp-btn-ghost" onClick={() => navigate("/booster/audience")}>
          ← Back
        </button>
        <button
          type="button"
          className="bp-btn bp-btn-primary"
          style={{ flex: 1 }}
          onClick={next}
          data-testid="booster-next-review"
        >
          Next: Review →
        </button>
      </div>
    </BoosterLayout>
  );
}
