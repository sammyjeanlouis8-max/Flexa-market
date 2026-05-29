import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";
import { Gift, Timer, X } from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

type ProgressData = {
  totalSpendUsd: number;
  totalBonusEarned: number;
  threshold: number;
  bonusAmount: number;
  spendInCurrentBlock: number;
  toNextReward: number;
  progressPct: number;
  campaignActive: boolean;
  campaignMultiplier: number;
  campaignEndsAt: string | null;
  campaignLabel: string;
  effectiveBonus: number;
};

type CampaignData = {
  enabled: boolean;
  threshold: number;
  bonusAmount: number;
  campaignActive: boolean;
  campaignMultiplier: number;
  campaignEndsAt: string | null;
  campaignLabel: string;
  effectiveBonus: number;
};

function Countdown({ endsAt, expiredLabel }: { endsAt: string; expiredLabel: string }) {
  const [timeLeft, setTimeLeft] = useState("");

  useEffect(() => {
    const calc = () => {
      const diff = new Date(endsAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft(expiredLabel); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      if (h > 24) {
        const d = Math.floor(h / 24);
        setTimeLeft(`${d}j ${h % 24}h`);
      } else {
        setTimeLeft(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`);
      }
    };
    calc();
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [endsAt, expiredLabel]);

  return <span className="font-mono font-bold tabular-nums">{timeLeft}</span>;
}

interface RewardProgressBannerProps {
  variant?: "full" | "compact";
  className?: string;
}

export default function RewardProgressBanner({ variant = "full", className }: RewardProgressBannerProps) {
  const { user, token } = useAuth();
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem("zeno_reward_banner_dismissed") === "1"; } catch { return false; }
  });

  const { data: campaign } = useQuery<CampaignData>({
    queryKey: ["promo-campaign"],
    queryFn: async () => {
      const res = await fetch("/api/promo/campaign");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    staleTime: 60_000,
  });

  const { data: progress } = useQuery<ProgressData>({
    queryKey: ["promo-progress", user?.id],
    queryFn: async () => {
      const res = await fetch("/api/promo/progress", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!user && !!token,
    staleTime: 30_000,
  });

  if (dismissed) return null;
  if (!campaign?.enabled) return null;

  const data = progress ?? {
    progressPct: 0,
    spendInCurrentBlock: 0,
    toNextReward: campaign.threshold,
    threshold: campaign.threshold,
    effectiveBonus: campaign.effectiveBonus,
    campaignActive: campaign.campaignActive,
    campaignMultiplier: campaign.campaignMultiplier,
    campaignEndsAt: campaign.campaignEndsAt,
    campaignLabel: campaign.campaignLabel,
    totalBonusEarned: 0,
  } as ProgressData;

  const dismiss = () => {
    try { sessionStorage.setItem("zeno_reward_banner_dismissed", "1"); } catch {}
    setDismissed(true);
  };

  const multiplierSuffix = data.campaignActive && data.campaignMultiplier > 1
    ? ` (${data.campaignMultiplier}x!)`
    : "";

  if (variant === "compact") {
    return (
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg bg-primary/10 border border-primary/20 text-sm",
        className
      )}>
        <Gift className="h-4 w-4 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <span className="text-foreground font-medium">
            {t("reward.spendMore", {
              amount: data.toNextReward.toFixed(2),
              bonus: data.effectiveBonus.toFixed(2),
              multiplier: multiplierSuffix,
            })}
          </span>
        </div>
        <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden shrink-0">
          <div
            className="h-full bg-primary rounded-full transition-all duration-500"
            style={{ width: `${data.progressPct}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{data.progressPct}%</span>
      </div>
    );
  }

  return (
    <div className={cn(
      "relative rounded-xl border overflow-hidden",
      data.campaignActive
        ? "border-amber-400/60 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20"
        : "border-primary/20 bg-primary/5",
      className
    )}>
      <button
        onClick={dismiss}
        className="absolute top-2 right-2 p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-muted-foreground"
        aria-label={t("buttons.close")}
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="px-4 py-3 pr-8">
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
            data.campaignActive ? "bg-amber-400/20" : "bg-primary/15"
          )}>
            <Gift className={cn("h-5 w-5", data.campaignActive ? "text-amber-600 dark:text-amber-400" : "text-primary")} />
          </div>
          <div className="flex-1 min-w-0">
            {data.campaignActive ? (
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                  🔥 {data.campaignLabel}
                </span>
                {data.campaignEndsAt && (
                  <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-500">
                    <Timer className="h-3 w-3" />
                    <Countdown endsAt={data.campaignEndsAt} expiredLabel={t("reward.expired")} />
                  </span>
                )}
              </div>
            ) : (
              <p className="text-xs font-semibold text-primary mb-0.5">{t("reward.programTitle")}</p>
            )}

            {user ? (
              <>
                <p className="text-sm font-medium text-foreground">
                  {t("reward.spendMore", {
                    amount: data.toNextReward.toFixed(2),
                    bonus: data.effectiveBonus.toFixed(2),
                    multiplier: multiplierSuffix,
                  })}
                </p>
                <div className="mt-2 space-y-1">
                  <div className="h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-700",
                        data.campaignActive ? "bg-amber-500" : "bg-primary"
                      )}
                      style={{ width: `${data.progressPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground">
                    <span>${data.spendInCurrentBlock.toFixed(2)} / ${data.threshold.toFixed(2)}</span>
                    {data.totalBonusEarned > 0 && (
                      <span>{t("reward.totalEarned", { amount: data.totalBonusEarned.toFixed(2) })}</span>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-foreground">
                {t("reward.guestText", {
                  threshold: data.threshold.toFixed(0),
                  bonus: data.effectiveBonus.toFixed(2),
                  multiplier: multiplierSuffix,
                })}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
