import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  Check, Crown, Zap, Star, Rocket, X, ChevronRight, Loader2, AlertCircle,
  Video, Eye, EyeOff, Infinity, RefreshCw, Calendar, CreditCard, AlertTriangle, ShieldCheck, Ban,
  ArrowLeft, Home, RotateCcw, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/auth";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Plan = {
  id: string;
  name: string;
  priceUsd: number;
  tier: number;
  videoEnabled: boolean;
  maxListings: number | null;
  featuredBadge: boolean;
  features: { key: string; count?: number }[];
};

type MySubscription = {
  plan: string;
  planName: string;
  tier: number;
  videoEnabled: boolean;
  maxListings: number | null;
  featuredBadge: boolean;
  priceUsd: number;
  expiresAt: string | null;
  isExpired: boolean;
  gracePeriodActive: boolean;
  graceUntil: string | null;
  nextBillingDate: string | null;
  cancelAtPeriodEnd: boolean;
  status: string;
  stripeSubscriptionId: string | null;
};

const PLAN_ICONS: Record<string, any> = {
  basic: Zap, standard: Star, premium: Rocket, vip: Crown,
};

const PLAN_COLORS: Record<string, {
  accent: string; accentLight: string; border: string; activeBorder: string;
  btnBg: string; iconColor: string; badgeBg: string;
}> = {
  basic: {
    accent:       "text-muted-foreground",
    accentLight:  "bg-muted/30",
    border:       "border-border",
    activeBorder: "border-border ring-1 ring-foreground/10",
    btnBg:        "bg-foreground text-background hover:bg-foreground/90",
    iconColor:    "text-muted-foreground",
    badgeBg:      "bg-muted text-muted-foreground",
  },
  standard: {
    accent:       "text-blue-600",
    accentLight:  "bg-blue-50 dark:bg-blue-950/20",
    border:       "border-blue-200 dark:border-blue-800/50",
    activeBorder: "border-blue-400 ring-1 ring-blue-400/30",
    btnBg:        "bg-blue-600 hover:bg-blue-700 text-white",
    iconColor:    "text-blue-500",
    badgeBg:      "bg-blue-100 dark:bg-blue-900/40 text-blue-600",
  },
  premium: {
    accent:       "text-primary",
    accentLight:  "bg-primary/5",
    border:       "border-primary/30",
    activeBorder: "border-primary ring-1 ring-primary/30",
    btnBg:        "bg-primary hover:bg-primary/90 text-primary-foreground",
    iconColor:    "text-primary",
    badgeBg:      "bg-primary/10 text-primary",
  },
  vip: {
    accent:       "text-amber-600",
    accentLight:  "bg-amber-50 dark:bg-amber-950/20",
    border:       "border-amber-300 dark:border-amber-700/50",
    activeBorder: "border-amber-400 ring-1 ring-amber-400/30",
    btnBg:        "bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:opacity-90",
    iconColor:    "text-amber-500",
    badgeBg:      "bg-amber-100 dark:bg-amber-900/40 text-amber-600",
  },
};

function fmtDate(iso: string | null, lang: string): string {
  if (!iso) return "—";
  const locale = lang === "ht" ? "fr-HT" : lang === "pt" ? "pt-BR" : lang;
  return new Date(iso).toLocaleDateString(locale, { day: "numeric", month: "long", year: "numeric" });
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000));
}

export default function Subscription() {
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;

  const [plans, setPlans] = useState<Plan[]>([]);
  const [mySub, setMySub] = useState<MySubscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [subscribing, setSubscribing] = useState<string | null>(null);
  const [checkoutTimedOut, setCheckoutTimedOut] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [uncancelLoading, setUncancelLoading] = useState(false);
  const checkoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [walletRetryLoading, setWalletRetryLoading] = useState(false);

  // Payment method picker
  const [payMethodOpen, setPayMethodOpen] = useState(false);
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<{ real: number; promo: number } | null>(null);
  const [walletLoading, setWalletLoading] = useState(false);
  const [selectedPayMethod, setSelectedPayMethod] = useState<"wallet" | "card">("wallet");

  const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
  const successPlan = params.get("success") ? params.get("plan") : null;

  useEffect(() => {
    if (successPlan) {
      toast({
        title: t("subscription.planActivated", { plan: successPlan }),
        description: t("subscription.planActivatedDesc"),
      });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  // Redirect to an external URL (Stripe checkout / billing portal).
  // In the Replit dev-preview the app runs inside an iframe; Stripe refuses
  // to load inside iframes (X-Frame-Options: DENY), which produces the blank
  // page. We break out to the top-level window when possible.
  const redirectToExternal = useCallback((url: string) => {
    try {
      if (window.top && window.top !== window) {
        window.top.location.href = url;
        return;
      }
    } catch {
      // Cross-origin iframe — can't access top, fall through
    }
    window.location.href = url;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      const [r1, r2, r3] = await Promise.all([
        fetch("/api/subscription/plans", { signal: controller.signal }),
        tk
          ? fetch("/api/subscription/my", { headers: { Authorization: `Bearer ${tk}` }, signal: controller.signal })
          : Promise.resolve(null),
        tk
          ? fetch("/api/subscription/hidden-listings", { headers: { Authorization: `Bearer ${tk}` }, signal: controller.signal })
          : Promise.resolve(null),
      ]);
      clearTimeout(timer);
      if (r1.ok) setPlans(await r1.json());
      if (r2?.ok) setMySub(await r2.json());
      if (r3?.ok) { const d = await r3.json(); setHiddenCount(d.count ?? 0); }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [user]);

  // Start a 6-second countdown when a checkout is in progress.
  // If Stripe hasn't redirected by then, show the escape options.
  useEffect(() => {
    if (subscribing) {
      setCheckoutTimedOut(false);
      checkoutTimerRef.current = setTimeout(() => setCheckoutTimedOut(true), 6000);
    } else {
      setCheckoutTimedOut(false);
      if (checkoutTimerRef.current) clearTimeout(checkoutTimerRef.current);
    }
    return () => {
      if (checkoutTimerRef.current) clearTimeout(checkoutTimerRef.current);
    };
  }, [subscribing]);

  // Open payment method picker and pre-load wallet balance
  const openPayDialog = async (planId: string) => {
    if (!user) { setLocation("/auth/login"); return; }
    setPendingPlanId(planId);
    setSelectedPayMethod("wallet");
    setPayMethodOpen(true);
    // Load wallet balance
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/wallet/balance", { headers: { Authorization: `Bearer ${tk}` } });
      if (res.ok) {
        const d = await res.json();
        setWalletBalance({ real: d.balanceUsd ?? 0, promo: d.promoBalance ?? 0 });
      }
    } catch { /* ignore */ }
  };

  // Subscribe via FM Wallet
  const subscribeWithWallet = async () => {
    if (!pendingPlanId) return;
    setWalletLoading(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/subscription/wallet-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ plan: pendingPlanId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 402) {
          toast({
            title: "Balans pa ase",
            description: `Ou bezwen $${data.needed?.toFixed(2)} — ou gen $${((data.realBalance ?? 0) + (data.promoBalance ?? 0)).toFixed(2)}`,
            variant: "destructive",
          });
        } else {
          toast({ title: data.error || t("subscription.paymentUnavailable"), variant: "destructive" });
        }
        return;
      }
      setPayMethodOpen(false);
      toast({
        title: t("subscription.planActivated", { plan: pendingPlanId }),
        description: t("subscription.planActivatedDesc"),
      });
      await load();
    } catch {
      toast({ title: t("subscription.paymentUnavailable"), variant: "destructive" });
    } finally {
      setWalletLoading(false);
    }
  };

  // Subscribe via Stripe card
  const subscribeWithCard = async (planId: string) => {
    setSubscribing(planId);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk}` },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || t("subscription.paymentUnavailable"), variant: "destructive" });
        return;
      }
      if (!data.url) {
        toast({ title: t("subscription.paymentUnavailable"), variant: "destructive" });
        return;
      }
      redirectToExternal(data.url);
    } catch {
      toast({ title: t("subscription.paymentUnavailable"), variant: "destructive" });
    } finally {
      setSubscribing(null);
    }
  };

  // Legacy alias kept for any references
  const subscribe = openPayDialog;

  const openPortal = async () => {
    setPortalLoading(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/subscription/portal", { method: "POST", headers: { Authorization: `Bearer ${tk}` } });
      const data = await res.json();
      if (res.ok && data.url) {
        redirectToExternal(data.url);
      } else {
        toast({ title: data.error || t("errors.somethingWrong"), variant: "destructive" });
      }
    } catch {
      toast({ title: t("errors.somethingWrong"), variant: "destructive" });
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCancel = async () => {
    setCancelLoading(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/subscription/cancel", { method: "POST", headers: { Authorization: `Bearer ${tk}` } });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error || t("errors.somethingWrong"), variant: "destructive" }); return; }
      toast({
        title: t("subscription.cancelled"),
        description: t("subscription.cancelledDesc", { date: fmtDate(data.accessUntil ?? mySub?.expiresAt ?? null, lang) }),
      });
      setCancelDialogOpen(false);
      await load();
    } finally {
      setCancelLoading(false);
    }
  };

  const handleWalletRetry = async () => {
    setWalletRetryLoading(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/subscription/wallet-retry", { method: "POST", headers: { Authorization: `Bearer ${tk}` } });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: data.error || t("errors.somethingWrong"), variant: "destructive" });
        return;
      }
      toast({ title: t("subscription.walletRetrySuccess", "Abònman renouvle!"), description: t("subscription.walletRetryDesc", "Tout anons ou yo vizib kounye a.") });
      setHiddenCount(0);
      await load();
    } catch {
      toast({ title: t("errors.somethingWrong"), variant: "destructive" });
    } finally {
      setWalletRetryLoading(false);
    }
  };

  const handleUncancel = async () => {
    setUncancelLoading(true);
    try {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/subscription/uncancel", { method: "POST", headers: { Authorization: `Bearer ${tk}` } });
      const data = await res.json();
      if (!res.ok) { toast({ title: data.error || t("errors.somethingWrong"), variant: "destructive" }); return; }
      toast({ title: t("subscription.reactivated"), description: t("subscription.reactivatedDesc") });
      await load();
    } finally {
      setUncancelLoading(false);
    }
  };

  const currentPlanId = mySub?.plan ?? "basic";
  const isExpired = mySub?.isExpired ?? false;
  const isGrace = mySub?.gracePeriodActive ?? false;

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 pb-16 pt-6">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> {t("subscription.backToHome")}
        </button>
        <div className="flex items-center justify-center py-16 gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">{t("subscription.loadingPlans")}</span>
        </div>
      </div>
    );
  }

  if (loadError && plans.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 pb-16 pt-6">
        <button
          onClick={() => setLocation("/")}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> {t("subscription.backToHome")}
        </button>
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground/50" />
          <div>
            <p className="text-sm font-medium">{t("subscription.loadFailed")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("subscription.loadFailedDesc")}</p>
          </div>
          <div className="flex gap-2 mt-2">
            <Button size="sm" variant="outline" onClick={load} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" /> {t("subscription.retry")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setLocation("/")} className="gap-1.5">
              <Home className="h-3.5 w-3.5" /> {t("errors.goHome")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pb-16 pt-6">

      {/* ── Checkout redirect overlay ──────────────────────────────────────── */}
      {subscribing && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-background/95 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <div className="text-center">
            <p className="text-sm font-medium">{t("subscription.redirectingToCheckout")}</p>
            <p className="text-xs text-muted-foreground mt-1">{t("subscription.redirectingDesc")}</p>
          </div>
          {checkoutTimedOut && (
            <div className="flex flex-col items-center gap-3 mt-2 border border-border rounded-xl p-4 bg-card max-w-xs w-full mx-4">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              <p className="text-xs text-center text-muted-foreground">{t("subscription.checkoutTakingLong")}</p>
              <div className="flex gap-2 w-full">
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1 gap-1.5 text-xs"
                  onClick={() => setSubscribing(null)}
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> {t("subscription.backToPlans")}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="flex-1 gap-1.5 text-xs"
                  onClick={() => setLocation("/")}
                >
                  <Home className="h-3.5 w-3.5" /> {t("errors.goHome")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Page header ───────────────────────────────────────────────────── */}
      <div className="text-center mb-8">
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-primary/8 px-2.5 py-1 rounded-full mb-3">
          <Crown className="h-3 w-3" />
          {t("subscription.badge")}
        </p>
        <h1 className="text-xl font-semibold tracking-tight mb-1">{t("subscription.title")}</h1>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">{t("subscription.subtitle")}</p>
      </div>

      {/* ── Active subscription status bar ────────────────────────────────── */}
      {user && mySub && mySub.plan !== "basic" && (
        <div className={`mb-6 rounded-xl border px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3 ${
          isGrace
            ? "border-amber-400/50 bg-amber-50/60 dark:bg-amber-950/20"
            : isExpired
              ? "border-red-400/40 bg-red-50/50 dark:bg-red-950/20"
              : mySub.cancelAtPeriodEnd
                ? "border-yellow-400/40 bg-yellow-50/50 dark:bg-yellow-950/20"
                : "border-border bg-card"
        }`}>
          {/* Left: plan info */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            {(() => {
              const Icon = PLAN_ICONS[mySub.plan] ?? Crown;
              const c = PLAN_COLORS[mySub.plan] ?? PLAN_COLORS.basic;
              return <Icon className={`h-4 w-4 shrink-0 ${c.iconColor}`} />;
            })()}
            <div className="min-w-0">
              <span className="text-sm font-semibold">{mySub.planName}</span>
              <span className="text-xs text-muted-foreground ml-2">
                {t("subscription.billedMonthlyDetail", { amount: mySub.priceUsd })}
              </span>
            </div>
            {/* Status pill */}
            {isGrace ? (
              <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400">
                <AlertTriangle className="h-2.5 w-2.5" /> {t("subscription.statusGrace")}
              </span>
            ) : isExpired ? (
              <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600">
                <AlertCircle className="h-2.5 w-2.5" /> {t("subscription.statusExpired")}
              </span>
            ) : mySub.cancelAtPeriodEnd ? (
              <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700">
                <Ban className="h-2.5 w-2.5" /> {t("subscription.statusCancelling")}
              </span>
            ) : (
              <span className="shrink-0 inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                <ShieldCheck className="h-2.5 w-2.5" /> {t("subscription.statusActive")}
              </span>
            )}
          </div>

          {/* Middle: billing dates */}
          <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
            {mySub.nextBillingDate && !mySub.cancelAtPeriodEnd && !isExpired && !isGrace && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {t("subscription.nextBilling")}: <strong className="text-foreground ml-0.5">{fmtDate(mySub.nextBillingDate, lang)}</strong>
                {(() => { const d = daysUntil(mySub.nextBillingDate); return d !== null && d <= 7 ? <span className="text-amber-600 ml-1">({t("subscription.inDays", { count: d })})</span> : null; })()}
              </span>
            )}
            {mySub.expiresAt && (
              <span className="flex items-center gap-1 flex-wrap">
                <Calendar className="h-3 w-3 shrink-0" />
                {mySub.cancelAtPeriodEnd ? t("subscription.accessUntil") : isExpired ? t("subscription.expiredLabel") : t("subscription.periodEnds")}:
                <strong className="text-foreground ml-0.5">{fmtDate(mySub.expiresAt, lang)}</strong>
                {mySub.cancelAtPeriodEnd && (() => {
                  const d = daysUntil(mySub.expiresAt);
                  if (d === null) return null;
                  if (d === 0) return <span className="text-red-600 font-semibold ml-1">(Dènye jou)</span>;
                  return <span className="text-yellow-600 dark:text-yellow-400 font-semibold ml-1">({d} jou rete)</span>;
                })()}
              </span>
            )}
          </div>

          {/* Right: actions */}
          {!isExpired && (
            <div className="flex items-center gap-2 shrink-0">
              {mySub.cancelAtPeriodEnd ? (
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleUncancel} disabled={uncancelLoading}>
                  {uncancelLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  {t("subscription.reactiveBtn")}
                </Button>
              ) : (
                <>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openPortal} disabled={portalLoading}>
                    {portalLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : t("subscription.manageBilling")}
                  </Button>
                  <Button
                    size="sm" variant="outline"
                    className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-950/30 gap-1"
                    onClick={() => setCancelDialogOpen(true)}
                  >
                    <X className="h-3 w-3" />
                    {t("subscription.cancelBtn", { defaultValue: "Anile Plan" })}
                  </Button>
                </>
              )}
            </div>
          )}

          {/* Grace period warning inline */}
          {isGrace && (
            <div className="w-full flex items-start gap-2 pt-1 border-t border-amber-400/30 mt-1">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">{t("subscription.graceAlert")}</p>
                <p className="text-xs text-amber-600 dark:text-amber-500">{t("subscription.graceDesc", { date: fmtDate(mySub.graceUntil, lang) })}</p>
              </div>
              <Button size="sm" className="h-6 text-xs px-2 bg-amber-500 hover:bg-amber-600 text-white shrink-0" onClick={openPortal} disabled={portalLoading}>
                {portalLoading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : t("subscription.updatePayment")}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Grace-expired basic user notice */}
      {user && mySub && mySub.plan === "basic" && isExpired && (
        <div className="mb-5 rounded-xl border border-red-300/60 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800/40 px-4 py-3 flex items-start gap-2.5">
          <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-600">{t("subscription.expiredBanner")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{t("subscription.expiredBannerDesc")}</p>
          </div>
        </div>
      )}

      {/* Hidden listings banner */}
      {user && hiddenCount > 0 && (
        <div className="mb-5 rounded-xl border border-orange-400/50 bg-orange-50/60 dark:bg-orange-950/20 dark:border-orange-700/40 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-start gap-2.5 flex-1">
            <EyeOff className="h-4 w-4 text-orange-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">
                {hiddenCount === 1
                  ? t("subscription.hiddenListingsBanner", "1 anons kache akòz abònman ekspire")
                  : t("subscription.hiddenListingsBannerPlural", "{{count}} anons kache akòz abònman ekspire", { count: hiddenCount })}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("subscription.hiddenListingsDesc", "Renouvle abònman ou pou fè yo vizib ankò.")}
              </p>
            </div>
          </div>
          {/* Only show wallet-retry button if user has a wallet subscription */}
          {mySub && !mySub.stripeSubscriptionId && (
            <Button
              size="sm"
              className="bg-orange-500 hover:bg-orange-600 text-white shrink-0 gap-1.5"
              onClick={handleWalletRetry}
              disabled={walletRetryLoading}
            >
              {walletRetryLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {t("subscription.payNowBtn", "Peye kounye a")}
            </Button>
          )}
        </div>
      )}

      {/* ── Plans grid ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {plans.map((plan) => {
          const c = PLAN_COLORS[plan.id] ?? PLAN_COLORS.basic;
          const Icon = PLAN_ICONS[plan.id] ?? Zap;
          const isCurrent = currentPlanId === plan.id && !isExpired;
          const isPopular = plan.id === "premium";
          const isCurrentPaid = isCurrent && plan.priceUsd > 0;

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-xl border bg-card transition-shadow hover:shadow-sm ${
                isCurrent ? c.activeBorder : c.border
              } ${isCurrent ? c.accentLight : ""}`}
            >
              {/* Top badge */}
              {(isPopular && !isCurrent) && (
                <div className="absolute -top-2.5 left-0 right-0 flex justify-center">
                  <span className="text-[10px] font-semibold bg-primary text-primary-foreground px-2.5 py-0.5 rounded-full">
                    {t("subscription.mostPopular")}
                  </span>
                </div>
              )}
              {isCurrent && (
                <div className="absolute -top-2.5 left-0 right-0 flex justify-center">
                  <span className={`text-[10px] font-semibold px-2.5 py-0.5 rounded-full flex items-center gap-1 ${c.badgeBg}`}>
                    <Check className="h-2.5 w-2.5" /> {t("subscription.currentPlanBadge")}
                  </span>
                </div>
              )}

              <div className="p-4 flex flex-col gap-3 flex-1">
                {/* Plan name + icon */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`h-4 w-4 ${c.iconColor}`} />
                    <span className="text-sm font-semibold">{plan.name}</span>
                  </div>
                  {plan.featuredBadge && (
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.badgeBg}`}>VIP</span>
                  )}
                </div>

                {/* Price */}
                <div>
                  {plan.priceUsd === 0 ? (
                    <span className="text-lg font-bold">{t("subscription.free")}</span>
                  ) : (
                    <div className="flex items-baseline gap-0.5">
                      <span className="text-xl font-bold">${plan.priceUsd}</span>
                      <span className="text-xs text-muted-foreground">{t("subscription.monthly")}</span>
                    </div>
                  )}
                  {plan.priceUsd > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{t("subscription.cancelAnytime")}</p>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-border/60" />

                {/* Key specs — compact inline */}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="flex items-center gap-1">
                    {plan.maxListings
                      ? <><span className="font-medium text-foreground">{plan.maxListings}</span> lis</>
                      : <><Infinity className="h-3 w-3" /> <span className="font-medium text-foreground">{t("subscription.unlimited")}</span></>
                    }
                  </span>
                  <span className={`flex items-center gap-1 ${plan.videoEnabled ? "text-green-600" : ""}`}>
                    <Video className="h-3 w-3" />
                    {plan.videoEnabled ? t("subscription.video") : t("subscription.noVideo")}
                  </span>
                  <span className={`flex items-center gap-1 ${plan.tier >= 2 ? c.accent : ""}`}>
                    <Eye className="h-3 w-3" />
                    {plan.tier === 0 ? t("subscription.visNormal")
                      : plan.tier === 1 ? t("subscription.visAbove")
                      : plan.tier === 2 ? t("subscription.visSuperior")
                      : t("subscription.visTop")}
                  </span>
                </div>

                {/* Feature list */}
                <ul className="space-y-1.5 flex-1">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                      <span className={`mt-0.5 h-1.5 w-1.5 rounded-full shrink-0 ${isCurrent ? c.iconColor.replace("text-", "bg-") : "bg-muted-foreground/40"}`} />
                      {t(f.key, f.count !== undefined ? { count: f.count } : undefined)}
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                <div className="pt-1">
                  {plan.priceUsd === 0 ? (
                    isCurrent ? (
                      <div className="text-center text-[11px] text-muted-foreground py-1.5 border border-border/60 rounded-lg">
                        {t("subscription.activePlan")}
                      </div>
                    ) : (
                      <div className="text-center text-[11px] text-muted-foreground py-1.5">
                        {t("subscription.defaultPlan")}
                      </div>
                    )
                  ) : isCurrentPaid ? (
                    <div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full h-8 text-xs"
                        onClick={openPortal}
                        disabled={portalLoading}
                      >
                        {portalLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : t("subscription.manageMyPlan")}
                      </Button>
                      {mySub?.nextBillingDate && !mySub.cancelAtPeriodEnd && (
                        <p className="text-[10px] text-center text-muted-foreground mt-1.5">
                          {t("subscription.nextBillingLabel", { date: fmtDate(mySub.nextBillingDate, lang) })}
                        </p>
                      )}
                      {mySub?.cancelAtPeriodEnd && (
                        <p className="text-[10px] text-center text-yellow-600 mt-1.5">
                          {t("subscription.accessUntilExpiry", { date: fmtDate(mySub.expiresAt, lang) })}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div>
                      <Button
                        size="sm"
                        className={`w-full h-8 text-xs font-semibold ${c.btnBg}`}
                        onClick={() => subscribe(plan.id)}
                        disabled={!!subscribing}
                      >
                        {subscribing === plan.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : currentPlanId !== "basic" && plan.tier > (mySub?.tier ?? 0)
                          ? t("subscription.upgradePlan")
                          : currentPlanId !== "basic"
                            ? t("subscription.changePlan")
                            : t("subscription.start")}
                      </Button>
                      <p className="text-[10px] text-center text-muted-foreground mt-1.5">
                        {t("subscription.pricePerMonth", { price: plan.priceUsd })}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Visibility chart ──────────────────────────────────────────────── */}
      <div className="mt-8 bg-card border border-border rounded-xl p-4">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4 flex items-center gap-1.5">
          <Eye className="h-3.5 w-3.5" />
          {t("subscription.visTitle")}
        </h3>
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Basic",    desc: t("subscription.visNormal"),   color: "bg-muted/50",      height: "h-4" },
            { label: "Standard", desc: t("subscription.visAbove"),    color: "bg-blue-400/40",   height: "h-8" },
            { label: "Premium",  desc: t("subscription.visSuperior"), color: "bg-primary/40",    height: "h-12" },
            { label: "VIP",      desc: t("subscription.visTop"),      color: "bg-amber-400/50",  height: "h-16" },
          ].map((item) => (
            <div key={item.label} className="text-center">
              <div className="flex items-end justify-center mb-1.5 h-16">
                <div className={`w-full rounded-t ${item.color} ${item.height}`} />
              </div>
              <p className="text-xs font-medium">{item.label}</p>
              <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── FAQ ───────────────────────────────────────────────────────────── */}
      <div className="mt-5 border border-border rounded-xl overflow-hidden divide-y divide-border">
        {[
          { q: t("subscription.faq1Q"), a: t("subscription.faq1A", { days: 5 }) },
          { q: t("subscription.faq2Q"), a: t("subscription.faq2A") },
          { q: t("subscription.faq3Q"), a: t("subscription.faq3A") },
          { q: t("subscription.faq4Q"), a: t("subscription.faq4A") },
          { q: t("subscription.faq5Q"), a: t("subscription.faq5A") },
        ].map((faq, i) => (
          <details key={i} className="group bg-card">
            <summary className="flex items-center justify-between gap-3 px-4 py-3 text-sm font-medium cursor-pointer list-none select-none">
              {faq.q}
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform group-open:rotate-90" />
            </summary>
            <p className="px-4 pb-3 pt-0 text-xs text-muted-foreground leading-relaxed">{faq.a}</p>
          </details>
        ))}
      </div>

      {/* ── Cancel dialog ─────────────────────────────────────────────────── */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              {t("subscription.cancelTitle")}
            </DialogTitle>
            <DialogDescription className="space-y-1.5 pt-1 text-xs">
              <span className="block">{t("subscription.cancelBody1", { date: fmtDate(mySub?.expiresAt ?? null, lang) })}</span>
              <span className="block">{t("subscription.cancelBody2")}</span>
              <span className="block text-muted-foreground">{t("subscription.cancelNote")}</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setCancelDialogOpen(false)} disabled={cancelLoading}>
              {t("subscription.cancelKeepBtn")}
            </Button>
            <Button variant="destructive" size="sm" onClick={handleCancel} disabled={cancelLoading} className="gap-1.5">
              {cancelLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
              {t("subscription.cancelConfirmBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Payment method picker dialog ──────────────────────────────────── */}
      <Dialog open={payMethodOpen} onOpenChange={v => { if (!walletLoading && !subscribing) setPayMethodOpen(v); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <span className="text-lg">💳</span>
              Chwazi metòd pèman
            </DialogTitle>
            <DialogDescription className="text-xs">
              {pendingPlanId && plans.find(p => p.id === pendingPlanId) && (
                <>Plan <strong>{plans.find(p => p.id === pendingPlanId)!.name}</strong> — <strong>${plans.find(p => p.id === pendingPlanId)!.priceUsd}/mwa</strong></>
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            {/* ── Option 1: Kat FM Wallet (FIRST) ── */}
            <button
              type="button"
              onClick={() => setSelectedPayMethod("wallet")}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left",
                selectedPayMethod === "wallet"
                  ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30 shadow-sm"
                  : "border-border bg-card hover:border-violet-300 hover:bg-violet-50/50 dark:hover:bg-violet-950/10"
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                selectedPayMethod === "wallet" ? "border-violet-500" : "border-muted-foreground/40"
              )}>
                {selectedPayMethod === "wallet" && <div className="w-2.5 h-2.5 rounded-full bg-violet-500" />}
              </div>
              <div className="w-11 h-11 rounded-xl bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0 text-xl">
                💳
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold text-sm">Kat FM</p>
                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-violet-200 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 uppercase tracking-wide">Otomatik ⚡</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {walletBalance !== null
                    ? `Balans: $${walletBalance.real.toFixed(2)}${walletBalance.promo > 0 ? ` + $${walletBalance.promo.toFixed(2)} promo` : ""} = $${(walletBalance.real + walletBalance.promo).toFixed(2)}`
                    : "Chaje balans…"}
                </p>
                <p className="text-[10px] text-violet-600 dark:text-violet-400 mt-0.5">Dédwi dirèkteman — entansif ⚡</p>
              </div>
            </button>

            {/* ── Option 2: Stripe Card (SECOND) ── */}
            <button
              type="button"
              onClick={() => setSelectedPayMethod("card")}
              className={cn(
                "w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left",
                selectedPayMethod === "card"
                  ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 shadow-sm"
                  : "border-border bg-card hover:border-blue-300 hover:bg-blue-50/50 dark:hover:bg-blue-950/10"
              )}
            >
              <div className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                selectedPayMethod === "card" ? "border-blue-500" : "border-muted-foreground/40"
              )}>
                {selectedPayMethod === "card" && <div className="w-2.5 h-2.5 rounded-full bg-blue-500" />}
              </div>
              <div className="w-11 h-11 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                <CreditCard className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">Kat Kredi / Debi</p>
                <p className="text-xs text-muted-foreground mt-0.5">Visa, Mastercard, Apple Pay, SEPA</p>
                <p className="text-[10px] text-blue-600 dark:text-blue-400 mt-0.5">Renouvèlman otomatik chak mwa via Stripe</p>
              </div>
            </button>
          </div>

          <DialogFooter className="gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPayMethodOpen(false)}
              disabled={walletLoading || !!subscribing}
            >
              Anile
            </Button>
            <Button
              size="sm"
              className={selectedPayMethod === "wallet"
                ? "bg-violet-600 hover:bg-violet-700 text-white gap-1.5"
                : "bg-blue-600 hover:bg-blue-700 text-white gap-1.5"}
              disabled={walletLoading || !!subscribing}
              onClick={() => {
                if (selectedPayMethod === "wallet") {
                  subscribeWithWallet();
                } else if (pendingPlanId) {
                  setPayMethodOpen(false);
                  subscribeWithCard(pendingPlanId);
                }
              }}
            >
              {(walletLoading || subscribing === pendingPlanId) && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {selectedPayMethod === "wallet" ? "Peye ak Kat FM" : "Kontinye ak Stripe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
