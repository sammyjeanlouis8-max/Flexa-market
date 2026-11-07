import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { Loader2, Plus } from "lucide-react";
import { useAuth } from "@/contexts/auth";
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
  endsAt: string | null;
}

export default function BoosterMyBoosts() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [tab, setTab] = useState<"active" | "completed" | "draft">("active");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/booster/campaigns", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!cancelled) setCampaigns(data.campaigns || []);
      } catch {
        if (!cancelled) setCampaigns([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const filtered = campaigns.filter((c) => c.status === tab);

  return (
    <BoosterLayout
      title={t("booster.myBoosts.title")}
      subtitle={t("booster.myBoosts.subtitle")}
    >
      <div className="bp-tabs" role="tablist">
        {(["active", "completed", "draft"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={`bp-tab${tab === k ? " on" : ""}`}
            onClick={() => setTab(k)}
            data-testid={`booster-tab-${k}`}
          >
            {t(`booster.status.${k}`)} ({campaigns.filter((c) => c.status === k).length})
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
          filtered.map((c) => (
            <div key={c.boostId} className="bp-campaign" data-testid={`booster-campaign-${c.boostId}`}>
              {c.thumbnail ? (
                <img src={c.thumbnail} alt="" className="bp-thumb" />
              ) : (
                <div className="bp-thumb" />
              )}
              <div>
                <div className="font-bold text-sm">{c.title}</div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`bp-badge ${c.status}`}>{t(`booster.status.${c.status}`)}</span>
                  <span className="text-xs text-slate-500 uppercase">{c.adFormat}</span>
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  {t("booster.myBoosts.reach")}: {c.reach.toLocaleString()} · {t("booster.myBoosts.views")}: {(c.videoViews || c.impressions).toLocaleString()}
                </div>
              </div>
              <div className="text-right">
                <div className="font-extrabold text-sm">${c.budget.toFixed(2)}</div>
                {c.endsAt && (
                  <div className="text-[11px] text-slate-500">
                    {new Date(c.endsAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </BoosterLayout>
  );
}
