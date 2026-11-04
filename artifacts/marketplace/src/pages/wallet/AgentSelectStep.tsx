import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Users, Loader2, ChevronRight, ArrowLeft } from "lucide-react";

function BackButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button onClick={onClick} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
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
  const online = agents.filter(a => a.isOnline);
  const offline = agents.filter(a => !a.isOnline);
  const sorted = [...online, ...offline];

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-4">
      <BackButton onClick={onBack} />
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Users className="h-6 w-6 text-green-500" />
          <h1 className="text-2xl font-black">Chwazi Ajan Otorize</h1>
        </div>
        <p className="text-sm text-muted-foreground">Retire <strong>${parseFloat(cashoutAmount || "0").toFixed(2)}</strong> — chwazi yon ajan ki disponib</p>
      </div>

      {online.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs font-bold text-green-600">{online.length} ajan online kounye a</span>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <Users className="h-12 w-12 text-muted-foreground mx-auto" />
          <p className="font-bold">Pa gen ajan disponib nan peyi ou a</p>
          <p className="text-sm text-muted-foreground">Eseye pita oswa chwazi yon lòt metòd retrait</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(agent => {
            const fmNum = agent.fmWalletNumber ?? agent.accountNumber;
            const methods = agent.supportedMethods
              ? agent.supportedMethods.split(",").map((s: string) => s.trim()).filter(Boolean)
              : ["MonCash", "Cash"];
            return (
              <button
                key={agent.id}
                onClick={() => onSelect(agent)}
                className="w-full text-left rounded-2xl border-2 border-border bg-card hover:border-green-400/50 hover:bg-green-50/30 dark:hover:bg-green-950/10 transition-all p-4"
              >
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-700 dark:text-green-400 font-black text-lg shrink-0">
                    {agent.fullName?.charAt(0) ?? "A"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-bold text-foreground truncate">{agent.fullName}</p>
                      <span className={cn(
                        "text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
                        agent.isOnline ? "bg-green-500/15 text-green-600 dark:text-green-400" : "bg-muted text-muted-foreground"
                      )}>
                        {agent.isOnline ? "🟢 ONLINE" : "⚫ OFFLINE"}
                      </span>
                    </div>
                    {agent.businessName && <p className="text-xs text-muted-foreground truncate">{agent.businessName}</p>}
                    <p className="text-xs text-muted-foreground">📍 {agent.city}</p>
                    {fmNum && (
                      <p className="text-xs font-mono text-primary mt-1">FM: {fmNum}</p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {methods.slice(0, 3).map((m: string) => (
                        <span key={m} className="text-[9px] font-semibold bg-muted px-1.5 py-0.5 rounded-full">{m}</span>
                      ))}
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 mt-1" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
