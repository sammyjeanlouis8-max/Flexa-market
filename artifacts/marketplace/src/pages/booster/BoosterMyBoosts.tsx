import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { BarChart3, Loader2, Pause, Play, Plus } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import BoosterLayout from "./BoosterLayout";

interface Campaign {
  boostId: number;
  listingId: number;
  title: string;
  thumbnail: string | null;
  adFormat: string;
  status: string;
  impressions: number;
  clicks: number;
  reach: number;
  videoViews: number;
  budget: number;
  startsAt: string | null;
  endsAt: string | null;
}

type Tab = "all" | "active" | "paused" | "completed" | "draft";

export default function BoosterMyBoosts() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("active");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/booster/campaigns", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setCampaigns(data.campaigns || []);
    } catch {
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void load(); }, [load]);

  const filtered = campaigns.filter((c) => {
    if (tab === "all") return true;
    return c.status === tab;
  });

  const count = (k: Tab) =>
    k === "all" ? campaigns.length : campaigns.filter((c) => c.status === k).length;

  const pauseOrResume = async (c: Campaign, action: "pause" | "resume") => {
    if (!token) return;
    setActingId(c.boostId);
    try {
      const res = await fetch(`/api/booster/campaigns/${c.boostId}/${action}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({
          title: data.error || t("booster.myBoosts.actionFailed", { defaultValue: "Could not update campaign" }),
          variant: "destructive",
        });
        return;
      }
      toast({
        title: action === "pause"
          ? t("booster.myBoosts.paused", { defaultValue: "Campaign paused" })
          : t("booster.myBoosts.resumed", { defaultValue: "Campaign resumed" }),
      });
      await load();
    } catch {
      toast({
        title: t("booster.myBoosts.actionFailed", { defaultValue: "Could not update campaign" }),
        variant: "destructive",
      });
    } finally {
      setActingId(null);
    }
  };

  const tabs: Tab[] = ["all", "active", "paused", "completed", "draft"];

  return (
    <BoosterLayout
      title={t("booster.myBoosts.title", { defaultValue: "My Video Campaigns" })}
      subtitle={t("booster.myBoosts.subtitle", { defaultValue: "Manage active, paused, and completed campaigns." })}
    >
      <div className="bp-tabs" role="tablist">
        {tabs.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`bp-tab${tab === k ? " on" : ""}`}
            onClick={() => setTab(k)}
            data-testid={`booster-tab-${k}`}
          >
            {t(`booster.status.${k}`, {
              defaultValue: k === "all" ? "All" : k.charAt(0).toUpperCase() + k.slice(1),
            })} ({count(k)})
          </button>
        ))}
      </div>

      <div className="bp-card">
        {loading ? (
          <div className="bp-empty"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : filtered.length === 0 ? (
          <div className="bp-empty">
            <p>{t("booster.myBoosts.empty")}</p>
            <Link href="/booster/create" className="bp-btn bp-btn-primary" style={{ display: "inline-flex", marginTop: "1rem", gap: 8 }}>
              <Plus className="h-4 w-4" /> {t("booster.nav.create")}
            </Link>
          </div>
        ) : (
          filtered.map((c) => {
            const views = c.videoViews || c.impressions;
            const spent = c.status === "draft" ? 0 : c.budget;
            const remaining = Math.max(0, c.budget - spent);
            const progress = c.budget > 0 ? Math.min(100, (spent / c.budget) * 100) : 0;
            return (
              <div key={c.boostId} className="bp-campaign" data-testid={`booster-campaign-${c.boostId}`} style={{ alignItems: "start" }}>
                {c.thumbnail ? (
                  <img src={c.thumbnail} alt="" className="bp-thumb" />
                ) : (
                  <div className="bp-thumb" />
                )}
                <div className="min-w-0">
                  <div className="font-bold text-sm truncate">{c.title}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`bp-badge ${c.status}`}>
                      {t(`booster.status.${c.status}`, { defaultValue: c.status })}
                    </span>
                    <span className="text-xs text-slate-500 uppercase">{c.adFormat}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1.5 space-y-0.5">
                    <div>
                      {t("booster.myBoosts.views")}: {views.toLocaleString()} ·{" "}
                      {t("booster.analytics.clicks")}: {c.clicks.toLocaleString()}
                      {c.adFormat !== "image" ? (
                        <> · {t("booster.myBoosts.productVisits", { defaultValue: "Product visits" })}: {c.clicks.toLocaleString()}</>
                      ) : null}
                    </div>
                    <div>
                      {t("booster.myBoosts.spent", { defaultValue: "Spent" })}: ${spent.toFixed(2)} / ${c.budget.toFixed(2)}
                      {remaining > 0 ? ` · ${t("booster.myBoosts.remaining", { defaultValue: "Remaining" })}: $${remaining.toFixed(2)}` : null}
                    </div>
                    {(c.startsAt || c.endsAt) && (
                      <div>
                        {c.startsAt ? new Date(c.startsAt).toLocaleDateString() : "—"}
                        {" → "}
                        {c.endsAt ? new Date(c.endsAt).toLocaleDateString() : "—"}
                      </div>
                    )}
                  </div>
                  <div className="bp-meter" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
                  <div className="bp-campaign-actions">
                    {c.status === "active" && (
                      <button
                        type="button"
                        className="bp-btn bp-btn-ghost"
                        disabled={actingId === c.boostId}
                        onClick={() => void pauseOrResume(c, "pause")}
                        data-testid={`booster-pause-${c.boostId}`}
                      >
                        {actingId === c.boostId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Pause className="h-3.5 w-3.5" />}
                        {t("booster.myBoosts.pause", { defaultValue: "Pause" })}
                      </button>
                    )}
                    {c.status === "paused" && (
                      <button
                        type="button"
                        className="bp-btn bp-btn-ghost"
                        disabled={actingId === c.boostId}
                        onClick={() => void pauseOrResume(c, "resume")}
                        data-testid={`booster-resume-${c.boostId}`}
                      >
                        {actingId === c.boostId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                        {t("booster.myBoosts.resume", { defaultValue: "Resume" })}
                      </button>
                    )}
                    <Link
                      href={`/booster/analytics?boostId=${c.boostId}`}
                      className="bp-btn bp-btn-ghost"
                      style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                      <BarChart3 className="h-3.5 w-3.5" />
                      {t("booster.myBoosts.viewAnalytics", { defaultValue: "View Analytics" })}
                    </Link>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-extrabold text-sm">${c.budget.toFixed(2)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div style={{ marginTop: "1rem" }}>
        <Link href="/booster/create" className="bp-btn bp-btn-primary" style={{ display: "inline-flex", gap: 8 }}>
          <Plus className="h-4 w-4" />
          {t("booster.myBoosts.createAnother", { defaultValue: "Create another campaign" })}
        </Link>
      </div>
    </BoosterLayout>
  );
}
