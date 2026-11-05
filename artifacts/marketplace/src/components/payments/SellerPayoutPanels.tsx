import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import {
  CheckCircle2, Clock, Loader2, Smartphone, AlertCircle, Save, CreditCard,
  ExternalLink, AlertTriangle, XCircle, Lock, UserCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { isStripeOnlySellerCountry } from "@/lib/paymentCountries";

export async function handOffStripeUrlToBrowser(url: string, promptText: string): Promise<boolean> {
  const nativeBridge = (window as typeof window & {
    ReactNativeWebView?: { postMessage(message: string): void };
  }).ReactNativeWebView;
  if (!nativeBridge) return false;

  try {
    await navigator.clipboard.writeText(url);
  } catch {
    const input = document.createElement("textarea");
    input.value = url;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    if (!copied) window.prompt(promptText, url);
  }
  return true;
}

// ─── Types ─────────────────────────────────────────────────────────────────────
export interface PayoutAccount {
  id: number;
  moncashNumber: string | null;
  moncashVerified: boolean;
  moncashVerifiedAt: string | null;
  moncashRejectedReason: string | null;
  bankName: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankVerified: boolean;
  bankVerifiedAt: string | null;
  bankRejectedReason: string | null;
  cardPayoutMethod: "fm_wallet" | "stripe" | null;
}

// ─── Stripe Connect Panel (Stripe-supported countries) ────────────────────────
export function StripeConnectPanel({ required = false }: { required?: boolean }) {
  const [status, setStatus] = useState<string>("not_connected");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const { t } = useTranslation();
  const { token } = useAuth();

  useEffect(() => {
    if (!token) return;
    fetch("/api/stripe/connect/status", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStatus(d.stripeAccountStatus ?? "not_connected"); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  const startOnboarding = async () => {
    if (!token) {
      setActionError(t("settings.stripeSessionExpired"));
      return;
    }
    setActionError(null);
    setActionNotice(null);
    setActionLoading(true);
    try {
      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(
          data.code === "STRIPE_CONNECT_PLATFORM_PROFILE_REQUIRED"
            ? t("settings.stripePlatformProfileRequired")
            : t("settings.stripeConnectError"),
        );
      }
      if (await handOffStripeUrlToBrowser(data.url, t("settings.stripeExternalBrowserPrompt"))) {
        setActionNotice(t("settings.stripeExternalBrowserCopied"));
        return;
      }
      window.location.assign(data.url);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("settings.stripeConnectError"));
    }
    finally { setActionLoading(false); }
  };

  const openDashboard = async () => {
    if (!token) {
      setActionError(t("settings.stripeSessionExpired"));
      return;
    }
    setActionError(null);
    setActionNotice(null);
    setActionLoading(true);
    try {
      const res = await fetch("/api/stripe/connect/dashboard", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(t("settings.stripeDashboardError"));
      if (await handOffStripeUrlToBrowser(data.url, t("settings.stripeExternalBrowserPrompt"))) {
        setActionNotice(t("settings.stripeExternalBrowserCopied"));
        return;
      }
      window.location.assign(data.url);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("settings.stripeDashboardError"));
    }
    finally { setActionLoading(false); }
  };

  const isActive = status === "active";
  const isConnected = status === "connected";
  const isPending = status === "pending";

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">Stripe Connect</span>
          {required && <Badge className="ml-1 bg-primary/10 text-primary border-0 text-[10px]">{t("settings.required")}</Badge>}
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />
          ) : isActive || isConnected ? (
            <Badge className="ml-auto bg-green-100 text-green-700 border-0 text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />{t("settings.connected")} ✅
            </Badge>
          ) : isPending ? (
            <Badge className="ml-auto bg-yellow-100 text-yellow-700 border-0 text-xs">
              <Clock className="h-3 w-3 mr-1" />{t("settings.pending")}
            </Badge>
          ) : (
            <Badge className="ml-auto bg-muted text-muted-foreground border-0 text-xs">
              <XCircle className="h-3 w-3 mr-1" />{t("settings.notConnected")}
            </Badge>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {isActive ? (
          <>
            <p className="text-sm text-muted-foreground">{t("settings.stripeActiveDesc")}</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />{t("settings.bulletAutoNoWait")}</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />{t("settings.bulletPaydays")}</li>
            </ul>
            <Button size="sm" variant="outline" onClick={openDashboard} disabled={actionLoading} className="w-full">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
              {t("settings.stripeDashboard")}
            </Button>
          </>
        ) : isConnected ? (
          <>
            <p className="text-sm text-muted-foreground">{t("settings.stripeConnectedPendingDesc")}</p>
            <Button size="sm" onClick={startOnboarding} disabled={actionLoading} className="w-full">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
              {t("settings.stripeReviewBtn")}
            </Button>
          </>
        ) : isPending ? (
          <>
            <p className="text-sm text-muted-foreground">{t("settings.stripePendingDesc")}</p>
            <Button size="sm" onClick={startOnboarding} disabled={actionLoading} className="w-full">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
              {t("settings.stripeCompleteBtn")}
            </Button>
          </>
        ) : (
          <>
            {required && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>{t("settings.stripeRequiredAlert")}</span>
              </div>
            )}
            <ul className="text-xs text-muted-foreground space-y-1">
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />{t("settings.bulletAutoFast")}</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />{t("settings.bulletIdentityVerified")}</li>
            </ul>
            <Button size="sm" onClick={startOnboarding} disabled={actionLoading} className="w-full">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
              {t("settings.stripeConnectBtn")}
            </Button>
          </>
        )}
        {actionError && (
          <p role="alert" className="text-xs text-red-600 flex items-start gap-1.5">
            <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {actionError}
          </p>
        )}
        {actionNotice && (
          <p role="status" className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
            {actionNotice}
          </p>
        )}
        <TrustFooter />
      </div>
    </Card>
  );
}

// ─── MonCash sub-panel ─────────────────────────────────────────────────────────
export function MonCashSubPanel({ account, onSaved }: { account: PayoutAccount | null; onSaved: (a: PayoutAccount) => void }) {
  const [input, setInput] = useState(account?.moncashNumber ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const { t } = useTranslation();
  const { token } = useAuth();

  useEffect(() => { setInput(account?.moncashNumber ?? ""); }, [account?.moncashNumber]);

  const save = async () => {
    setError(null); setSuccess(false);
    const num = input.trim();
    if (!num) { setError(t("settings.moncashNumberRequired")); return; }
    if (!/^509\d{8}$/.test(num)) { setError(t("settings.moncashNumberInvalid")); return; }
    if (!token) { setError(t("settings.stripeSessionExpired")); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/seller/payout-account/moncash", {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ moncashNumber: num }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? t("settings.saveError")); return; }
      onSaved(data);
      setSuccess(true);
    } catch { setError(t("settings.networkError")); }
    finally { setSaving(false); }
  };

  const isVerified = account?.moncashVerified;
  const isRejected = !account?.moncashVerified && !!account?.moncashRejectedReason;
  const isPending = account?.moncashNumber && !account?.moncashVerified && !account?.moncashRejectedReason;

  return (
    <div className="space-y-3">
      {isRejected && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-xs text-red-700 dark:text-red-400">
          <p className="font-semibold mb-1">{t("settings.rejectionReason")}:</p>
          <p>{account!.moncashRejectedReason}</p>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          {t("settings.moncashSectionTitle")}
        </p>
        {isVerified ? (
          <p className="text-sm text-muted-foreground">
            MonCash <span className="font-mono font-semibold text-foreground">{account!.moncashNumber}</span> ✓
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("settings.moncashEnterDesc")}
          </p>
        )}
      </div>

      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>{t("settings.moncashDelay")}</span>
      </div>

      <div className="flex gap-2">
        <Input
          value={input}
          onChange={e => { setInput(e.target.value); setError(null); setSuccess(false); }}
          placeholder="50937001234"
          maxLength={11}
          className="h-9 text-sm font-mono flex-1"
          data-testid="input-moncash-number"
        />
        <Button size="sm" onClick={save} disabled={saving} className="h-9 shrink-0">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          <span className="ml-1">{saving ? t("settings.saving") : t("settings.save")}</span>
        </Button>
      </div>

      {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{error}</p>}
      {success && <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />{t("settings.savedPendingVerification")}</p>}
      {isPending && !success && (
        <p className="text-xs text-yellow-600 flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{t("settings.pendingVerification")}</p>
      )}
    </div>
  );
}

// ─── Trust footer (reused across panels) ──────────────────────────────────────
export function TrustFooter() {
  const { t } = useTranslation();
  return (
    <div className="border-t border-border pt-3 mt-1 grid grid-cols-2 gap-2">
      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary/70" />
        <span>{t("settings.securePayout")}</span>
      </div>
      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <UserCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary/70" />
        <span>{t("settings.manualPayout")}</span>
      </div>
    </div>
  );
}

// ─── Card payout method selector (Kat FM vs Stripe) ──────────────────────────
export function CardPayoutMethodPanel() {
  const { user } = useAuth();
  const isStripeOnlySeller = isStripeOnlySellerCountry(user?.country);
  const [method, setMethod] = useState<"fm_wallet" | "stripe">("fm_wallet");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const { t } = useTranslation();

  const tk = () => localStorage.getItem("flexamarket_token") ?? "";

  useEffect(() => {
    fetch("/api/seller/payout-account", { headers: { Authorization: `Bearer ${tk()}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.cardPayoutMethod) setMethod(d.cardPayoutMethod); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const save = async (m: "fm_wallet" | "stripe") => {
    setSaving(true);
    try {
      const res = await fetch("/api/seller/payout-account/card-method", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk()}` },
        body: JSON.stringify({ method: m }),
      });
      if (res.ok) setMethod(m);
    } catch { /* noop */ }
    finally { setSaving(false); }
  };

  if (!loaded) return null;

  if (isStripeOnlySeller) {
    return (
      <Card className="overflow-hidden mt-3">
        <div className="p-4">
          <p className="font-semibold text-sm">Stripe</p>
          <p className="text-xs text-muted-foreground mt-1">{t("sell.usStripeOnly")}</p>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden mt-3">
      <div className="p-4 border-b border-border bg-muted/30">
        <span className="font-semibold text-sm">{t("settings.cardPayoutQuestion")}</span>
      </div>
      <div className="p-4 space-y-3">
        {/* Kat FM option */}
        <button
          onClick={() => save("fm_wallet")}
          disabled={saving}
          className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
            method === "fm_wallet"
              ? "border-primary bg-primary/5"
              : "border-border hover:border-primary/40"
          }`}
        >
          <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
            method === "fm_wallet" ? "border-primary" : "border-muted-foreground"
          }`}>
            {method === "fm_wallet" && <div className="w-2 h-2 rounded-full bg-primary" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">Kat FM</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400">
                {t("settings.recommended")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("settings.fmWalletPayoutDesc")}
            </p>
          </div>
        </button>

        {/* Stripe Connect option */}
        <button
          onClick={() => save("stripe")}
          disabled={saving}
          className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all ${
            method === "stripe"
              ? "border-blue-500 bg-blue-500/5"
              : "border-border hover:border-blue-400/40"
          }`}
        >
          <div className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
            method === "stripe" ? "border-blue-500" : "border-muted-foreground"
          }`}>
            {method === "stripe" && <div className="w-2 h-2 rounded-full bg-blue-500" />}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-sm">Stripe Connect</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-400">
                {t("settings.advanced")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("settings.stripePayoutMethodDesc")}
            </p>
          </div>
        </button>

        {saving && (
          <p className="text-xs text-center text-muted-foreground animate-pulse">
            {t("settings.saving")}
          </p>
        )}
      </div>
    </Card>
  );
}

// ─── Haiti payout panel: Stripe (recommended) + MonCash (manual) — no bank ────
export function HaitiPayoutPanel() {
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();
  const { token } = useAuth();

  // Stripe status
  const [stripeStatus, setStripeStatus] = useState<string>("not_connected");
  const [stripeLoading, setStripeLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch("/api/seller/payout-account", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setAccount(d))
      .catch(() => setAccount(null))
      .finally(() => setLoading(false));

    fetch("/api/stripe/connect/status", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStripeStatus(d.stripeAccountStatus ?? "not_connected"); })
      .catch(() => {})
      .finally(() => setStripeLoading(false));
  }, [token]);

  const moncashVerified = account?.moncashVerified;
  const moncashPending = account?.moncashNumber && !account?.moncashVerified && !account?.moncashRejectedReason;
  const moncashRejected = !account?.moncashVerified && !!account?.moncashRejectedReason;

  const stripeActive = stripeStatus === "active";
  const stripeConnected = stripeStatus === "connected";
  const stripePending = stripeStatus === "pending";

  const makeBadge = (verified: any, pending: any, rejected: any) =>
    verified
      ? <Badge className="ml-1.5 bg-green-100 text-green-700 border-0 text-[10px]"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />{t("settings.active")}</Badge>
      : pending
      ? <Badge className="ml-1.5 bg-yellow-100 text-yellow-700 border-0 text-[10px]"><Clock className="h-2.5 w-2.5 mr-0.5" />{t("settings.pending")}</Badge>
      : rejected
      ? <Badge className="ml-1.5 bg-red-100 text-red-700 border-0 text-[10px]"><AlertCircle className="h-2.5 w-2.5 mr-0.5" />{t("settings.rejected")}</Badge>
      : null;

  const startOnboarding = async () => {
    if (!token) {
      setActionError(t("settings.stripeSessionExpired"));
      return;
    }
    setActionError(null);
    setActionNotice(null);
    setActionLoading(true);
    try {
      const res = await fetch("/api/stripe/connect/onboard", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(
          data.code === "STRIPE_CONNECT_PLATFORM_PROFILE_REQUIRED"
            ? t("settings.stripePlatformProfileRequired")
            : t("settings.stripeConnectError"),
        );
      }
      if (await handOffStripeUrlToBrowser(data.url, t("settings.stripeExternalBrowserPrompt"))) {
        setActionNotice(t("settings.stripeExternalBrowserCopied"));
        return;
      }
      window.location.assign(data.url);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("settings.stripeConnectError"));
    }
    finally { setActionLoading(false); }
  };

  const openDashboard = async () => {
    if (!token) {
      setActionError(t("settings.stripeSessionExpired"));
      return;
    }
    setActionError(null);
    setActionNotice(null);
    setActionLoading(true);
    try {
      const res = await fetch("/api/stripe/connect/dashboard", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(t("settings.stripeDashboardError"));
      if (await handOffStripeUrlToBrowser(data.url, t("settings.stripeExternalBrowserPrompt"))) {
        setActionNotice(t("settings.stripeExternalBrowserCopied"));
        return;
      }
      window.location.assign(data.url);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : t("settings.stripeDashboardError"));
    }
    finally { setActionLoading(false); }
  };

  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30 flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Stripe Connect</span>
          {stripeLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />
          ) : (
            <>
              {stripeConnected
                ? <Badge className="ml-1.5 bg-green-100 text-green-700 border-0 text-[10px]"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />{t("settings.connected")}</Badge>
                : makeBadge(stripeActive, stripePending, false)}
              {!stripeActive && !stripeConnected && !stripePending && (
                <Badge className="ml-auto bg-blue-100 text-blue-700 border-0 text-[10px]">{t("settings.recommended")}</Badge>
              )}
            </>
          )}
        </div>
        {!stripeLoading && (
          <div className="p-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                {t("settings.instantPayout")}
              </p>
              <p className="text-sm text-muted-foreground">
                {stripeActive
                  ? t("settings.stripeActiveDesc")
                  : stripeConnected
                    ? t("settings.stripeConnectedPendingDesc")
                    : t("settings.stripeConnectDesc")}
              </p>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />{stripeActive ? t("settings.bulletAutoFast") : t("settings.bulletInstantPayout")}</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />{stripeActive ? t("settings.bulletAutoNoWait") : t("settings.bulletIdentityVerified")}</li>
            </ul>
            <Button size="sm" variant={stripeActive ? "outline" : "default"} onClick={stripeActive ? openDashboard : startOnboarding} disabled={actionLoading} className="w-full">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : stripeActive ? <ExternalLink className="h-4 w-4 mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
              {stripeActive
                ? t("settings.stripeDashboard")
                : stripeConnected
                  ? t("settings.stripeReviewBtn")
                  : stripePending
                    ? t("settings.stripeCompleteBtn")
                    : t("settings.stripeConnectBtn")}
            </Button>
            {actionError && (
              <p role="alert" className="text-xs text-red-600 flex items-start gap-1.5">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {actionError}
              </p>
            )}
            {actionNotice && (
              <p role="status" className="text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                {actionNotice}
              </p>
            )}
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30 flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">{t("settings.moncashTitle")}</span>
          <span className="ml-auto">{makeBadge(moncashVerified, moncashPending, moncashRejected)}</span>
        </div>
        {!loading && (
          <div className="p-4">
            <MonCashSubPanel account={account} onSaved={setAccount} />
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Payment Status Summary Banner ────────────────────────────────────────────
export function PaymentStatusBanner({ stripeStatus }: { stripeStatus?: string | null }) {
  const { t } = useTranslation();

  if (stripeStatus === "active") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg text-xs text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>{t("settings.stripeConnectedBanner")}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{t("settings.stripeNotConnectedBanner")}</span>
    </div>
  );
}

// ─── Auto-Translate Toggle Card ───────────────────────────────────────────────
