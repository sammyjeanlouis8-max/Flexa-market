import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import {
  User as UserIcon,
  ShieldCheck,
  Bell,
  Palette,
  HelpCircle,
  ChevronRight,
  LogOut,
  Heart,
  Package,
  ShoppingBag,
  MessageCircle,
  Tag,
  Shield,
  CheckCircle2,
  Clock,
  Loader2,
  Smartphone,
  AlertCircle,
  Save,
  CreditCard,
  ExternalLink,
  AlertTriangle,
  XCircle,
  Lock,
  UserCheck,
  Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useState, useEffect } from "react";
import { STRIPE_SUPPORTED_COUNTRIES, MONCASH_COUNTRIES } from "@/lib/paymentCountries";
import { openExternal } from "@/lib/externalNavigation";

// ─── Types ─────────────────────────────────────────────────────────────────────
interface PayoutAccount {
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
function StripeConnectPanel({ required = false }: { required?: boolean }) {
  const [status, setStatus] = useState<string>("not_connected");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const tk = () => localStorage.getItem("flexamarket_token") ?? "";

  useEffect(() => {
    fetch("/api/stripe/connect/status", { headers: { Authorization: `Bearer ${tk()}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStatus(d.stripeAccountStatus ?? "not_connected"); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const startOnboarding = async () => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST",
        headers: { Authorization: `Bearer ${tk()}` },
      });
      const data = await res.json();
      if (data.url) openExternal(data.url);
    } catch { /* noop */ }
    finally { setActionLoading(false); }
  };

  const openDashboard = async () => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/stripe/connect/dashboard", {
        method: "POST",
        headers: { Authorization: `Bearer ${tk()}` },
      });
      const data = await res.json();
      if (data.url) openExternal(data.url);
    } catch { /* noop */ }
    finally { setActionLoading(false); }
  };

  const isActive = status === "active";
  const isPending = status === "pending";

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2">
          <CreditCard className="h-5 w-5 text-primary" />
          <span className="font-semibold text-sm">Stripe Connect</span>
          {required && <Badge className="ml-1 bg-primary/10 text-primary border-0 text-[10px]">Obligatwa</Badge>}
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground ml-auto" />
          ) : isActive ? (
            <Badge className="ml-auto bg-green-100 text-green-700 border-0 text-xs">
              <CheckCircle2 className="h-3 w-3 mr-1" />Konekte ✅
            </Badge>
          ) : isPending ? (
            <Badge className="ml-auto bg-yellow-100 text-yellow-700 border-0 text-xs">
              <Clock className="h-3 w-3 mr-1" />Annatant
            </Badge>
          ) : (
            <Badge className="ml-auto bg-muted text-muted-foreground border-0 text-xs">
              <XCircle className="h-3 w-3 mr-1" />Pa Konekte
            </Badge>
          )}
        </div>
      </div>

      <div className="p-4 space-y-3">
        {isActive ? (
          <>
            <p className="text-sm text-muted-foreground">
              Kont Stripe ou <span className="font-semibold text-foreground">aktif</span>. Ou pral resevwa peman otomatikman apre chak vant konfime.
            </p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />Peman otomatik — pa bezwen atann admin</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />Kòmisyon platfòm dedui otomatikman</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />Peman nan 2-7 jou travay</li>
            </ul>
            <Button size="sm" variant="outline" onClick={openDashboard} disabled={actionLoading} className="w-full">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
              Wè Tableau de Bò Stripe
            </Button>
          </>
        ) : isPending ? (
          <>
            <p className="text-sm text-muted-foreground">
              Ou kòmanse konfigirasyon Stripe ou — konplete li pou kòmanse resevwa peman.
            </p>
            <Button size="sm" onClick={startOnboarding} disabled={actionLoading} className="w-full">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
              Konplete Konfigirasyon Stripe
            </Button>
          </>
        ) : (
          <>
            {required && (
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Konekte kont Stripe ou pou ka resevwa peman pou vant ou yo.</span>
              </div>
            )}
            <ul className="text-xs text-muted-foreground space-y-1">
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />Peman otomatik — rapid ak sekirize</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />Idantite verifye pa Stripe</li>
              <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />Sèlman kòmisyon platfòm dedui</li>
            </ul>
            <Button size="sm" onClick={startOnboarding} disabled={actionLoading} className="w-full">
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
              Konekte kont Stripe ou
            </Button>
          </>
        )}
        <TrustFooter />
      </div>
    </Card>
  );
}

// ─── MonCash sub-panel ─────────────────────────────────────────────────────────
function MonCashSubPanel({ account, onSaved }: { account: PayoutAccount | null; onSaved: (a: PayoutAccount) => void }) {
  const [input, setInput] = useState(account?.moncashNumber ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => { setInput(account?.moncashNumber ?? ""); }, [account?.moncashNumber]);

  const tk = () => localStorage.getItem("flexamarket_token") ?? "";

  const save = async () => {
    setError(null); setSuccess(false);
    const num = input.trim();
    if (!num) { setError("Antre nimewo MonCash ou"); return; }
    if (!/^509\d{8}$/.test(num)) { setError("Nimewo a dwe kòmanse pa 509 epi gen 11 chif (egzanp: 50937001234)"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/seller/payout-account/moncash", {
        method: "PUT",
        headers: { Authorization: `Bearer ${tk()}`, "Content-Type": "application/json" },
        body: JSON.stringify({ moncashNumber: num }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Echèk"); return; }
      onSaved(data);
      setSuccess(true);
    } catch { setError("Erè rezo"); }
    finally { setSaving(false); }
  };

  const isVerified = account?.moncashVerified;
  const isRejected = !account?.moncashVerified && !!account?.moncashRejectedReason;
  const isPending = account?.moncashNumber && !account?.moncashVerified && !account?.moncashRejectedReason;

  return (
    <div className="space-y-3">
      {isRejected && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 text-xs text-red-700 dark:text-red-400">
          <p className="font-semibold mb-1">Rezon rejè :</p>
          <p>{account!.moncashRejectedReason}</p>
        </div>
      )}

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
          Resevwa peman via MonCash (peman manyèl)
        </p>
        {isVerified ? (
          <p className="text-sm text-muted-foreground">
            Nimewo MonCash <span className="font-mono font-semibold text-foreground">{account!.moncashNumber}</span> verifye.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Antre nimewo MonCash ayisyen ou pou resevwa peman apre chak vant.
          </p>
        )}
      </div>

      <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <span>Peman ka pran <strong>24-72 èdtan</strong> apre vant konfime.</span>
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
          <span className="ml-1">{saving ? "Ap sove…" : "Sove"}</span>
        </Button>
      </div>

      {error && <p className="text-xs text-red-600 flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{error}</p>}
      {success && <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" />Sove! Annatant vèrifikasyon admin.</p>}
      {isPending && !success && (
        <p className="text-xs text-yellow-600 flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Annatant vèrifikasyon admin</p>
      )}
    </div>
  );
}

// ─── Trust footer (reused across panels) ──────────────────────────────────────
function TrustFooter() {
  return (
    <div className="border-t border-border pt-3 mt-1 grid grid-cols-2 gap-2">
      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary/70" />
        <span>Peman sekirize disponib</span>
      </div>
      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <UserCheck className="h-3.5 w-3.5 shrink-0 mt-0.5 text-primary/70" />
        <span>Peman manyèl verifye pa admin</span>
      </div>
    </div>
  );
}

// ─── Card payout method selector (Kat FM vs Stripe) ──────────────────────────
function CardPayoutMethodPanel() {
  const [method, setMethod] = useState<"fm_wallet" | "stripe">("fm_wallet");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

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

  return (
    <Card className="overflow-hidden mt-3">
      <div className="p-4 border-b border-border bg-muted/30">
        <span className="font-semibold text-sm">Kijan ou vle touche lè yon moun peye pa kat?</span>
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
                Rekòmande
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Aprè chak vant pa kat, kòb ou (apre komisyon 10%) ajoute <strong>otomatikman</strong> nan pòtfèy FM ou. Pa bezwen konfigire Stripe. Ou ka retire kòb la nan MonCash ou labank.
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
                Avanse
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Nesesite konfigirasyon Stripe pèsonèl. Kòb ale dirèkteman nan kont Stripe ou (si li aktif). Pou vandè ki abitye ak Stripe.
            </p>
          </div>
        </button>

        {saving && (
          <p className="text-xs text-center text-muted-foreground animate-pulse">
            Saving…
          </p>
        )}
      </div>
    </Card>
  );
}

// ─── Haiti payout panel: Stripe (recommended) + MonCash (manual) — no bank ────
function HaitiPayoutPanel() {
  const [account, setAccount] = useState<PayoutAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"stripe" | "moncash">("stripe");

  // Stripe status
  const [stripeStatus, setStripeStatus] = useState<string>("not_connected");
  const [stripeLoading, setStripeLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);

  const tk = () => localStorage.getItem("flexamarket_token") ?? "";

  useEffect(() => {
    fetch("/api/seller/payout-account", { headers: { Authorization: `Bearer ${tk()}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => setAccount(d))
      .catch(() => setAccount(null))
      .finally(() => setLoading(false));

    fetch("/api/stripe/connect/status", { headers: { Authorization: `Bearer ${tk()}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) setStripeStatus(d.stripeAccountStatus ?? "not_connected"); })
      .catch(() => {})
      .finally(() => setStripeLoading(false));
  }, []);

  const moncashVerified = account?.moncashVerified;
  const moncashPending = account?.moncashNumber && !account?.moncashVerified && !account?.moncashRejectedReason;
  const moncashRejected = !account?.moncashVerified && !!account?.moncashRejectedReason;

  const stripeActive = stripeStatus === "active";
  const stripePending = stripeStatus === "pending";

  const makeBadge = (verified: any, pending: any, rejected: any) =>
    verified
      ? <Badge className="ml-1.5 bg-green-100 text-green-700 border-0 text-[10px]"><CheckCircle2 className="h-2.5 w-2.5 mr-0.5" />Aktif</Badge>
      : pending
      ? <Badge className="ml-1.5 bg-yellow-100 text-yellow-700 border-0 text-[10px]"><Clock className="h-2.5 w-2.5 mr-0.5" />Annatant</Badge>
      : rejected
      ? <Badge className="ml-1.5 bg-red-100 text-red-700 border-0 text-[10px]"><AlertCircle className="h-2.5 w-2.5 mr-0.5" />Rejte</Badge>
      : null;

  const startOnboarding = async () => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/stripe/connect/onboard", { method: "POST", headers: { Authorization: `Bearer ${tk()}` } });
      const data = await res.json();
      if (data.url) openExternal(data.url);
    } catch { /* noop */ }
    finally { setActionLoading(false); }
  };

  const openDashboard = async () => {
    setActionLoading(true);
    try {
      const res = await fetch("/api/stripe/connect/dashboard", { method: "POST", headers: { Authorization: `Bearer ${tk()}` } });
      const data = await res.json();
      if (data.url) openExternal(data.url);
    } catch { /* noop */ }
    finally { setActionLoading(false); }
  };

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-border bg-muted/30 flex items-center justify-between">
        <span className="font-semibold text-sm">Metòd Peman Vant</span>
        {(loading || stripeLoading) && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Tabs: Stripe first (recommended), MonCash second */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab("stripe")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${tab === "stripe" ? "border-b-2 border-primary text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground"}`}
        >
          <CreditCard className="h-3.5 w-3.5" />
          Stripe
          {stripeLoading
            ? null
            : makeBadge(stripeActive, stripePending, false)
          }
          {!stripeLoading && !stripeActive && !stripePending && (
            <Badge className="ml-1.5 bg-blue-100 text-blue-700 border-0 text-[10px]">Rekòmande</Badge>
          )}
        </button>
        <button
          onClick={() => setTab("moncash")}
          className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-medium transition-colors ${tab === "moncash" ? "border-b-2 border-primary text-primary bg-primary/5" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Smartphone className="h-3.5 w-3.5" />
          MonCash
          {makeBadge(moncashVerified, moncashPending, moncashRejected)}
        </button>
      </div>

      {!loading && !stripeLoading && (
        <div className="p-4 space-y-3">
          {/* ── Stripe tab ─────────────────────────────────────────── */}
          {tab === "stripe" && (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                  Peman Imedya (Rekòmande)
                </p>
                {stripeActive ? (
                  <p className="text-sm text-muted-foreground">
                    Kont Stripe ou <span className="font-semibold text-foreground">aktif</span>. Peman otomatik apre chak vant.
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Konekte kont Stripe ou pou peman imedya otomatik, menm si Stripe pa toujou popilè ann Ayiti.
                  </p>
                )}
              </div>

              {stripeActive ? (
                <>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />Peman otomatik — rapid ak sekirize</li>
                    <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />Pa bezwen atann admin</li>
                    <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />Aksè ak Tableau de Bò Stripe</li>
                  </ul>
                  <Button size="sm" variant="outline" onClick={openDashboard} disabled={actionLoading} className="w-full">
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <ExternalLink className="h-4 w-4 mr-2" />}
                    Wè Tableau de Bò Stripe
                  </Button>
                </>
              ) : (
                <>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />Peman imedya — san delè 24-72h</li>
                    <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />Idantite verifye pa Stripe</li>
                    <li className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />Pou itilizatè avanse</li>
                  </ul>
                  <Button size="sm" onClick={startOnboarding} disabled={actionLoading} className="w-full">
                    {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
                    {stripePending ? "Konplete Konfigirasyon Stripe" : "Konekte kont Stripe ou"}
                  </Button>
                </>
              )}
            </div>
          )}

          {/* ── MonCash tab ─────────────────────────────────────────── */}
          {tab === "moncash" && (
            <MonCashSubPanel account={account} onSaved={setAccount} />
          )}

          <TrustFooter />
        </div>
      )}
    </Card>
  );
}

// ─── Payment Status Summary Banner ────────────────────────────────────────────
function PaymentStatusBanner({ stripeStatus, country }: { stripeStatus?: string | null; country?: string | null }) {
  const isMoncash = country ? MONCASH_COUNTRIES.has(country) : false;

  if (stripeStatus === "active") {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg text-xs text-green-700 dark:text-green-400">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span><strong>Stripe Konekte ✅</strong> — Peman otomatik aktif pou kont ou.</span>
      </div>
    );
  }

  if (isMoncash) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span><strong>MonCash disponib ⚠️</strong> — Peman manyèl ka pran 24-72 èdtan. Stripe rekòmande pou peman rapid.</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-xs text-amber-700 dark:text-amber-400">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span><strong>Stripe pa konekte</strong> — Konekte kont Stripe ou pou resevwa peman.</span>
    </div>
  );
}

// ─── Auto-Translate Toggle Card ───────────────────────────────────────────────
function TranslationToggleCard() {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [enabled, setEnabled] = useState<boolean>(!!(user as any)?.translateMessages);

  const tk = () => localStorage.getItem("flexamarket_token") ?? "";

  const toggle = async () => {
    setLoading(true);
    const next = !enabled;
    try {
      const res = await fetch("/api/auth/translate-preference", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${tk()}` },
        body: JSON.stringify({ enabled: next }),
      });
      if (res.ok) {
        setEnabled(next);
        refreshUser();
      }
    } catch { /* noop */ } finally { setLoading(false); }
  };

  return (
    <Card className="overflow-hidden">
      <div className="p-4 flex items-start gap-3">
        <div className="h-9 w-9 rounded-xl bg-blue-100 dark:bg-blue-950/60 flex items-center justify-center shrink-0">
          <Globe className="h-5 w-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold text-sm">Tradiksyon Otomatik</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Tradui mesaj ki soti nan lòt lang vè lang ou chwazi a
              </p>
            </div>
            <button
              type="button"
              onClick={toggle}
              disabled={loading}
              aria-label="Toggle auto-translate"
              style={{
                position: "relative", display: "inline-flex", alignItems: "center",
                width: 44, height: 24, borderRadius: 12, border: "none", cursor: loading ? "default" : "pointer",
                background: enabled ? "#3b82f6" : "#D1D5DB",
                transition: "background 200ms",
                flexShrink: 0,
                opacity: loading ? 0.6 : 1,
              }}
            >
              <span style={{
                position: "absolute", top: 2,
                left: enabled ? 22 : 2,
                width: 20, height: 20, borderRadius: "50%", background: "#fff",
                transition: "left 200ms", boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
              }} />
            </button>
          </div>
          {enabled && (
            <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 flex items-center gap-1.5">
              <Globe className="h-3 w-3" />
              Tradiksyon AI aktif — Messaj yo ap tradui otomatikman
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

// ─── Settings Page ─────────────────────────────────────────────────────────────
export default function Settings() {
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  if (!user) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-muted-foreground mb-4">{t("settings.loginRequired")}</p>
        <Link href="/auth/login"><Button>{t("auth.signIn")}</Button></Link>
      </div>
    );
  }

  const isStripeSupported = user.country ? STRIPE_SUPPORTED_COUNTRIES.has(user.country) : false;
  const isMoncashCountry = user.country ? MONCASH_COUNTRIES.has(user.country) : false;

  const accountRows = [
    { icon: UserIcon, label: t("settings.editProfile"), sub: t("settings.editProfileSub"), to: "/profile/edit", testid: "row-edit-profile" },
    { icon: Tag, label: t("settings.myListings"), sub: t("settings.myListingsSub"), to: `/profile/${user.id}`, testid: "row-my-listings" },
    { icon: Heart, label: t("settings.savedItems"), sub: t("settings.savedItemsSub"), to: "/saved", testid: "row-saved" },
  ];

  const activityRows = [
    { icon: ShoppingBag, label: t("settings.orders"), sub: t("settings.ordersSub"), to: "/orders", testid: "row-orders" },
    { icon: Package, label: t("settings.sales"), sub: t("settings.salesSub"), to: "/sales", testid: "row-sales" },
    { icon: MessageCircle, label: t("settings.messages"), sub: t("settings.messagesSub"), to: "/messages", testid: "row-messages" },
  ];

  const settingsRows = [
    { icon: ShieldCheck, label: t("settings.security"), sub: t("settings.securitySub"), to: "/settings/security", testid: "row-security" },
    { icon: Bell, label: t("settings.notifications"), sub: t("settings.notificationsSub"), to: "/settings/notifications", testid: "row-notifications" },
    { icon: Palette, label: t("settings.preferences"), sub: t("settings.preferencesSub"), to: "/settings/preferences", testid: "row-preferences" },
    { icon: HelpCircle, label: t("settings.helpSupport"), sub: t("settings.helpSupportSub"), to: "/settings/help", testid: "row-help" },
  ];

  return (
    <div className="max-w-2xl mx-auto p-4 md:p-6 space-y-6 pb-24">
      {/* Identity card */}
      <Card className="p-5 flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarImage src={user.avatar ?? undefined} alt={user.name} />
          <AvatarFallback>{user.name?.[0]?.toUpperCase() ?? "?"}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-lg truncate" data-testid="text-settings-user-name">{user.name}</p>
          <p className="text-sm text-muted-foreground truncate" data-testid="text-settings-user-email">{user.email}</p>
          {user.isVerified && (
            <span className="inline-block mt-1 text-xs font-semibold text-green-700 bg-green-100 dark:bg-green-950 dark:text-green-400 px-2 py-0.5 rounded-full">
              ✓ {t("settings.verified")}
            </span>
          )}
        </div>
      </Card>

      <SettingsGroup title={t("settings.groupAccount")} rows={accountRows} />
      <SettingsGroup title={t("settings.groupActivity")} rows={activityRows} />

      {/* Payments section */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-2">
          Peman
        </h2>

        <PaymentStatusBanner stripeStatus={user.stripeAccountStatus} country={user.country} />

        {isStripeSupported ? (
          <StripeConnectPanel required />
        ) : isMoncashCountry ? (
          <HaitiPayoutPanel />
        ) : (
          <StripeConnectPanel />
        )}

        {/* Card payout method: visible to all sellers */}
        <CardPayoutMethodPanel />
      </div>

      {/* Translation section */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-2">
          Tradiksyon
        </h2>
        <TranslationToggleCard />
      </div>

      <SettingsGroup title={t("settings.groupSettings")} rows={settingsRows} />

      {(user.isAdmin || (user as any).isSuperAdmin) && (
        <SettingsGroup
          title={t("settings.groupAdmin")}
          rows={[
            { icon: Shield, label: t("settings.adminPanel"), sub: t("settings.adminPanelSub"), to: "/admin", testid: "row-admin" },
          ]}
        />
      )}

      <Card className="overflow-hidden">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 p-4 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          data-testid="button-settings-logout"
        >
          <LogOut className="h-5 w-5" />
          <span className="font-semibold">{t("buttons.logout")}</span>
        </button>
      </Card>

      <p className="text-center text-xs text-muted-foreground pt-2">FLEXA MARKET</p>
    </div>
  );
}

interface SettingsRow {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  sub?: string;
  to: string;
  testid?: string;
}

function SettingsGroup({ title, rows }: { title: string; rows: SettingsRow[] }) {
  return (
    <div>
      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 px-2">{title}</h2>
      <Card className="overflow-hidden divide-y divide-border">
        {rows.map(({ icon: Icon, label, sub, to, testid }) => (
          <Link key={to} href={to}>
            <button
              className="w-full flex items-center gap-3 p-4 hover:bg-accent transition-colors text-left"
              data-testid={testid}
            >
              <div className="bg-primary/10 text-primary rounded-lg p-2 flex-shrink-0">
                <Icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{label}</p>
                {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            </button>
          </Link>
        ))}
      </Card>
    </div>
  );
}
