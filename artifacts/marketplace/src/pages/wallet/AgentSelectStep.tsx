import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Users, Loader2, ChevronRight, ArrowLeft } from "lucide-react";

function BackButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="h-4 w-4" /> {t("wallet.back")}
    </button>
  );
}

export function AgentSelectStep({
  cashoutAmount,
  onBack,
  onSelect,
}: {
  cashoutAmount: string;
  onBack: () => void;
  onSelect: (agent: any) => void;
}) {
  const { t } = useTranslation();
  const { data, isLoading } = useQuery<{ agents: any[] }>({
    queryKey: ["/agents/public", { onlineOnly: false }],
    queryFn: async () => {
      const token = localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
      const r = await fetch("/api/agents/public", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
  });

  const agents = data?.agents ?? [];
  const online = agents.filter((a) => a.isOnline);
  const offline = agents.filter((a) => !a.isOnline);
  const sorted = [...online, ...offline];
  const amount = Number.parseFloat(cashoutAmount || "0");

  return (
    <div className="mx-auto w-full max-w-lg px-4 pt-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] space-y-4">
      <BackButton onClick={onBack} />
      <header className="space-y-1">
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
            <Users className="h-5 w-5" />
          </span>
          <h1 className="text-[21px] sm:text-2xl font-bold tracking-tight text-[#0B1F3A] dark:text-foreground">
            {t("wallet.agentSelectTitle", { defaultValue: "Choose an authorized agent" })}
          </h1>
        </div>
        <p className="text-sm text-slate-500 dark:text-muted-foreground">
          {t("wallet.agentSelectSubtitle", {
            amount: Number.isFinite(amount) ? amount.toFixed(2) : "0.00",
            defaultValue: "Withdraw ${{amount}} — pick an available agent",
          })}
        </p>
      </header>

      {online.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            {t("wallet.agentOnlineCount", {
              count: online.length,
              defaultValue: "{{count}} agent(s) online now",
            })}
          </span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card px-4 py-10 text-center space-y-2">
          <Users className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="font-bold text-[#0B1F3A] dark:text-foreground">
            {t("wallet.agentNoAgents")}
          </p>
          <p className="text-sm text-muted-foreground">
            {t("wallet.agentNoAgentsHint")}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {sorted.map((agent) => {
            const fmNum = agent.fmWalletNumber ?? agent.accountNumber;
            const methods = agent.supportedMethods
              ? agent.supportedMethods.split(",").map((s: string) => s.trim()).filter(Boolean)
              : ["MonCash", "Cash"];
            return (
              <button
                key={agent.id}
                type="button"
                onClick={() => onSelect(agent)}
                className="group w-full rounded-2xl border border-slate-200/90 bg-white p-4 text-left shadow-sm transition-colors hover:border-emerald-400/50 hover:bg-emerald-50/40 dark:border-border dark:bg-card dark:hover:bg-emerald-950/20"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-lg font-black text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    {agent.fullName?.charAt(0) ?? "A"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-2">
                      <p className="truncate font-bold text-foreground">{agent.fullName}</p>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold",
                          agent.isOnline
                            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {agent.isOnline
                          ? t("wallet.agentOnline", { defaultValue: "Online" })
                          : t("wallet.agentOffline", { defaultValue: "Offline" })}
                      </span>
                    </div>
                    {agent.businessName && (
                      <p className="truncate text-xs text-muted-foreground">{agent.businessName}</p>
                    )}
                    <p className="text-xs text-muted-foreground">📍 {agent.city}</p>
                    {fmNum && <p className="mt-1 font-mono text-xs text-primary">FM: {fmNum}</p>}
                    <p className="mt-1 text-[11px] text-muted-foreground">{methods.join(" · ")}</p>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
