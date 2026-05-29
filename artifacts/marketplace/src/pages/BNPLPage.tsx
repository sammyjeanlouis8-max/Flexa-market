import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";
import {
  ShieldCheck, CheckCircle, XCircle, Clock, Star, Smartphone,
  ShoppingBag, Zap, Info, ChevronRight, Loader2, AlertCircle,
  CreditCard, ArrowRight, Lock, BadgeCheck, TrendingUp,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

interface EligibilityData {
  eligible: boolean;
  score: number;
  accountAgeDays: number;
  completedOrders: number;
  isPhoneVerified: boolean;
  avgRating: number;
  checks: { label: string; passed: boolean; weight: number }[];
}

interface BNPLSettings {
  klarnaEnabled: boolean;
  affirmEnabled: boolean;
  afterpayEnabled: boolean;
  minAmountUsd: number;
  maxAmountUsd: number;
  platformFeePct: number;
}

const PROVIDERS = [
  {
    id: "klarna",
    name: "Klarna",
    tagline: "Peye nan 4 fwa, san enterè",
    logo: "🟣",
    color: "from-pink-500/10 to-purple-500/10 border-pink-200 dark:border-pink-800",
    badgeColor: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-300",
    plans: [
      { label: "Jodi a", amount: "25%", detail: "1ye peman" },
      { label: "+2 semèn", amount: "25%", detail: "2yèm peman" },
      { label: "+4 semèn", amount: "25%", detail: "3yèm peman" },
      { label: "+6 semèn", amount: "25%", detail: "4yèm peman" },
    ],
    countries: "US, EU, UK, CA, AU",
    minAmount: 50,
    interest: "0% enterè",
  },
  {
    id: "afterpay_clearpay",
    name: "Afterpay",
    tagline: "4 peman toutes 2 semèn",
    logo: "🟢",
    color: "from-green-500/10 to-teal-500/10 border-green-200 dark:border-green-800",
    badgeColor: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    plans: [
      { label: "Jodi a", amount: "25%", detail: "1ye peman" },
      { label: "+2 semèn", amount: "25%", detail: "2yèm peman" },
      { label: "+4 semèn", amount: "25%", detail: "3yèm peman" },
      { label: "+6 semèn", amount: "25%", detail: "4yèm peman" },
    ],
    countries: "US, AU, CA, NZ, UK",
    minAmount: 50,
    interest: "0% enterè",
  },
  {
    id: "affirm",
    name: "Affirm",
    tagline: "Peman mansyèl fleksib",
    logo: "🔵",
    color: "from-blue-500/10 to-indigo-500/10 border-blue-200 dark:border-blue-800",
    badgeColor: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    plans: [
      { label: "3 mwa", amount: "~33%/mwa", detail: "Rate tès: 0%" },
      { label: "6 mwa", amount: "~17%/mwa", detail: "Rate tès: 10-30%" },
      { label: "12 mwa", amount: "~8%/mwa", detail: "Rate tès: 10-30%" },
      { label: "24 mwa", amount: "~4%/mwa", detail: "Rate tès: 10-30%" },
    ],
    countries: "US sèlman",
    minAmount: 50,
    interest: "0-30% APR",
  },
];

function InstallmentExample({ amount, provider }: { amount: number; provider: typeof PROVIDERS[0] }) {
  const perPayment = amount / 4;
  return (
    <div className="rounded-xl bg-muted/40 border border-border p-4 space-y-3">
      <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Egzanp pou ${amount.toFixed(2)}</p>
      <div className="grid grid-cols-4 gap-2">
        {provider.plans.map((plan, i) => (
          <div key={i} className="text-center">
            <div className="text-xs text-muted-foreground mb-1">{plan.label}</div>
            <div className="font-black text-sm text-foreground">${perPayment.toFixed(2)}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{plan.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function BNPLPage() {
  const { user, token } = useAuth();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [eligibility, setEligibility] = useState<EligibilityData | null>(null);
  const [settings, setSettings] = useState<BNPLSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [settRes, eligRes] = await Promise.all([
          fetch("/api/bnpl/settings"),
          token ? fetch("/api/bnpl/eligibility", { headers: { Authorization: `Bearer ${token}` } }) : Promise.resolve(null),
        ]);
        if (settRes.ok) setSettings(await settRes.json());
        if (eligRes?.ok) setEligibility(await eligRes.json());
      } catch { /* ignore */ } finally { setLoading(false); }
    };
    fetchData();
  }, [token]);

  const enabledProviders = PROVIDERS.filter(p => {
    if (p.id === "klarna" && settings?.klarnaEnabled === false) return false;
    if (p.id === "affirm" && settings?.affirmEnabled === false) return false;
    if (p.id === "afterpay_clearpay" && settings?.afterpayEnabled === false) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24 space-y-6">

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-green-600 via-emerald-600 to-teal-700 p-6 text-white">
        <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-10 translate-x-10" />
        <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-8 -translate-x-6" />
        <div className="relative">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
              <CreditCard className="h-5 w-5" />
            </div>
            <Badge className="bg-white/20 text-white border-white/30 text-xs">Flexa BNPL</Badge>
          </div>
          <h1 className="text-2xl font-black mb-1">Achte Kounye a</h1>
          <h1 className="text-2xl font-black text-green-200 mb-3">Peye Aprè 💳</h1>
          <p className="text-white/80 text-sm leading-relaxed">
            Peye an plizyè vèsman san enterè. Klarna, Afterpay, ak Affirm disponib dirèkteman nan checkout Flexa Market.
          </p>
          <div className="flex gap-4 mt-4">
            <div className="text-center">
              <p className="text-xl font-black">0%</p>
              <p className="text-white/70 text-xs">Enterè (Klarna/Afterpay)</p>
            </div>
            <div className="w-px bg-white/20" />
            <div className="text-center">
              <p className="text-xl font-black">4x</p>
              <p className="text-white/70 text-xs">Peman fasil</p>
            </div>
            <div className="w-px bg-white/20" />
            <div className="text-center">
              <p className="text-xl font-black">$50+</p>
              <p className="text-white/70 text-xs">Minimòm achte</p>
            </div>
          </div>
        </div>
      </div>

      {/* Eligibility card */}
      {user && eligibility && (
        <div className={cn(
          "rounded-2xl border-2 p-5 space-y-4",
          eligibility.eligible
            ? "border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-950/20"
            : "border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/20",
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {eligibility.eligible
                ? <BadgeCheck className="h-7 w-7 text-green-600" />
                : <Clock className="h-7 w-7 text-amber-600" />}
              <div>
                <p className={cn("font-black text-base", eligibility.eligible ? "text-green-800 dark:text-green-200" : "text-amber-800 dark:text-amber-200")}>
                  {eligibility.eligible ? "Flexa Credit Eligible ✓" : "Pa Kalif Ankò"}
                </p>
                <p className="text-xs text-muted-foreground">Nòt IA: {eligibility.score}/100</p>
              </div>
            </div>
            <div className={cn(
              "text-2xl font-black",
              eligibility.eligible ? "text-green-600" : "text-amber-600",
            )}>
              {eligibility.score}%
            </div>
          </div>

          <Progress value={eligibility.score} className="h-2" />

          <div className="grid grid-cols-2 gap-2">
            {eligibility.checks.map((check, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {check.passed
                  ? <CheckCircle className="h-3.5 w-3.5 text-green-600 shrink-0" />
                  : <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />}
                <span className={check.passed ? "text-foreground" : "text-muted-foreground"}>{check.label}</span>
              </div>
            ))}
          </div>

          {!eligibility.eligible && (
            <div className="rounded-xl bg-amber-100 dark:bg-amber-900/30 p-3 flex gap-2">
              <Info className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-300">
                Ou bezwen{eligibility.accountAgeDays < 90 ? ` ${90 - eligibility.accountAgeDays} jou ankò` : ""}
                {!eligibility.isPhoneVerified ? ", verifye telefòn ou" : ""}
                {eligibility.completedOrders < 3 ? `, ${3 - eligibility.completedOrders} kòmand ankò` : ""}.
                Kontinye itilize Flexa Market pou deblouke BNPL.
              </p>
            </div>
          )}
        </div>
      )}

      {!user && (
        <div className="rounded-2xl border border-border bg-card p-5 text-center space-y-3">
          <Lock className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="font-bold">Konekte pou wè elijiblite ou</p>
          <Button onClick={() => navigate("/auth/login")} className="rounded-full">
            Konekte <ArrowRight className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
      )}

      {/* Provider cards */}
      <div className="space-y-3">
        <h2 className="font-black text-lg">Opsyon Peman BNPL</h2>
        {enabledProviders.map(provider => (
          <div
            key={provider.id}
            onClick={() => setSelectedProvider(selectedProvider === provider.id ? null : provider.id)}
            className={cn(
              "rounded-2xl border bg-gradient-to-br p-5 cursor-pointer transition-all space-y-4",
              provider.color,
              selectedProvider === provider.id && "ring-2 ring-primary",
            )}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{provider.logo}</span>
                <div>
                  <p className="font-black text-base">{provider.name}</p>
                  <p className="text-xs text-muted-foreground">{provider.tagline}</p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge className={cn("text-xs", provider.badgeColor)}>{provider.interest}</Badge>
                <ChevronRight className={cn("h-4 w-4 text-muted-foreground transition-transform", selectedProvider === provider.id && "rotate-90")} />
              </div>
            </div>

            {selectedProvider === provider.id && (
              <div className="space-y-3 border-t border-border pt-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <TrendingUp className="h-3 w-3" />
                    <span>Peyi: {provider.countries}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-muted-foreground">
                    <ShoppingBag className="h-3 w-3" />
                    <span>Min: ${provider.minAmount}</span>
                  </div>
                </div>
                <InstallmentExample amount={100} provider={provider} />
                {user && eligibility?.eligible && (
                  <Button
                    className="w-full rounded-full"
                    onClick={(e) => { e.stopPropagation(); navigate("/"); }}
                  >
                    <Zap className="h-4 w-4 mr-1.5" />
                    Itilize {provider.name} nan checkout
                  </Button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
        <h2 className="font-black text-base">Kijan sa Mache?</h2>
        <div className="space-y-4">
          {[
            { icon: ShoppingBag, step: "1", title: "Chwazi pwodwi ou", desc: "Ajoute atik nan chayo, ale nan checkout" },
            { icon: CreditCard, step: "2", title: "Chwazi BNPL", desc: "Chwazi Klarna, Afterpay, oswa Affirm kòm metòd peman" },
            { icon: Zap, step: "3", title: "Apwobasyon imedya", desc: "IA Flexa verifye elijiblite ou rapid" },
            { icon: ShieldCheck, step: "4", title: "Resevwa kòmand ou", desc: "Peye an vèsman pandan ou jwi pwodwi a" },
          ].map((step, i) => (
            <div key={i} className="flex gap-4">
              <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <step.icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-bold text-sm">{step.title}</p>
                <p className="text-xs text-muted-foreground">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Flexa AI badge */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 p-5 text-white space-y-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
            <Zap className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="font-black text-sm">Flexa AI Risk Engine</p>
            <p className="text-white/60 text-xs">Sistèm apwobasyon entèlijan</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 text-xs">
          {[
            { icon: Clock, label: "Laj kont", desc: "90+ jou aktif" },
            { icon: Star, label: "Repitasyon", desc: "Nòt 3.5+ zetwal" },
            { icon: ShoppingBag, label: "Istwa achte", desc: "3+ kòmand konplete" },
            { icon: Smartphone, label: "Verifikasyon", desc: "Telefòn verifye" },
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2">
              <item.icon className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-white/90">{item.label}</p>
                <p className="text-white/50">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Security note */}
      <div className="rounded-xl border border-border p-3 flex gap-2">
        <ShieldCheck className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Tout tranzaksyon BNPL yo pwoteje pa Stripe (PCI DSS Level 1). Informasyon kat ou pa janm stoke sou sèvè Flexa Market.
        </p>
      </div>

      {/* Limit note */}
      {settings && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 p-3 flex gap-2">
          <AlertCircle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 dark:text-amber-300">
            BNPL disponib pou achte ${settings.minAmountUsd}–${settings.maxAmountUsd}. Disponib pou kliyan nan peyi sipòte sèlman (US, EU, UK, AU, CA).
          </p>
        </div>
      )}
    </div>
  );
}
