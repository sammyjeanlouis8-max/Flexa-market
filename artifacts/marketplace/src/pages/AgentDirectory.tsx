import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Users, MapPin, MessageCircle, Phone, Loader2,
  Wifi, WifiOff, Building2, RefreshCw, ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

function getToken() {
  return localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
}

async function apiGet(path: string) {
  const token = getToken();
  const r = await fetch(`/api${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function apiPost(path: string, body: unknown) {
  const token = getToken();
  const r = await fetch(`/api${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error ?? "Erè");
  return data;
}

interface Agent {
  id: number;
  userId: number;
  fullName: string;
  businessName: string | null;
  businessLocation: string | null;
  city: string;
  country: string;
  whatsappNumber: string;
  monthlyLimitUsd: number;
  isOnline: boolean;
  lastSeenAt: string | null;
  userAvatar: string | null;
  userName: string | null;
  exchangeRate: number | null;
  exchangeRateDop: number | null;
  saleType: string | null;
}

function timeAgo(date: string | null) {
  if (!date) return null;
  const diff = (Date.now() - new Date(date).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function AgentAvatar({ agent }: { agent: Agent }) {
  if (agent.userAvatar) {
    return (
      <img
        src={agent.userAvatar}
        alt={agent.fullName}
        className="w-14 h-14 rounded-2xl object-cover border border-border"
      />
    );
  }
  const initials = (agent.fullName || agent.userName || "A").charAt(0).toUpperCase();
  return (
    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-green-500/30 to-emerald-600/30 border border-green-500/30 flex items-center justify-center text-green-500 font-black text-xl shrink-0">
      {initials}
    </div>
  );
}

function AgentCard({ agent, onChat, chatLoading }: {
  agent: Agent;
  onChat: (agentUserId: number) => void;
  chatLoading: number | null;
}) {
  const { t } = useTranslation();
  const isChatLoading = chatLoading === agent.userId;

  return (
    <div className={cn(
      "rounded-2xl border bg-card p-4 shadow-sm transition-all",
      agent.isOnline
        ? "border-green-500/30 bg-green-500/5"
        : "border-border"
    )}>
      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <AgentAvatar agent={agent} />
          <div className={cn(
            "absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-background",
            agent.isOnline ? "bg-green-500" : "bg-muted-foreground/40"
          )} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <p className="font-bold text-foreground text-sm truncate">
              {agent.fullName}
            </p>
            <Badge
              variant="outline"
              className={cn(
                "text-xs shrink-0 border-0 px-2",
                agent.isOnline
                  ? "bg-green-500/15 text-green-500"
                  : "bg-muted/50 text-muted-foreground"
              )}
            >
              {agent.isOnline
                ? <><Wifi className="h-2.5 w-2.5 mr-1 inline" />{t("wallet.agentOnline")}</>
                : <><WifiOff className="h-2.5 w-2.5 mr-1 inline" />{t("wallet.agentOffline")}</>
              }
            </Badge>
          </div>

          {agent.businessName && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{agent.businessName}</span>
            </div>
          )}

          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3 shrink-0" />
            <span>{agent.city}, {agent.country}</span>
          </div>

          {!agent.isOnline && agent.lastSeenAt && (
            <p className="text-xs text-muted-foreground/60 mt-0.5">
              {timeAgo(agent.lastSeenAt)}
            </p>
          )}
        </div>
      </div>

      {(agent.exchangeRate || agent.exchangeRateDop || agent.saleType) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {agent.exchangeRate && (
            <span className="text-xs bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 rounded-full px-2.5 py-0.5 font-semibold">
              {t("wallet.agentExchangeRate")}: {agent.exchangeRate.toFixed(1)} HTG/$
            </span>
          )}
          {agent.exchangeRateDop && (
            <span className="text-xs bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 rounded-full px-2.5 py-0.5 font-semibold">
              {t("wallet.agentExchangeRateDop")}: {agent.exchangeRateDop.toFixed(1)} RD/$
            </span>
          )}
          {agent.saleType && (
            <span className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 rounded-full px-2.5 py-0.5 font-semibold">
              {t(`wallet.agentSaleType${agent.saleType.charAt(0).toUpperCase()}${agent.saleType.slice(1)}`)}
            </span>
          )}
        </div>
      )}

      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">${agent.monthlyLimitUsd.toLocaleString()}</span>
          <span className="ml-1">{t("wallet.agentLimit")}</span>
        </div>

        <div className="flex items-center gap-2">
          {agent.whatsappNumber && (
            <a
              href={`https://wa.me/${agent.whatsappNumber.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-green-600 hover:text-green-700 font-semibold border border-green-200 dark:border-green-800 rounded-lg px-2.5 py-1.5 hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
            >
              <Phone className="h-3 w-3" />
              WhatsApp
            </a>
          )}

          <Button
            size="sm"
            disabled={isChatLoading}
            onClick={() => onChat(agent.userId)}
            className="h-8 text-xs gap-1.5 bg-primary hover:bg-primary/90"
          >
            {isChatLoading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <MessageCircle className="h-3.5 w-3.5" />
            }
            {isChatLoading ? t("wallet.agentChatOpening") : t("wallet.agentChatBtn")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function AgentDirectory() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();

  const [filter, setFilter] = useState<"all" | "online">("all");
  const [chatLoading, setChatLoading] = useState<number | null>(null);

  const { data, isLoading, refetch } = useQuery<{ agents: Agent[] }>({
    queryKey: ["/agents/public", filter],
    queryFn: () => apiGet(`/agents/public${filter === "online" ? "?onlineOnly=1" : ""}`),
    enabled: !!user,
    refetchInterval: 30000,
  });

  const agents = data?.agents ?? [];

  const startChatMut = useMutation({
    mutationFn: (agentUserId: number) => apiPost(`/agents/${agentUserId}/start-chat`, {}),
    onSuccess: (data) => {
      setChatLoading(null);
      toast({
        title: t("wallet.agentChatOpened"),
        description: t("wallet.agentChatOpenedDesc"),
      });
      setLocation(`/messages/${data.conversationId}`);
    },
    onError: (e: Error) => {
      setChatLoading(null);
      toast({ title: t("wallet.agentChatError"), description: e.message, variant: "destructive" });
    },
  });

  function handleChat(agentUserId: number) {
    setChatLoading(agentUserId);
    startChatMut.mutate(agentUserId);
  }

  if (!user) { setLocation("/auth/login"); return null; }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setLocation("/wallet")}
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="flex-1">
            <h1 className="font-black text-base">{t("wallet.agentPageTitle")}</h1>
            <p className="text-xs text-muted-foreground">{t("wallet.agentPageSubtitle")}</p>
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4 pb-24">

        {/* ── Trust banner ─────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-950/20 p-3 flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-green-800 dark:text-green-400">{t("wallet.agentTrustBannerTitle")}</p>
            <p className="text-xs text-green-700 dark:text-green-500 mt-0.5">
              {t("wallet.agentTrustBannerDesc")}
            </p>
          </div>
        </div>

        {/* ── Filter tabs ──────────────────────────────────────────────────── */}
        <div className="flex gap-2">
          {(["all", "online"] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "flex-1 py-2 rounded-xl text-sm font-bold border transition-all",
                filter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card border-border text-muted-foreground hover:border-primary/30"
              )}
            >
              {f === "all" ? (
                <span className="flex items-center justify-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  {t("wallet.agentFilterAll")}
                </span>
              ) : (
                <span className="flex items-center justify-center gap-1.5">
                  <Wifi className="h-3.5 w-3.5" />
                  {t("wallet.agentFilterOnline")}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Agent list ───────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-2xl border bg-card p-4 animate-pulse space-y-3">
                <div className="flex gap-3">
                  <div className="w-14 h-14 bg-muted rounded-2xl" />
                  <div className="flex-1 space-y-2 pt-1">
                    <div className="h-4 bg-muted rounded w-2/3" />
                    <div className="h-3 bg-muted rounded w-1/2" />
                    <div className="h-3 bg-muted rounded w-1/3" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mx-auto">
              <Users className="h-8 w-8 text-muted-foreground" />
            </div>
            <p className="font-bold text-foreground">{t("wallet.agentNoAgents")}</p>
            <p className="text-sm text-muted-foreground max-w-xs mx-auto">{t("wallet.agentNoAgentsHint")}</p>
            <Button variant="outline" onClick={() => setLocation("/wallet")} className="mt-2">
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t("wallet.backToWallet")}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Online agents first indicator */}
            {agents.some(a => a.isOnline) && agents.some(a => !a.isOnline) && filter === "all" && (
              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-green-500 font-semibold flex items-center gap-1">
                  <Wifi className="h-3 w-3" />
                  {agents.filter(a => a.isOnline).length} online
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}
            {agents.map(agent => (
              <AgentCard
                key={agent.id}
                agent={agent}
                onChat={handleChat}
                chatLoading={chatLoading}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
