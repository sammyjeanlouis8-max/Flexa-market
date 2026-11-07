import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Eye, MousePointerClick, Pause, Play, BarChart3, Plus } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import BoosterLayout from "../BoosterLayout";

interface Campaign {
  boostId: number;
  listingId: number;
  title: string;
  thumbnail: string | null;
  boostVideoUrl: string | null;
  lifecycleStatus: string;
  impressions: number;
  clicks: number;
  budget: number;
  estimatedSpentUsd: number;
  remainingBudgetUsd: number;
  isExpired: boolean;
}

type Tab = "active" | "completed" | "draft" | "paused";

export default function MyBoostsProPage() {
  const { token } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<Tab>("active");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/booster/campaigns", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
    } catch { /* ok */ }
    finally { setLoading(false); }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = campaigns.filter((c) => {
    if (tab === "active") return c.lifecycleStatus === "active";
    if (tab === "paused") return c.lifecycleStatus === "paused";
    if (tab === "completed") return c.lifecycleStatus === "completed";
    return c.lifecycleStatus === "draft";
  });

  const counts = {
    active: campaigns.filter((c) => c.lifecycleStatus === "active").length,
    completed: campaigns.filter((c) => c.lifecycleStatus === "completed").length,
    draft: campaigns.filter((c) => c.lifecycleStatus === "draft").length,
    paused: campaigns.filter((c) => c.lifecycleStatus === "paused").length,
  };

  const pauseResume = async (c: Campaign, action: "pause" | "resume") => {
    if (!token) return;
    setBusyId(c.boostId);
    try {
      const res = await fetch(`/api/booster/campaigns/${c.boostId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: data.error ?? "Echèk", variant: "destructive" });
        return;
      }
      toast({ title: action === "pause" ? "Kampani pozé" : "Kampani rekòmanse" });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <BoosterLayout
      title="My Boosts"
      subtitle="Jere kampani aktif, pozé, ak fini."
    >
      <div className="bp-tabs" role="tablist">
        {([
          ["active", `Active (${counts.active})`],
          ["paused", `Paused (${counts.paused})`],
          ["completed", `Completed`],
          ["draft", `Drafts`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            className={`bp-tab${tab === key ? " active" : ""}`}
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="bp-empty">Chaje…</div>
      ) : filtered.length === 0 ? (
        <div className="bp-card bp-empty">
          Pa gen kampani nan kategori sa a.
        </div>
      ) : (
        filtered.map((c) => (
          <div key={c.boostId} className="bp-card" data-testid={`booster-campaign-${c.boostId}`}>
            <div className="bp-campaign">
              {c.thumbnail ? (
                <img className="bp-campaign-thumb" src={c.thumbnail} alt="" />
              ) : (
                <div className="bp-campaign-thumb" />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <strong style={{ fontSize: 14 }}>{c.title}</strong>
                  <span className={`bp-badge bp-badge-${c.lifecycleStatus === "active" ? "active" : c.lifecycleStatus === "paused" ? "paused" : c.lifecycleStatus === "draft" ? "draft" : "completed"}`}>
                    {c.lifecycleStatus}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 8, fontSize: 12, color: "var(--bp-muted)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Eye className="h-3 w-3" /> {c.impressions.toLocaleString()}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <MousePointerClick className="h-3 w-3" /> {c.clicks.toLocaleString()}
                  </span>
                  <span>${c.estimatedSpentUsd.toFixed(2)} / ${c.budget.toFixed(2)}</span>
                </div>
                <div className="bp-actions" style={{ marginTop: 10 }}>
                  {c.lifecycleStatus === "active" && (
                    <button
                      type="button"
                      className="bp-btn bp-btn-ghost"
                      disabled={busyId === c.boostId}
                      onClick={() => void pauseResume(c, "pause")}
                    >
                      <Pause className="h-3.5 w-3.5" /> Pause
                    </button>
                  )}
                  {c.lifecycleStatus === "paused" && (
                    <button
                      type="button"
                      className="bp-btn bp-btn-ghost"
                      disabled={busyId === c.boostId}
                      onClick={() => void pauseResume(c, "resume")}
                    >
                      <Play className="h-3.5 w-3.5" /> Resume
                    </button>
                  )}
                  <button
                    type="button"
                    className="bp-btn bp-btn-ghost"
                    onClick={() => navigate(`/booster/analytics?boostId=${c.boostId}`)}
                  >
                    <BarChart3 className="h-3.5 w-3.5" /> Analytics
                  </button>
                  <Link href={`/listings/${c.listingId}`} className="bp-btn bp-btn-ghost">
                    Detay
                  </Link>
                </div>
              </div>
            </div>
          </div>
        ))
      )}

      <div className="bp-actions" style={{ marginTop: 16 }}>
        <button
          type="button"
          className="bp-btn bp-btn-primary bp-btn-block"
          onClick={() => navigate("/booster/create")}
          data-testid="booster-create-new"
        >
          <Plus className="h-4 w-4" /> Create New Boost
        </button>
      </div>
    </BoosterLayout>
  );
}
