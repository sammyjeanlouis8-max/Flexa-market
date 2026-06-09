import { useState, useEffect, useMemo, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import {
  Zap, Check, CreditCard, ArrowLeft, Clock, Eye,
  Copy, CheckCheck, AlertCircle, Shield, Info,
  Video, X, Upload,
} from "lucide-react";
import { useUpload } from "@workspace/object-storage-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { MobileSelect } from "@/components/ui/mobile-select";
import { useGetListing, getGetListingQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";
import { formatHTG, formatPrice, useExchangeRate, htgToUsd, dopToUsd } from "@/lib/currency";
import { SUPPORTED_COUNTRIES, COUNTRY_FLAGS, citiesFor } from "@/lib/countries";
import { openExternal } from "@/lib/externalNavigation";

const PLANS = [
  {
    id: "1day",
    price: 2.50,
    badge: null as "popular" | "bestValue" | null,
    perks: ["featuredSection", "prioritySearch", "views10k"],
    color: "border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800",
    selectedColor: "border-blue-500 bg-blue-50 dark:bg-blue-950/20",
    badgeColor: "",
  },
  {
    id: "3day",
    price: 5.00,
    badge: "popular" as const,
    perks: ["everything1day", "views50k", "highlightedBadge"],
    color: "border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800",
    selectedColor: "border-primary bg-orange-50 dark:bg-orange-950/20",
    badgeColor: "bg-primary text-white",
  },
  {
    id: "7day",
    price: 12.99,
    badge: "bestValue" as const,
    perks: ["everything3day", "topWeek", "views400k"],
    color: "border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-800",
    selectedColor: "border-purple-500 bg-purple-50 dark:bg-purple-950/20",
    badgeColor: "bg-purple-600 text-white",
  },
] as const;

const PERK_KEYS: Record<string, string> = {
  featuredSection:  "Appears in Featured section",
  prioritySearch:   "Priority search results",
  views10k:         "2,000+ views",
  everything1day:   "Everything in 1 Day",
  views50k:         "10,000+ views",
  highlightedBadge: "Highlighted listing badge",
  everything3day:   "Everything in 3 Days",
  topWeek:          "Top of search results all week",
  views400k:        "60,000+ views",
};

type Plan = (typeof PLANS)[number]["id"];
type PayMethod = "card" | "usdt" | "sepa" | "apple" | "wallet";
type Step = "audience" | "budget" | "pay" | "success" | "activated";

const HAITI_DEPARTMENTS = [
  "Ouest", "Sud-Est", "Nord", "Nord-Est", "Artibonite",
  "Centre", "Sud", "Grand'Anse", "Nord-Ouest", "Nippes",
] as const;

const RADIUS_OPTIONS = [5, 10, 20, 50, 100] as const;

const USDT_WALLET_DEFAULT = "";

const EUROPE_COUNTRIES = new Set<string>([
  "France", "Germany", "Spain", "Italy", "Portugal", "Belgium", "Netherlands",
  "Ireland", "Austria", "Finland", "Greece", "Luxembourg", "Slovakia", "Slovenia",
  "Estonia", "Latvia", "Lithuania", "Cyprus", "Malta", "United Kingdom",
  "Switzerland", "Norway", "Sweden", "Denmark", "Poland", "Czech Republic",
  "Hungary", "Romania", "Bulgaria", "Croatia", "Iceland",
]);

function getAllowedMethodsForCountry(country: string | null | undefined): PayMethod[] {
  // wallet = promo balance; always shown first so user can spend what they've loaded.
  // MonCash / NatCash are only used to RECHARGE the promo wallet — NOT for direct boost payment.
  if (country === "Haiti") return ["wallet"];
  if (country && EUROPE_COUNTRIES.has(country)) return ["wallet", "card", "sepa", "apple"];
  return ["wallet", "card"];
}

async function apiPost(path: string, body: unknown) {
  const token = localStorage.getItem("flexamarket_token");
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw data;
  return data;
}

export default function BoostPage() {
  const [, params]    = useRoute("/boost/:listingId");
  const listingId     = parseInt(params?.listingId ?? "0", 10);
  const [, setLocation] = useLocation();
  const { toast }     = useToast();
  const queryClient   = useQueryClient();
  const { user }      = useAuth();
  const { t }         = useTranslation();

  // Fetch the live USDT TRX wallet address configured by admin.
  const { data: usdtWalletData } = useQuery<{ address: string }>({
    queryKey: ["usdt-wallet-address"],
    queryFn: async () => {
      const res = await fetch("/api/payment-providers/usdt-wallet");
      if (!res.ok) throw new Error("usdt wallet fetch failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const USDT_WALLET = usdtWalletData?.address ?? USDT_WALLET_DEFAULT;

  // Derived admin flag + admin mode — must come before allowedMethods useMemo.
  const isAdmin   = !!(user as any)?.isAdmin || !!(user as any)?.isSuperAdmin;
  const isHaiti   = user?.country === "Haiti";

  const { data: exchangeRate } = useExchangeRate();

  // Promo wallet balance (all users can have one)
  const { data: walletData, refetch: refetchWallet } = useQuery<{ balanceUsd: number; rateHtgToUsd: number; bonusPct: number }>({
    queryKey: ["wallet-balance"],
    queryFn: async () => {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/wallet/balance", {
        headers: tk ? { Authorization: `Bearer ${tk}` } : {},
      });
      if (!res.ok) throw new Error("wallet fetch failed");
      return res.json();
    },
    enabled: !!user,
    staleTime: 30000,
    retry: false,
  });
  const walletBalance = walletData?.balanceUsd ?? 0;

  // Admin-only: choose between a free instant boost or a paid boost (all methods).
  const [adminMode, setAdminMode]           = useState<"free" | "paid">("free");
  const [adminFreeDays, setAdminFreeDays]   = useState("7");
  const [adminFreeLoading, setAdminFreeLoading] = useState(false);
  const [adminFreeSuccess, setAdminFreeSuccess] = useState(false);

  // Monthly free-boost quota for admin users
  const { data: quotaData, refetch: refetchQuota } = useQuery<{
    used: number; limit: number | null; isSuperAdmin: boolean
  }>({
    queryKey: ["admin-free-boost-quota"],
    queryFn: async () => {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/admin/free-boost-quota", {
        headers: tk ? { Authorization: `Bearer ${tk}` } : {},
      });
      if (!res.ok) return { used: 0, limit: 3, isSuperAdmin: false };
      return res.json();
    },
    enabled: isAdmin,
    staleTime: 30000,
    retry: false,
  });

  const allowedMethods = useMemo(
    () => isAdmin && adminMode === "paid"
      // Admins in paid mode see every payment method so they can test any rail.
      // Note: moncash/natcash are intentionally excluded — they are for wallet recharging only.
      ? (["wallet", "card", "usdt", "sepa", "apple"] as PayMethod[])
      : getAllowedMethodsForCountry(user?.country),
    [user?.country, isAdmin, adminMode],
  );

  const [plan, setPlan]         = useState<Plan>("3day");
  const [payMethod, setPayMethod] = useState<PayMethod>(allowedMethods[0]);
  const [step, setStep]         = useState<Step>("audience");
  const [boostId, setBoostId]   = useState<number | null>(null);
  const [loading, setLoading]   = useState(false);
  const [copied, setCopied]     = useState(false);

  // Super-admin: override audience country
  const [adminCountry, setAdminCountry]         = useState<string>("");
  const [adminCity, setAdminCity]               = useState<string>("__all__");

  const [audState, setAudState]                 = useState<string>("");
  const [audCities, setAudCities]               = useState<string[]>([]);
  const [audCityInput, setAudCityInput]         = useState<string>("");
  const [audNeighborhood, setAudNeighborhood]   = useState<string>("");
  const [audRadiusKm, setAudRadiusKm]           = useState<number | null>(10);

  // New Facebook-like audience fields
  const [objective, setObjective]               = useState<"auto" | "messages" | "views">("auto");
  const [audienceType, setAudienceType]         = useState<"advantage_plus" | "custom">("advantage_plus");
  const [audienceName, setAudienceName]         = useState<string>("");
  const [ageMin, setAgeMin]                     = useState<number>(18);
  const [ageMax, setAgeMax]                     = useState<number>(65);
  const [gender, setGender]                     = useState<"all" | "male" | "female">("all");

  const addCity = (raw: string) => {
    const name = raw.trim().replace(/,+$/, "").trim();
    if (!name) return;
    if (!audCities.includes(name)) setAudCities(prev => [...prev, name]);
    setAudCityInput("");
  };

  const removeCity = (c: string) => setAudCities(prev => prev.filter(x => x !== c));

  const handleCityKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addCity(audCityInput);
    } else if (e.key === "Backspace" && !audCityInput && audCities.length > 0) {
      setAudCities(prev => prev.slice(0, -1));
    }
  };

  const [budget, setBudget]             = useState<number>(5.00);
  const [estimatedReach, setEstimatedReach] = useState<number | null>(null);

  // Optional ≤30s promo video. Stored as the publicly-fetchable URL we'll
  // pass to /boost/initiate. Validation happens client-side via a hidden
  // <video> element that decodes metadata to read .duration.
  const [videoUrl, setVideoUrl]         = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const videoFileInputRef               = useRef<HTMLInputElement | null>(null);
  const { uploadFile: uploadVideoFile, progress: videoUploadProgress } = useUpload();
  const MAX_VIDEO_SECONDS = 60;
  const MAX_VIDEO_BYTES   = 300 * 1024 * 1024;

  const probeVideoDuration = (file: File): Promise<number> => new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    v.preload = "metadata";
    v.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(v.duration); };
    v.onerror = () => { URL.revokeObjectURL(url); resolve(NaN); };
    v.src = url;
  });

  const handleVideoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_VIDEO_BYTES) {
      toast({ title: t("boost.videoTooBig"), variant: "destructive" });
      return;
    }
    try {
      const seconds = await probeVideoDuration(file);
      if (Number.isFinite(seconds) && seconds > MAX_VIDEO_SECONDS + 0.5) {
        toast({ title: t("boost.videoTooLong"), variant: "destructive" });
        return;
      }
    } catch {
      toast({ title: t("boost.videoDecodeFailed"), variant: "destructive" });
      return;
    }
    setVideoUploading(true);
    try {
      const result = await uploadVideoFile(file);
      if (!result) {
        toast({ title: t("boost.videoUploadFailed"), variant: "destructive" });
        return;
      }
      // Persist the object-storage path; the backend rewrites it to a
      // signed-fetch URL when the visitor's overlay loads it.
      setVideoUrl(result.objectPath);
    } finally {
      setVideoUploading(false);
    }
  };

  useEffect(() => {
    setBudget(PLANS.find(p => p.id === plan)?.price ?? 6.99);
  }, [plan]);

  const [showReturnApp, setShowReturnApp] = useState(false);

  // Detect returning from Stripe Checkout with ?boost_success=1
  // Also calls the verify endpoint as a webhook fallback to guarantee activation.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("return_app") === "1") {
      setShowReturnApp(true);
    }
    if (params.get("boost_success") === "1") {
      setStep("activated");

      const sessionId = params.get("session_id");

      // Clean up URL without reloading the page
      const url = new URL(window.location.href);
      url.searchParams.delete("boost_success");
      url.searchParams.delete("session_id");
      url.searchParams.delete("return_app");
      window.history.replaceState({}, "", url.toString());

      // Fallback activation: activate the boost server-side even if the
      // Stripe webhook hasn't fired yet (e.g. webhook not configured yet).
      if (sessionId) {
        const token = localStorage.getItem("flexamarket_token");
        fetch("/api/boost/verify-stripe-payment", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ sessionId }),
        })
          .then(r => r.json())
          .then(() => {
            queryClient.invalidateQueries({ queryKey: ["listings"] });
            queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(listingId) });
          })
          .catch(() => {
            // Silent fail — webhook may still deliver the event
            queryClient.invalidateQueries({ queryKey: ["listings"] });
            queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(listingId) });
          });
      } else {
        queryClient.invalidateQueries({ queryKey: ["listings"] });
        queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(listingId) });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!allowedMethods.includes(payMethod)) {
      setPayMethod(allowedMethods[0]);
    }
  }, [allowedMethods, payMethod]);


  const [txHash, setTxHash] = useState("");
  const [iban, setIban]           = useState("");
  const [ibanName, setIbanName]   = useState("");


  const { data: listing } = useGetListing(listingId, {
    query: { enabled: !!listingId, queryKey: getGetListingQueryKey(listingId) },
  });

  const isSuperAdmin = !!(user?.isSuperAdmin);
  // Super-admin can override audience country; others locked to their own (or listing's country for free boosts)
  const effectiveAudienceCountry = isSuperAdmin && adminCountry
    ? adminCountry
    : (isAdmin && adminMode === "free")
      ? ((listing as any)?.country ?? user?.country ?? "")
      : (user?.country ?? "");

  const audience = useMemo(() => ({
    country: effectiveAudienceCountry || user?.country || "",
    state: audState || null,
    cities: audCities.length > 0 ? audCities : null,
    city: ((adminCity && adminCity !== "__all__") ? adminCity : audCities[0]) ?? null,
    neighborhood: audNeighborhood.trim() || null,
    radiusKm: audRadiusKm,
    audienceType,
    audienceName: audienceName.trim() || null,
    ageMin,
    ageMax,
    gender,
    objective,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [effectiveAudienceCountry, user?.country, adminCity, audState, audCities, audNeighborhood, audRadiusKm, audienceType, audienceName, ageMin, ageMax, gender, objective]);

  useEffect(() => {
    if (step !== "budget") return;
    const ctrl = new AbortController();
    (async () => {
      try {
        const token = localStorage.getItem("flexamarket_token");
        const r = await fetch("/api/boost/estimate", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ plan, budget, audience }),
          signal: ctrl.signal,
        });
        const d = await r.json();
        if (r.ok) setEstimatedReach(d.estimatedReach);
      } catch {}
    })();
    return () => ctrl.abort();
  }, [step, plan, budget, audience]);

  const selectedPlan = PLANS.find(p => p.id === plan)!;

  const getPlanLabel = (id: string) => {
    if (id === "1day") return t("boost.plan1day");
    if (id === "3day") return t("boost.plan3day");
    return t("boost.plan7day");
  };

  const getPlanDesc = (id: string) => {
    if (id === "1day") return t("boost.quickBoost");
    if (id === "3day") return t("boost.mostPopularChoice");
    return t("boost.maxExposure");
  };

  const getBadgeLabel = (badge: "popular" | "bestValue" | null) => {
    if (badge === "popular")   return t("boost.popular");
    if (badge === "bestValue") return t("boost.bestValue");
    return null;
  };

  const walletSufficient = walletBalance >= budget - 0.001;
  const ALL_METHODS: { id: PayMethod; label: string; icon: string; sub: string }[] = [
    { id: "wallet",  label: t("boost.walletMethod",  "Kont Promosyon"), icon: "💰", sub: `$${walletBalance.toFixed(2)} disponib${walletSufficient ? "" : " — pa ase"}` },
    { id: "card",    label: t("boost.cardMethod"),    icon: "💳", sub: t("boost.cardSub")    },
    { id: "sepa",    label: t("boost.sepaMethod"),    icon: "🏦", sub: t("boost.sepaSub")    },
    { id: "apple",   label: t("boost.appleMethod"),   icon: "",  sub: t("boost.appleSub")   },
    { id: "usdt",    label: t("boost.usdtMethod"),    icon: "₮",  sub: t("boost.usdtSub")    },
  ];
  const PAY_METHODS = ALL_METHODS.filter(m => allowedMethods.includes(m.id));

  const handleAudienceNext = () => {
    // Admins in free mode boost another user's listing — skip own-country check
    if (!isAdmin && !user?.country) {
      toast({ title: t("boost.completeProfile"), variant: "destructive" });
      return;
    }
    // Department only required for custom audience in Haiti
    if (effectiveAudienceCountry === "Haiti" && audienceType === "custom" && !audState) {
      toast({ title: t("boost.selectDepartment"), variant: "destructive" });
      return;
    }
    setStep("budget");
  };

  const handleInitiate = async () => {
    if (videoUploading) {
      toast({ title: t("boost.videoStillUploading", { defaultValue: "Videyo a ap telechaje toujou. Tann li fini avant ou kontinye." }), variant: "destructive" });
      return;
    }
    if (budget < (PLANS.find(p => p.id === plan)?.price ?? 0)) {
      toast({ title: t("boost.budgetTooLow"), variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const data = await apiPost(`/api/listings/${listingId}/boost/initiate`, {
        plan,
        paymentMethod: payMethod,
        audience,
        budget,
        videoUrl,
      });
      setBoostId(data.boostId);
      setEstimatedReach(data.estimatedReach);
      // Wallet pay: backend already activated boost instantly — skip pay step
      if (data.activated) {
        refetchWallet();
        queryClient.invalidateQueries({ queryKey: ["listings"] });
        setStep("activated");
      } else {
        setStep("pay");
      }
    } catch (e: any) {
      const err = e as any;
      if (err?.code === "INSUFFICIENT_WALLET") {
        toast({
          title: "Balans Kont pa ase",
          description: `Ou bezwen $${err.shortfallUsd?.toFixed(2) ?? "?"} plis. Rechaje kont ou.`,
          variant: "destructive",
        });
        return;
      }
      toast({ title: "Error", description: err?.error ?? "Could not initiate boost", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCardPay = async () => {
    if (!boostId) {
      toast({ title: "Boost not initialized. Please go back and try again.", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem("flexamarket_token");
      const res = await fetch(`/api/listings/${listingId}/boost/stripe-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ boostId }),
      });
      const data = await res.json();
      if (!res.ok) throw data;
      // Redirect to Stripe's hosted checkout page. In an in-app WebView we
      // escape to the system browser so Stripe Checkout renders with the
      // correct viewport scale (avoids the "excessively zoomed" report on
      // iPhone) and its back button respects the OS safe-area.
      openExternal(data.url);
    } catch (e: any) {
      toast({ title: "Payment failed", description: e?.error ?? "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleUsdtConfirm = async () => {
    if (!txHash.trim()) {
      toast({ title: "Enter your transaction hash", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiPost(`/api/listings/${listingId}/boost/confirm`, {
        boostId,
        paymentRef: txHash.trim(),
      });
      setStep("success");
      queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(listingId) });
    } catch (e: any) {
      toast({ title: "Error", description: e?.error ?? "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSepaPay = async () => {
    const cleaned = iban.replace(/\s+/g, "").toUpperCase();
    if (!ibanName.trim() || cleaned.length < 15) {
      toast({ title: t("boost.fillSepaDetails"), variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      await apiPost(`/api/listings/${listingId}/boost/confirm`, {
        boostId,
        paymentRef: `SEPA-${cleaned.slice(-4)}-${Date.now()}`,
      });
      setStep("success");
      queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(listingId) });
    } catch (e: any) {
      toast({ title: "Payment failed", description: e?.error ?? "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleApplePay = async () => {
    setLoading(true);
    try {
      await apiPost(`/api/listings/${listingId}/boost/confirm`, {
        boostId,
        paymentRef: `APPLE-${Date.now()}`,
      });
      setStep("success");
      queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(listingId) });
    } catch (e: any) {
      toast({ title: "Payment failed", description: e?.error ?? "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyWallet = () => {
    navigator.clipboard.writeText(USDT_WALLET);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };


  // ── Admin free-boost handler (full wizard) ─────────────────────────────────
  const handleAdminFreeBoost = async () => {
    const customDays = parseInt(adminFreeDays, 10);
    if (!customDays || customDays < 1 || customDays > 365) {
      toast({ title: "Dire envalid", description: "Antre ant 1 ak 365 jou.", variant: "destructive" });
      return;
    }
    setAdminFreeLoading(true);
    try {
      const token = localStorage.getItem("flexamarket_token");
      const res = await fetch(`/api/admin/listings/${listingId}/boost`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          plan: isSuperAdmin ? undefined : plan,
          days: isSuperAdmin ? customDays : undefined,
          videoUrl,
          audience,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw data;
      queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(listingId) });
      refetchQuota();
      setAdminFreeSuccess(true);
    } catch (e: any) {
      if (e?.used !== undefined && e?.limit !== undefined) {
        toast({
          title: t("boost.adminQuotaReached", { defaultValue: "Limit mansyèl atenn" }),
          description: t("boost.adminQuotaDesc", {
            defaultValue: "Ou te itilize {{used}}/{{limit}} boost gratis mwa sa. Eseye mwa pwochen.",
            used: e.used,
            limit: e.limit,
          }),
          variant: "destructive",
        });
      } else {
        toast({ title: "Boost echwe", description: e?.error ?? "Eseye ankò", variant: "destructive" });
      }
    } finally {
      setAdminFreeLoading(false);
    }
  };

  // ── Admin free-boost success screen ─────────────────────────────────────────
  if (adminFreeSuccess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-gradient-to-b from-green-50 to-background dark:from-green-950/20 dark:to-background">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="relative mx-auto h-24 w-24">
            <div className="absolute inset-0 rounded-full bg-green-200 dark:bg-green-900/40 animate-ping opacity-40" />
            <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shadow-xl shadow-green-500/30">
              <CheckCheck className="h-11 w-11 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-foreground mb-2">{t("boost.liveTitle", { defaultValue: "Boost Active!" })}</h1>
            <p className="text-muted-foreground">
              {t("boost.adminFreeDesc", {
                defaultValue: "Listing boosted for {{days}} day(s) — active immediately.",
                days: adminFreeDays,
              })}
            </p>
          </div>
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-2xl p-4">
            <p className="text-sm text-green-700 dark:text-green-400 font-medium">
              ✓ Listing ou a kounye a ap parèt nan video feed la
            </p>
          </div>
          <Button className="w-full h-12 font-bold text-base" onClick={() => setLocation(`/listings/${listingId}`)} data-testid="button-view-listing">
            {t("boost.viewListing", { defaultValue: "View listing" })}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setLocation("/admin")}>
            {t("boost.backAdmin", { defaultValue: "Back to admin" })}
          </Button>
        </div>
      </div>
    );
  }

  // ── Instant activation success screen ─────────────────────────────────────
  // Shown after wallet or Stripe card payment activates the boost immediately.
  if (step === "activated") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-gradient-to-b from-green-50 to-background dark:from-green-950/20 dark:to-background">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="relative mx-auto h-24 w-24">
            <div className="absolute inset-0 rounded-full bg-green-200 dark:bg-green-900/40 animate-ping opacity-40" />
            <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shadow-xl shadow-green-500/30">
              <CheckCheck className="h-11 w-11 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-foreground mb-2">
              {t("boost.liveTitle", { defaultValue: "Boost Active!" })}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t("boost.liveDesc", {
                defaultValue: "Your listing is now live as a boosted ad. It will appear at the top of search results and the video feed.",
              })}
            </p>
          </div>
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-2xl p-4 text-left space-y-2">
            <p className="text-sm font-bold text-green-800 dark:text-green-300 flex items-center gap-2">
              <CheckCheck className="h-4 w-4 shrink-0" />
              {t("boost.boostBenefits", { defaultValue: "What you get:" })}
            </p>
            {[
              t("boost.benefit1", { defaultValue: "Your listing appears at the top of search results." }),
              t("boost.benefit2", { defaultValue: "Visible in the video feed to buyers in your area." }),
              t("boost.benefit3", { defaultValue: `Plan active for ${plan?.replace("day", "") ?? "?"} days.` }),
            ].map((txt, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="h-5 w-5 rounded-full bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">✓</div>
                <p className="text-sm text-green-700 dark:text-green-400">{txt}</p>
              </div>
            ))}
          </div>
          <Button className="w-full h-12 font-bold text-base" onClick={() => setLocation(`/listings/${listingId}`)}>
            {t("boost.viewMyListing", { defaultValue: "View My Listing" })}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setLocation("/")}>
            {t("boost.backHome", { defaultValue: "Back to Home" })}
          </Button>
        </div>
      </div>
    );
  }

  // ── Pending-review screen ───────────────────────────────────────────────────
  // Shown after the seller submits their payment reference (USDT/SEPA/Apple).
  // The boost is NOT yet active; an admin must verify the payment first.
  if (step === "success") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-gradient-to-b from-amber-50 to-background dark:from-amber-950/20 dark:to-background">
        <div className="w-full max-w-sm text-center space-y-6">
          <div className="relative mx-auto h-24 w-24">
            <div className="relative h-24 w-24 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-xl shadow-amber-400/30">
              <Clock className="h-11 w-11 text-white" />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-foreground mb-2">
              {t("boost.pendingReviewTitle", { defaultValue: "Payment Under Review" })}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t("boost.pendingReviewDesc", {
                defaultValue: "Your payment reference has been received. An admin will verify it and activate your boost shortly.",
              })}
            </p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 text-left space-y-2.5">
            <p className="text-sm font-bold text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <Info className="h-4 w-4 shrink-0" />
              {t("boost.whatHappensNext", { defaultValue: "What happens next?" })}
            </p>
            {[
              t("boost.pendingStep1", { defaultValue: "Admin verifies your payment reference." }),
              t("boost.pendingStep2", { defaultValue: "Once confirmed your listing goes live as a boosted ad." }),
            ].map((txt, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="h-5 w-5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{i + 1}</div>
                <p className="text-sm text-amber-700 dark:text-amber-400">{txt}</p>
              </div>
            ))}
            <div className="flex items-start gap-2.5">
              <div className="h-5 w-5 rounded-full bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">3</div>
              <p className="text-sm text-amber-700 dark:text-amber-400">
                {t("boost.pendingStep3", { defaultValue: "Your plan" })} <strong className="text-amber-800 dark:text-amber-300">{getPlanLabel(plan)}</strong> {t("boost.pendingStep3b", { defaultValue: "starts from that moment." })}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("boost.pendingReviewNote", { defaultValue: "You will receive a notification once your boost is activated." })}
          </p>
          <Button className="w-full h-12 font-bold text-base" onClick={() => setLocation(`/listings/${listingId}`)} data-testid="button-view-listing">
            {t("boost.viewListing")}
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => setLocation("/")}>
            {t("boost.backHome")}
          </Button>
        </div>
      </div>
    );
  }

  // ── Main page ───────────────────────────────────────────────────────────────
  return (
    <div className="max-w-lg mx-auto px-4 py-6">
      {/* ── Return-to-app banner ──────────────────────────────────────────── */}
      {showReturnApp && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 dark:border-orange-800/40 dark:bg-orange-950/20 px-4 py-3">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-lg">📱</span>
            <p className="text-sm font-medium text-orange-800 dark:text-orange-300 truncate">
              Tap to return to Flexa Market app.
            </p>
          </div>
          <button
            className="shrink-0 rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600 active:bg-orange-700 transition-colors"
            onClick={() => { window.location.href = "flexamarket://"; }}
          >
            Open App
          </button>
        </div>
      )}
      {/* ── Gradient Hero Header ── */}
      {/* paddingTop respects --safe-top so the back button never lands
          under the iPhone Dynamic Island / Android display cutout when
          rendered inside a native WebView wrapper. */}
      <div className="-mx-4 -mt-6 mb-6 relative bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{backgroundImage:"radial-gradient(ellipse at 10% 60%, rgba(255,255,255,0.18) 0%, transparent 55%)"}} />
        <div className="relative px-4 pb-5" style={{ paddingTop: "calc(16px + var(--safe-top, env(safe-area-inset-top, 0px)))" }}>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/20 shrink-0 rounded-full"
              onClick={() => {
                if (step === "audience") setLocation(`/listings/${listingId}`);
                else if (step === "budget") setStep("audience");
                else if (step === "pay") setStep("budget");
                else setLocation(`/listings/${listingId}`);
              }}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-extrabold text-white flex items-center gap-2 leading-tight">
                <Zap className="h-4 w-4 text-yellow-200 fill-yellow-200 shrink-0" />
                {t("boost.boostListing")}
              </h1>
              {listing && (
                <p className="text-xs text-white/75 truncate mt-0.5">{(listing as any).title}</p>
              )}
              {/* Listing price chip with local → USD converter */}
              {listing && (listing as any).price > 0 && (() => {
                const lCurrency: string = (listing as any).currency ?? "USD";
                const lPrice: number = (listing as any).price;
                const localStr = formatPrice(lPrice, (listing as any).country, lCurrency);
                let usdEq: string | null = null;
                if (lCurrency === "HTG" && exchangeRate) {
                  usdEq = `≈ $${htgToUsd(lPrice, exchangeRate.displayRate).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
                } else if (lCurrency === "DOP") {
                  usdEq = `≈ $${dopToUsd(lPrice).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
                }
                return (
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="inline-flex items-center gap-1 bg-white/20 backdrop-blur-sm border border-white/30 rounded-full px-2 py-0.5 text-[11px] font-bold text-white">
                      🏷️ {localStr}
                    </span>
                    {usdEq && (
                      <span className="inline-flex items-center gap-1 bg-white/15 border border-white/20 rounded-full px-2 py-0.5 text-[11px] font-medium text-white/80">
                        {usdEq}
                      </span>
                    )}
                  </div>
                );
              })()}
            </div>
            {step !== "audience" && (
              <div className="shrink-0 bg-white/20 backdrop-blur-sm border border-white/30 rounded-xl px-3 py-1.5 text-center">
                <p className="text-[10px] text-white/70 leading-none mb-0.5">Total</p>
                <p className="text-sm font-black text-white tabular-nums">${budget.toFixed(2)}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Admin control panel ──────────────────────────────────────────────── */}
      {isAdmin && (
        <div className="mb-6 rounded-xl border-2 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-4" data-testid="admin-boost-panel">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-amber-600 flex-shrink-0" />
            <span className="text-sm font-bold text-amber-800 dark:text-amber-300">Admin Boost Control</span>
          </div>

          {/* Mode selector */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAdminMode("free")}
              className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-all ${
                adminMode === "free"
                  ? "border-green-500 bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                  : "border-border bg-card text-muted-foreground hover:border-green-400"
              }`}
              data-testid="admin-boost-mode-free"
            >
              🎁 {t("boost.adminFreeMode", { defaultValue: "Free Boost" })}
            </button>
            <button
              type="button"
              onClick={() => setAdminMode("paid")}
              className={`flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-all ${
                adminMode === "paid"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground hover:border-primary/40"
              }`}
              data-testid="admin-boost-mode-paid"
            >
              💳 {t("boost.adminPaidMode", { defaultValue: "Paid (All Methods)" })}
            </button>
          </div>

          {adminMode === "free" && (
            <div className="space-y-2">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {t("boost.adminFreeNote", { defaultValue: "Boost activates immediately with no payment required." })}
              </p>
              {/* Quota badge */}
              {quotaData && (
                quotaData.isSuperAdmin ? (
                  <div className="flex items-center gap-1.5 bg-green-100 dark:bg-green-900/30 rounded-lg px-3 py-1.5">
                    <span className="text-xs font-bold text-green-700 dark:text-green-400">♾ Boost gratis san limit (Super Admin)</span>
                  </div>
                ) : (
                  <div className={`flex items-center justify-between rounded-lg px-3 py-1.5 ${quotaData.used >= (quotaData.limit ?? 3) ? "bg-red-100 dark:bg-red-900/30" : "bg-blue-100 dark:bg-blue-900/30"}`}>
                    <span className="text-xs font-semibold text-blue-800 dark:text-blue-300">
                      Boost gratis mwa sa
                    </span>
                    <span className={`text-xs font-black tabular-nums ${quotaData.used >= (quotaData.limit ?? 3) ? "text-red-600 dark:text-red-400" : "text-blue-700 dark:text-blue-300"}`}>
                      {quotaData.used}/{quotaData.limit}
                    </span>
                  </div>
                )
              )}
              <p className="text-xs text-amber-600 dark:text-amber-500">
                {t("boost.adminFreeWizardHint", { defaultValue: "Swiv étap yo anba a pou konfigire audience, dire, ak vidyo promo ou." })}
              </p>
            </div>
          )}

          {adminMode === "paid" && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {t("boost.adminPaidNote", { defaultValue: "All payment methods unlocked. Payment still goes through pending review before activation." })}
            </p>
          )}
        </div>
      )}

      {/* Stepper + step content — shown for all modes */}
      {(
        <div className="mb-6">
          {/* Progress bar */}
          <div className="relative h-1.5 bg-muted rounded-full mb-4 overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-500"
              style={{ width: step === "audience" ? "33%" : step === "budget" ? "66%" : "100%" }}
            />
          </div>
          {/* Step pills */}
          <div className="flex items-center gap-1.5">
            {(["audience", "budget", "pay"] as const).map((s, i) => {
              const active = step === s;
              const done = (["audience", "budget", "pay"].indexOf(step) > i);
              const labels = {
                audience: t("boost.stepAudience"),
                budget: t("boost.stepBudget"),
                pay: (isAdmin && adminMode === "free")
                  ? t("boost.stepConfirm", { defaultValue: "Konfime" })
                  : t("boost.stepPay"),
              };
              return (
                <div key={s} className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                  active
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                    : done
                      ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                      : "bg-muted text-muted-foreground"
                )}>
                  <span className={cn(
                    "h-4 w-4 rounded-full flex items-center justify-center text-[10px] font-black shrink-0",
                    active ? "bg-white/25" : done ? "bg-green-500 text-white" : "bg-border"
                  )}>
                    {done ? <Check className="h-2.5 w-2.5" /> : i + 1}
                  </span>
                  {labels[s]}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Step 1: Audience targeting — Meta Ads style ─────────────────────── */}
      {step === "audience" && (
        <div className="md:grid md:grid-cols-3 md:gap-6 space-y-0">

          {/* ── LEFT: Main form ── */}
          <div className="md:col-span-2 space-y-0 divide-y divide-border">

            {/* ── Super-admin: audience country override ── */}
            {isSuperAdmin && (
              <div className="py-5 first:pt-0">
                <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/60 dark:bg-purple-950/20 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold bg-purple-500 text-white rounded-full px-1.5 py-0.5 leading-none">ADMIN</span>
                    <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                      {t("boost.audienceCountry")}
                    </p>
                  </div>
                  <Select
                    value={adminCountry || user?.country || ""}
                    onValueChange={v => { setAdminCountry(v); setAdminCity("__all__"); setAudState(""); setAudCities([]); }}
                  >
                    <SelectTrigger className="h-10 border-purple-300 dark:border-purple-700">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_COUNTRIES.map(c => (
                        <SelectItem key={c} value={c}>
                          {COUNTRY_FLAGS[c]} {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {citiesFor(effectiveAudienceCountry).length > 0 && (
                    <Select value={adminCity || "__all__"} onValueChange={v => setAdminCity(v === "__all__" ? "__all__" : v)}>
                      <SelectTrigger className="h-10 border-purple-300 dark:border-purple-700">
                        <SelectValue placeholder={t("boostWizard.audienceCityAll")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">{t("boostWizard.audienceCityAll")}</SelectItem>
                        {citiesFor(effectiveAudienceCountry).map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>
              </div>
            )}

            {/* Objective */}
            <div className="py-5 first:pt-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                {t("boost.objective", { defaultValue: "Objektif" })}
              </p>
              <div className="space-y-2">
                {([
                  { id: "auto"     as const, icon: "🎯", label: t("boost.objAuto",     { defaultValue: "Otomatik" }),          sub: t("boost.objAutoSub",     { defaultValue: "FLEXA MARKET chwazi pi bon rezilta pou ou" }) },
                  { id: "messages" as const, icon: "💬", label: t("boost.objMessages", { defaultValue: "Resevwa plis mesaj" }), sub: t("boost.objMessagesSub", { defaultValue: "Sible moun ki ka voye ou mesaj rapidman" }) },
                  { id: "views"    as const, icon: "👁️", label: t("boost.objViews",    { defaultValue: "Jwenn plis vi" }),      sub: t("boost.objViewsSub",    { defaultValue: "Montre lis ou a bay plis moun" }) },
                ] as const).map(o => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setObjective(o.id)}
                    data-testid={`button-objective-${o.id}`}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all",
                      objective === o.id
                        ? "border-primary/60 bg-primary/5 shadow-sm"
                        : "border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/30"
                    )}
                  >
                    <span className="text-lg shrink-0">{o.icon}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground leading-tight">{o.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{o.sub}</p>
                    </div>
                    <div className={cn(
                      "w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors",
                      objective === o.id ? "border-primary bg-primary" : "border-muted-foreground/40"
                    )}>
                      {objective === o.id && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Audience type */}
            <div className="py-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("boost.audienceLabel", { defaultValue: "Audience" })}
                </p>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {t("boost.audienceCountry")}: <strong>{effectiveAudienceCountry || "—"}</strong>
                </span>
              </div>

              {/* Advantage+ row */}
              <button
                type="button"
                onClick={() => setAudienceType("advantage_plus")}
                data-testid="button-audience-type-advantage"
                className={cn(
                  "w-full flex items-start gap-3 px-4 py-3.5 rounded-t-xl border text-left transition-all",
                  audienceType === "advantage_plus"
                    ? "border-primary/60 bg-primary/5 border-b-primary/20"
                    : "border-border bg-card hover:bg-muted/20"
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors",
                  audienceType === "advantage_plus" ? "border-primary bg-primary" : "border-muted-foreground/40"
                )}>
                  {audienceType === "advantage_plus" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{t("boost.advantagePlus", { defaultValue: "Audience Advantage+" })}</p>
                    <span className="text-xs font-bold bg-primary/10 text-primary px-1.5 py-0.5 rounded">AI</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("boost.advantagePlusSub", { defaultValue: "Sistèm otomatikman ajiste audience ou pou jwenn pi bon rezilta" })}
                  </p>
                </div>
              </button>

              {/* Custom row */}
              <button
                type="button"
                onClick={() => setAudienceType("custom")}
                data-testid="button-audience-type-custom"
                className={cn(
                  "w-full flex items-start gap-3 px-4 py-3.5 rounded-b-xl border border-t-0 text-left transition-all",
                  audienceType === "custom"
                    ? "border-primary/60 bg-primary/5"
                    : "border-border bg-card hover:bg-muted/20"
                )}
              >
                <div className={cn(
                  "w-4 h-4 rounded-full border-2 shrink-0 mt-0.5 flex items-center justify-center transition-colors",
                  audienceType === "custom" ? "border-primary bg-primary" : "border-muted-foreground/40"
                )}>
                  {audienceType === "custom" && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">{t("boost.customAudience", { defaultValue: "Moun ou chwazi pou sible" })}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("boost.customAudienceSub", { defaultValue: "Konfigire laj, sèks, ak lokasyon moun ou vle rive" })}
                  </p>
                </div>
              </button>

              {/* Custom audience details — shown inline when custom selected */}
              {audienceType === "custom" && (
                <div className="mt-3 border border-border rounded-xl bg-muted/20 p-4 space-y-4">

                  {/* Audience name */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                      {t("boost.audienceName", { defaultValue: "Non Audience" })} <span className="opacity-60">({t("boost.optional")})</span>
                    </label>
                    <Input
                      placeholder={`Audience-${new Date().toISOString().slice(0, 10)}`}
                      value={audienceName}
                      onChange={e => setAudienceName(e.target.value)}
                      className="h-9 text-sm bg-background"
                      data-testid="input-audience-name"
                    />
                  </div>

                  {/* Age range */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-medium text-muted-foreground">
                        {t("boost.ageRange", { defaultValue: "Laj" })}
                      </label>
                      <span className="text-xs font-bold text-primary tabular-nums">
                        {ageMin} – {ageMax === 65 ? "65+" : ageMax}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground w-6 shrink-0">18</span>
                      <div className="flex-1 relative h-5 flex items-center">
                        <div className="absolute w-full h-1 bg-border rounded-full" />
                        <div
                          className="absolute h-1 bg-primary rounded-full"
                          style={{ left: `${((ageMin - 18) / 47) * 100}%`, right: `${100 - ((ageMax - 18) / 47) * 100}%` }}
                        />
                        <input type="range" min={18} max={64} value={ageMin}
                          onChange={e => { const v = parseInt(e.target.value); if (v < ageMax) setAgeMin(v); }}
                          className="absolute w-full h-full opacity-0 cursor-pointer z-10"
                          data-testid="slider-age-min"
                        />
                        <input type="range" min={19} max={65} value={ageMax}
                          onChange={e => { const v = parseInt(e.target.value); if (v > ageMin) setAgeMax(v); }}
                          className="absolute w-full h-full opacity-0 cursor-pointer z-20"
                          data-testid="slider-age-max"
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-7 shrink-0 text-right">65+</span>
                    </div>
                  </div>

                  {/* Gender */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-2">
                      {t("boost.gender", { defaultValue: "Sèks" })}
                    </label>
                    <div className="flex gap-2">
                      {(["all", "male", "female"] as const).map(g => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setGender(g)}
                          data-testid={`button-gender-${g}`}
                          className={cn(
                            "flex-1 py-2 rounded-lg border text-xs font-semibold transition-all",
                            gender === g
                              ? "bg-primary text-white border-primary shadow-sm"
                              : "bg-background text-muted-foreground border-border hover:border-muted-foreground/40"
                          )}
                        >
                          {g === "all" ? t("boost.genderAll", { defaultValue: "Tout" }) : g === "male" ? t("boost.genderMale", { defaultValue: "Gason" }) : t("boost.genderFemale", { defaultValue: "Fanm" })}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Location — Haiti */}
                  {isHaiti ? (
                    <>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                          {t("boost.department")} <span className="text-destructive">*</span>
                        </label>
                        <MobileSelect
                          value={audState}
                          onValueChange={setAudState}
                          placeholder={t("boost.selectDepartment")}
                          options={HAITI_DEPARTMENTS.map(d => ({ value: d, label: d }))}
                          className="text-sm bg-background"
                          data-testid="select-audience-state"
                        />
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-2">
                          {t("boost.commune")} <span className="opacity-60">({t("boost.optional")})</span>
                        </label>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {["Port-au-Prince","Cap-Haïtien","Pétion-Ville","Delmas","Carrefour","Jacmel","Les Cayes","Gonaïves"].map(city => (
                            <button
                              key={city}
                              type="button"
                              onClick={() => audCities.includes(city) ? removeCity(city) : addCity(city)}
                              className={cn(
                                "text-xs px-2.5 py-1 rounded-full border transition-all font-medium",
                                audCities.includes(city)
                                  ? "bg-primary text-white border-primary"
                                  : "bg-background text-muted-foreground border-border hover:border-primary/40"
                              )}
                            >
                              {audCities.includes(city) && <Check className="h-2.5 w-2.5 inline mr-0.5" />}
                              {city}
                            </button>
                          ))}
                        </div>
                        <div className="min-h-[38px] border border-input rounded-lg px-2 py-1.5 flex flex-wrap gap-1.5 items-center focus-within:ring-1 focus-within:ring-ring bg-background text-sm">
                          {audCities.map(c => (
                            <span key={c} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded-full">
                              {c}
                              <button type="button" onClick={() => removeCity(c)} className="hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                            </span>
                          ))}
                          <input
                            className="flex-1 min-w-[100px] text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                            placeholder={audCities.length === 0 ? "Lòt vil…" : ""}
                            value={audCityInput}
                            onChange={e => setAudCityInput(e.target.value)}
                            onKeyDown={handleCityKeyDown}
                            onBlur={() => addCity(audCityInput)}
                            data-testid="input-audience-city"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                          {t("boost.neighborhood")} <span className="opacity-60">({t("boost.optional")})</span>
                        </label>
                        <Input
                          placeholder="Canapé-Vert, Turgeau…"
                          value={audNeighborhood}
                          onChange={e => setAudNeighborhood(e.target.value)}
                          className="h-9 text-sm bg-background"
                          data-testid="input-audience-neighborhood"
                        />
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                          {t("boost.city")} <span className="opacity-60">({t("boost.optional")})</span>
                        </label>
                        <div className="min-h-[38px] border border-input rounded-lg px-2 py-1.5 flex flex-wrap gap-1.5 items-center focus-within:ring-1 focus-within:ring-ring bg-background text-sm">
                          {audCities.map(c => (
                            <span key={c} className="inline-flex items-center gap-1 bg-primary/10 text-primary text-xs font-medium px-2 py-0.5 rounded-full">
                              {c}
                              <button type="button" onClick={() => removeCity(c)} className="hover:text-destructive"><X className="h-2.5 w-2.5" /></button>
                            </span>
                          ))}
                          <input
                            className="flex-1 min-w-[120px] text-sm bg-transparent outline-none placeholder:text-muted-foreground"
                            placeholder={audCities.length === 0 ? "Miami, Brooklyn, Paris… (Enter)" : ""}
                            value={audCityInput}
                            onChange={e => setAudCityInput(e.target.value)}
                            onKeyDown={handleCityKeyDown}
                            onBlur={() => addCity(audCityInput)}
                            data-testid="input-audience-city"
                          />
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">Peze Enter oswa virgule pou ajoute chak vil.</p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground block mb-1.5">
                          {t("boost.stateRegion")} <span className="opacity-60">({t("boost.optional")})</span>
                        </label>
                        <Input
                          placeholder="Florida, NY, Île-de-France…"
                          value={audState}
                          onChange={e => setAudState(e.target.value)}
                          className="h-9 text-sm bg-background"
                          data-testid="input-audience-state"
                        />
                      </div>
                    </>
                  )}

                  {/* Radius */}
                  <div>
                    <label className="text-xs font-medium text-muted-foreground block mb-2">
                      {t("boost.radius")}
                    </label>
                    <div className="flex gap-2">
                      {RADIUS_OPTIONS.map(r => (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setAudRadiusKm(r)}
                          data-testid={`button-radius-${r}`}
                          className={cn(
                            "flex-1 py-1.5 rounded-lg border text-xs font-semibold transition-all",
                            audRadiusKm === r
                              ? "bg-primary/10 border-primary text-primary"
                              : "bg-background border-border text-muted-foreground hover:border-muted-foreground/40"
                          )}
                        >
                          {r}km
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Audience details preview */}
            <div className="py-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                {t("boost.audienceDetails", { defaultValue: "Detay Audience" })}
              </p>
              <div className="rounded-xl border border-border bg-muted/30 divide-y divide-border/60">
                {[
                  { label: t("boost.audienceCountry"), value: effectiveAudienceCountry || user?.country || "—" },
                  { label: t("boost.audienceLabel", { defaultValue: "Type" }),
                    value: audienceType === "advantage_plus" ? "Advantage+ (AI)" : t("boost.customAudience", { defaultValue: "Custom" }) },
                  ...(audienceType === "custom" ? [
                    { label: t("boost.ageRange", { defaultValue: "Laj" }), value: `${ageMin} – ${ageMax === 65 ? "65+" : ageMax}` },
                    { label: t("boost.gender", { defaultValue: "Sèks" }), value: gender === "all" ? t("boost.genderAll", { defaultValue: "Tout" }) : gender === "male" ? t("boost.genderMale", { defaultValue: "Gason" }) : t("boost.genderFemale", { defaultValue: "Fanm" }) },
                    ...(audState ? [{ label: t("boost.department"), value: audState }] : []),
                    ...(audCities.length > 0 ? [{ label: t("boost.commune"), value: audCities.join(", ") }] : []),
                    ...(audRadiusKm ? [{ label: t("boost.radius"), value: `+${audRadiusKm}km` }] : []),
                  ] : []),
                  { label: t("boost.objective", { defaultValue: "Objektif" }),
                    value: objective === "auto" ? t("boost.objAuto", { defaultValue: "Otomatik" }) : objective === "messages" ? t("boost.objMessages", { defaultValue: "Plis mesaj" }) : t("boost.objViews", { defaultValue: "Plis vi" }) },
                ].map(row => (
                  <div key={row.label} className="flex items-center justify-between px-3 py-2">
                    <span className="text-xs text-muted-foreground">{row.label}</span>
                    <span className="text-xs font-semibold text-foreground text-right max-w-[55%] truncate">{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Promo video (optional) ── */}
            <div className="py-5" data-testid="boost-video-section">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
                  <Video className="h-3.5 w-3.5 text-white" />
                </div>
                <p className="text-sm font-bold text-foreground">
                  {t("boost.videoLabel", { defaultValue: "Videyo Promo" })}
                </p>
                <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  {t("boost.optional")}
                </span>
                {videoUrl && (
                  <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded">✓</span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                {t("boost.videoHelp", { defaultValue: "Max 1 minit. Montre kòm overlay lè moun ap navige nan feed la." })}
              </p>
              {videoUrl ? (
                <div className="flex items-center justify-between gap-3 bg-muted rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Video className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm font-medium truncate" data-testid="text-video-attached">
                      {t("boost.videoAttached", { defaultValue: "Videyo ajoute ✓" })}
                    </span>
                  </div>
                  <button type="button" onClick={() => setVideoUrl(null)} className="text-muted-foreground hover:text-destructive p-1" data-testid="button-video-remove">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Button type="button" variant="outline" className="w-full" onClick={() => videoFileInputRef.current?.click()} disabled={videoUploading} data-testid="button-video-pick">
                    <Upload className="h-4 w-4 mr-2" />
                    {videoUploading
                      ? `${t("boost.videoUploading", { defaultValue: "Ap telechaje…" })} ${videoUploadProgress}%`
                      : t("boost.videoPick", { defaultValue: "Chwazi videyo" })}
                  </Button>
                  {videoUploading && (
                    <div
                      className="h-1.5 w-full bg-muted rounded-full overflow-hidden"
                      role="progressbar"
                      aria-valuenow={videoUploadProgress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      data-testid="video-upload-progress"
                    >
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-200"
                        style={{ width: `${videoUploadProgress}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

          </div>

          {/* ── RIGHT: Estimated results panel (desktop only) ── */}
          <div className="hidden md:block md:col-span-1">
            <div className="sticky top-4 space-y-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  {t("boost.estimatedResults", { defaultValue: "Rezilta Estimé" })}
                </p>
                <div className="space-y-3">
                  <div>
                    <p className="text-2xl font-black text-foreground tabular-nums">
                      {plan === "7day" ? "200K–400K" : plan === "3day" ? "20K–50K" : audienceType === "advantage_plus" ? "5K–10K" : audCities.length > 0 ? "2K–5K" : "3K–7K"}
                    </p>
                    <p className="text-xs text-muted-foreground">Views total</p>
                  </div>
                  <div className="h-px bg-border" />
                  <div>
                    <p className="text-xl font-bold text-foreground tabular-nums">
                      {objective === "messages" ? "15–50" : objective === "views" ? "500–2K" : "80–250"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {objective === "messages" ? "Mesaj / jou" : objective === "views" ? "Vi / jou" : "Klik / jou"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-center">
                <Info className="h-4 w-4 text-primary mx-auto mb-2" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("boost.estimatedNote", { defaultValue: "Estimasyon yo baze sou pèfòmans mwayen nan peyi ou a. Rezilta reyèl yo ka varye." })}
                </p>
              </div>
            </div>
          </div>

          {/* Hidden file input — used by promo video section in audience step */}
          <input
            ref={videoFileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={handleVideoSelected}
            data-testid="input-video-file"
          />

          {/* CTA — full width below both columns */}
          <div className="md:col-span-3 pt-2">
            <Button
              className="w-full h-12 text-base font-bold"
              onClick={handleAudienceNext}
              data-testid="button-audience-next"
            >
              {t("boost.continueToBudget")}
            </Button>
          </div>
        </div>
      )}

      {/* ── Step 2: Budget + Plan — Meta Ads Payment style ───────────────────── */}
      {step === "budget" && (
        <div className="md:grid md:grid-cols-3 md:gap-6">

          {/* ── LEFT: Plan + Budget + Payment ── */}
          <div className="md:col-span-2 space-y-0 divide-y divide-border">

            {/* Duration / Plan */}
            <div className="py-5 first:pt-0">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0">
                  <Zap className="h-3.5 w-3.5 text-white fill-white" />
                </div>
                <p className="text-sm font-bold text-foreground">
                  {t("boost.chooseDuration", { defaultValue: "Dire Boost" })}
                </p>
              </div>

              {/* ── Super admin custom duration (1–365 days) ── */}
              {isSuperAdmin && adminMode === "free" ? (
                <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/60 dark:bg-purple-950/20 p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-bold bg-purple-500 text-white rounded-full px-1.5 py-0.5 leading-none">ADMIN</span>
                    <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">Dire pèsonalize (1–365 jou)</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={adminFreeDays}
                      onChange={e => setAdminFreeDays(e.target.value)}
                      className="h-12 text-2xl font-black text-center border-purple-300 dark:border-purple-700 w-28 shrink-0"
                      data-testid="input-super-admin-days"
                    />
                    <div className="flex-1">
                      <input
                        type="range"
                        min={1}
                        max={365}
                        step={1}
                        value={Math.min(parseInt(adminFreeDays, 10) || 7, 365)}
                        onChange={e => setAdminFreeDays(e.target.value)}
                        className="w-full accent-purple-500 h-2 rounded-full"
                      />
                      <div className="flex justify-between text-[10px] text-purple-500 mt-1">
                        <span>1 jou</span>
                        <span className="font-bold text-purple-700 dark:text-purple-300">
                          {parseInt(adminFreeDays, 10) || 7} jou · <span className="text-green-600 dark:text-green-400">GRATIS</span>
                        </span>
                        <span>365 jou</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {[1, 3, 7, 14, 30, 90, 180, 365].map(d => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setAdminFreeDays(String(d))}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-xs font-bold border transition-all",
                          String(adminFreeDays) === String(d)
                            ? "border-purple-500 bg-purple-500 text-white"
                            : "border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 hover:border-purple-400"
                        )}
                      >{d}j</button>
                    ))}
                  </div>
                </div>
              ) : (
              <div className="space-y-2.5">
                {PLANS.map(p => {
                  const badgeLabel = getBadgeLabel(p.badge);
                  const days = p.id === "1day" ? 1 : p.id === "3day" ? 3 : 7;
                  const accentColors = {
                    "1day":  { bar: "bg-blue-500",   ring: "ring-blue-300 dark:ring-blue-700",   glow: "shadow-blue-500/15"   },
                    "3day":  { bar: "bg-orange-500",  ring: "ring-orange-300 dark:ring-orange-700", glow: "shadow-orange-500/15" },
                    "7day":  { bar: "bg-purple-500",  ring: "ring-purple-300 dark:ring-purple-700", glow: "shadow-purple-500/15" },
                  }[p.id]!;
                  const isSelected = plan === p.id;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPlan(p.id)}
                      data-testid={`button-plan-${p.id}`}
                      className={cn(
                        "w-full relative flex items-center gap-3 px-4 py-3.5 rounded-2xl border-2 text-left transition-all overflow-hidden",
                        isSelected
                          ? `border-current shadow-lg ring-2 ${accentColors.ring} ${accentColors.glow}`
                          : "border-border bg-card hover:border-muted-foreground/30 hover:bg-muted/20"
                      )}
                      style={isSelected ? { color: accentColors.bar.replace("bg-", "").includes("orange") ? "#f97316" : accentColors.bar.replace("bg-", "").includes("blue") ? "#3b82f6" : "#a855f7" } : {}}
                    >
                      {/* Left accent bar */}
                      <div className={cn("absolute left-0 inset-y-0 w-1 rounded-l-2xl transition-all", isSelected ? accentColors.bar : "bg-transparent")} />
                      <div className={cn(
                        "w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-all",
                        isSelected ? `${accentColors.bar} border-transparent` : "border-muted-foreground/40"
                      )}>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0 pl-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-foreground">{getPlanLabel(p.id)}</span>
                          {badgeLabel && (
                            <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full", p.badgeColor)}>
                              {badgeLabel}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{getPlanDesc(p.id)}</p>
                        <div className="flex flex-wrap gap-x-3 mt-1.5">
                          {p.perks.slice(0, 2).map(k => (
                            <span key={k} className="text-xs text-muted-foreground flex items-center gap-1">
                              <Check className="h-2.5 w-2.5 text-green-500" />{PERK_KEYS[k]}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {(isAdmin && adminMode === "free") ? (
                          <span className="text-lg font-black text-green-600 dark:text-green-400">GRATIS</span>
                        ) : (
                          <>
                            <p className="text-lg font-black text-foreground">${p.price}</p>
                            <p className="text-[11px] text-muted-foreground tabular-nums">${(p.price / days).toFixed(2)}/jou</p>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              )}
            </div>

            {/* Budget — hidden for free admin mode */}
            {(!isAdmin || adminMode !== "free") && <div className="py-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-black">$</span>
                </div>
                <p className="text-sm font-bold text-foreground">
                  {t("boost.yourBudget", { defaultValue: "Bidjè Total" })}
                </p>
              </div>
              <div className="bg-gradient-to-br from-muted/50 to-card border border-border rounded-2xl p-5">
                <div className="flex items-baseline gap-1 mb-4 justify-center">
                  <span className="text-3xl font-black text-muted-foreground/60">$</span>
                  <Input
                    type="number"
                    step="0.01"
                    min={selectedPlan.price}
                    max={500}
                    value={budget}
                    onChange={e => setBudget(parseFloat(e.target.value) || 0)}
                    className="text-5xl font-black h-16 border-0 shadow-none focus-visible:ring-0 px-0 w-full text-center bg-transparent"
                    data-testid="input-budget"
                  />
                  <span className="text-sm font-bold text-muted-foreground/60 self-center">USD</span>
                </div>
                <input
                  type="range"
                  min={selectedPlan.price}
                  max={100}
                  step={0.5}
                  value={Math.min(budget, 100)}
                  onChange={e => setBudget(parseFloat(e.target.value))}
                  className="w-full accent-primary h-2 rounded-full"
                  data-testid="slider-budget"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-2">
                  <span className="font-medium">{t("boost.min")}: ${selectedPlan.price.toFixed(2)}</span>
                  <span className="font-medium">{t("boost.max")}: $100+</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{t("boost.budgetNote")}</p>
            </div>}

            {/* Payment method — hidden for free admin mode */}
            {(!isAdmin || adminMode !== "free") && <div className="py-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center shrink-0">
                  <CreditCard className="h-3.5 w-3.5 text-white" />
                </div>
                <p className="text-sm font-bold text-foreground">
                  {t("boost.paymentMethod", { defaultValue: "Metòd Peman" })}
                </p>
              </div>
              <div className="space-y-2">
                {PAY_METHODS.map(m => {
                  const isUsdtUnavailable = m.id === "usdt" && !USDT_WALLET.trim();
                  return (
                    <button
                      key={m.id}
                      onClick={() => !isUsdtUnavailable && setPayMethod(m.id)}
                      disabled={isUsdtUnavailable}
                      data-testid={`button-payment-${m.id}`}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition-all",
                        isUsdtUnavailable
                          ? "border-border bg-card opacity-50 cursor-not-allowed"
                          : payMethod === m.id
                            ? "border-primary/60 bg-primary/5"
                            : "border-border bg-card hover:bg-muted/20"
                      )}
                    >
                      <div className={cn(
                        "w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors",
                        payMethod === m.id && !isUsdtUnavailable ? "border-primary bg-primary" : "border-muted-foreground/40"
                      )}>
                        {payMethod === m.id && !isUsdtUnavailable && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                      </div>
                      <span className="text-xl shrink-0">{m.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{m.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {isUsdtUnavailable ? "Currently unavailable — choose another method" : m.sub}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {/* Wallet insufficient banner */}
              {payMethod === "wallet" && !walletSufficient && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/40 p-3 flex items-start gap-2">
                  <span className="text-amber-400 text-sm shrink-0">⚠️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Balans pa ase</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      Ou gen <strong>${walletBalance.toFixed(2)}</strong>, ou bezwen <strong>${budget.toFixed(2)}</strong>.
                      Ou bezwen rechaje <strong>${(budget - walletBalance).toFixed(2)}</strong> plis.
                    </p>
                    <a href="/wallet" className="text-xs text-primary font-bold underline mt-1 block">→ Rechaje Kont Promosyon</a>
                  </div>
                </div>
              )}
              {/* Wallet sufficient banner */}
              {payMethod === "wallet" && walletSufficient && (
                <div className="mt-3 rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800/40 p-3 flex items-center gap-2">
                  <span className="text-green-400 text-sm">✓</span>
                  <p className="text-sm text-green-800 dark:text-green-300 font-medium">
                    Balans ase — Boost pral aktive imedyatman apre ou klike "Kontinye".
                  </p>
                </div>
              )}
            </div>}


          </div>

          {/* ── RIGHT: Payment Summary (Meta style) ── */}
          <div className="md:col-span-1 space-y-4 mt-6 md:mt-0">
            <div className="sticky top-4 space-y-3">

              {/* Estimated daily results */}
              {estimatedReach && estimatedReach > 0 ? (
                <div className="rounded-xl border border-border bg-card p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                    {t("boost.estimatedResults", { defaultValue: "Rezilta Estimé / Jou" })}
                  </p>
                  <div className="space-y-2.5">
                    <div>
                      <p className="text-2xl font-black text-foreground tabular-nums">~{estimatedReach.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Moun ou ka rive</p>
                    </div>
                    <div className="h-px bg-border" />
                    <div>
                      <p className="text-xl font-bold text-foreground tabular-nums">
                        {objective === "messages" ? "8–24" : objective === "views" ? "120–350" : "20–60"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {objective === "messages" ? "Mesaj / jou" : objective === "views" ? "Vi / jou" : "Klik / jou"}
                      </p>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* Payment summary — always shown */}
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                  {t("boost.paymentSummary", { defaultValue: "Rezime Peman" })}
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("boost.objective", { defaultValue: "Objektif" })}</span>
                    <span className="font-medium text-foreground">
                      {objective === "auto" ? "Otomatik" : objective === "messages" ? "Plis mesaj" : "Plis vi"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Audience</span>
                    <span className="font-medium text-foreground truncate max-w-[120px] text-right">
                      {audienceType === "advantage_plus" ? "Advantage+" : `Custom · ${ageMin}–${ageMax === 65 ? "65+" : ageMax}`}
                    </span>
                  </div>
                  {audience.state && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{t("boost.department")}</span>
                      <span className="font-medium text-foreground">{audience.state}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("boost.duration", { defaultValue: "Dire" })}</span>
                    <span className="font-medium text-foreground">
                      {(isSuperAdmin && adminMode === "free")
                        ? `${parseInt(adminFreeDays, 10) || 7} jou`
                        : getPlanLabel(plan)}
                    </span>
                  </div>
                  {(!isAdmin || adminMode !== "free") && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tari / jou</span>
                    <span className="font-medium text-foreground">
                      ${(budget / (plan === "1day" ? 1 : plan === "3day" ? 3 : 7)).toFixed(2)}
                    </span>
                  </div>
                  )}
                  <div className="h-px bg-border my-1" />
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-semibold text-foreground">{t("boost.totalDue", { defaultValue: "Total" })}</span>
                    {(isAdmin && adminMode === "free") ? (
                      <span className="text-2xl font-black text-green-600 dark:text-green-400">$0.00</span>
                    ) : (
                      <span className="text-2xl font-black text-foreground">${budget.toFixed(2)}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("boost.adRunFor", { defaultValue: "Piblisite ou a ap kouri pou" })} {plan === "1day" ? "1 jou" : plan === "3day" ? "3 jou" : "7 jou"}.
                  </p>
                </div>
              </div>

              {/* CTA */}
              {(isAdmin && adminMode === "free") ? (
                <Button
                  className="w-full h-11 text-sm font-bold bg-green-600 hover:bg-green-700 border-0 text-white"
                  onClick={() => setStep("pay")}
                  data-testid="button-proceed-to-confirm"
                >
                  <Zap className="h-4 w-4 mr-1.5" />
                  {t("boost.continueToConfirm", { defaultValue: "Ale nan Konfirmasyon →" })}
                </Button>
              ) : (
                <Button
                  className="w-full h-11 text-sm font-bold"
                  onClick={handleInitiate}
                  disabled={loading || videoUploading}
                  data-testid="button-proceed-to-pay"
                >
                  {loading ? t("boost.processing") : videoUploading ? t("boost.videoUploading", { defaultValue: "Ap telechaje videyo…" }) : t("boost.publishAd", { amount: budget.toFixed(2) })}
                </Button>
              )}
              <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                <Shield className="h-3 w-3" />
                {(isAdmin && adminMode === "free") ? t("boost.adminFreeNote", { defaultValue: "Boost activates immediately with no payment required." }) : t("boost.securePay")}
              </div>
            </div>
          </div>

          {/* Mobile CTA (below both columns) */}
          <div className="md:hidden mt-6">
            {(isAdmin && adminMode === "free") ? (
              <Button
                className="w-full h-12 text-base font-bold bg-green-600 hover:bg-green-700 border-0 text-white"
                onClick={() => setStep("pay")}
                data-testid="button-proceed-to-confirm-mobile"
              >
                <Zap className="h-4 w-4 mr-1.5" />
                {t("boost.continueToConfirm", { defaultValue: "Ale nan Konfirmasyon →" })}
              </Button>
            ) : (
              <Button
                className="w-full h-12 text-base font-bold"
                onClick={handleInitiate}
                disabled={loading || videoUploading}
                data-testid="button-proceed-to-pay-mobile"
              >
                {loading ? t("boost.processing") : videoUploading ? t("boost.videoUploading", { defaultValue: "Ap telechaje videyo…" }) : `${t("boost.continue")} — $${budget.toFixed(2)}`}
              </Button>
            )}
            <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-2">
              <Shield className="h-3 w-3" />
              {(isAdmin && adminMode === "free") ? t("boost.adminFreeNote", { defaultValue: "Boost activates immediately with no payment required." }) : t("boost.securePay")}
            </div>
          </div>

        </div>
      )}

      {/* ── Admin Free Boost: Step 3 — Confirm & Activate ───────────────────── */}
      {step === "pay" && isAdmin && adminMode === "free" && (
        <div className="space-y-5">

          {/* Header */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-300 dark:border-green-800">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shrink-0">
              <Zap className="h-5 w-5 text-white fill-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-green-800 dark:text-green-300">
                {t("boost.adminFreeConfirmTitle", { defaultValue: "Konfime Boost Gratis" })}
              </p>
              <p className="text-xs text-green-700 dark:text-green-400">
                {t("boost.adminFreeNote", { defaultValue: "Boost activates immediately with no payment required." })}
              </p>
            </div>
          </div>

          {/* Quota counter */}
          {quotaData && (
            quotaData.isSuperAdmin ? (
              <div className="flex items-center gap-2 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 px-4 py-3">
                <span className="text-lg">♾</span>
                <div>
                  <p className="text-sm font-bold text-purple-800 dark:text-purple-300">Super Admin — Limit san bout</p>
                  <p className="text-xs text-purple-600 dark:text-purple-400">Ou ka kreye kantite boost gratis ou vle.</p>
                </div>
              </div>
            ) : (
              <div className={`flex items-center justify-between rounded-xl px-4 py-3 border ${
                quotaData.used >= (quotaData.limit ?? 3)
                  ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800"
                  : "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
              }`}>
                <div>
                  <p className={`text-sm font-bold ${quotaData.used >= (quotaData.limit ?? 3) ? "text-red-800 dark:text-red-300" : "text-blue-800 dark:text-blue-300"}`}>
                    {quotaData.used >= (quotaData.limit ?? 3)
                      ? t("boost.adminQuotaReached", { defaultValue: "Limit mansyèl atenn" })
                      : t("boost.adminQuotaRemaining", { defaultValue: "Boost gratis restant mwa sa" })}
                  </p>
                  <p className={`text-xs ${quotaData.used >= (quotaData.limit ?? 3) ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}`}>
                    {quotaData.used >= (quotaData.limit ?? 3)
                      ? "Eseye mwa pwochen."
                      : `${(quotaData.limit ?? 3) - quotaData.used} restant`}
                  </p>
                </div>
                <div className={`text-2xl font-black tabular-nums ${quotaData.used >= (quotaData.limit ?? 3) ? "text-red-600 dark:text-red-400" : "text-blue-700 dark:text-blue-300"}`}>
                  {quotaData.used}/{quotaData.limit}
                </div>
              </div>
            )
          )}

          {/* Boost summary */}
          <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {t("boost.paymentSummary", { defaultValue: "Rezime Boost" })}
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("boost.objective", { defaultValue: "Objektif" })}</span>
                <span className="font-medium text-foreground">
                  {objective === "auto" ? "Otomatik" : objective === "messages" ? "Plis mesaj" : "Plis vi"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Audience</span>
                <span className="font-medium text-foreground">
                  {audienceType === "advantage_plus" ? "Advantage+ (AI)" : `Custom · ${ageMin}–${ageMax === 65 ? "65+" : ageMax}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Peyi</span>
                <span className="font-medium text-foreground">
                  {effectiveAudienceCountry || (listing as any)?.country || user?.country || "—"}
                </span>
              </div>
              {audState && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("boost.department")}</span>
                  <span className="font-medium text-foreground">{audState}</span>
                </div>
              )}
              {adminCity && adminCity !== "__all__" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vil</span>
                  <span className="font-medium text-foreground">{adminCity}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("boost.duration", { defaultValue: "Dire" })}</span>
                <span className="font-medium text-foreground">
                  {(isSuperAdmin && adminMode === "free")
                    ? `${parseInt(adminFreeDays, 10) || 7} jou`
                    : getPlanLabel(plan)}
                </span>
              </div>
              {videoUrl && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vidyo promo</span>
                  <span className="font-medium text-green-600 dark:text-green-400">✓ Ajoute</span>
                </div>
              )}
              <div className="h-px bg-border my-1" />
              <div className="flex justify-between items-baseline">
                <span className="text-sm font-semibold text-foreground">{t("boost.totalDue", { defaultValue: "Total" })}</span>
                <span className="text-2xl font-black text-green-600 dark:text-green-400">$0.00</span>
              </div>
            </div>
          </div>

          {/* Boost Now button */}
          <Button
            className="w-full h-13 text-base font-bold bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 border-0 text-white shadow-lg shadow-green-500/25"
            onClick={handleAdminFreeBoost}
            disabled={adminFreeLoading || (!!quotaData && !quotaData.isSuperAdmin && quotaData.used >= (quotaData.limit ?? 3))}
            data-testid="button-admin-free-boost"
          >
            {adminFreeLoading ? (
              <>{t("boost.boosting", { defaultValue: "Ap aktive…" })}</>
            ) : (
              <><Zap className="h-5 w-5 mr-2 fill-white" />{t("boost.adminBoostNow", { defaultValue: "Aktive Boost Gratis Kounye a" })}</>
            )}
          </Button>

          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="h-3 w-3" />
            {t("boost.adminFreeNote", { defaultValue: "Boost activates immediately with no payment required." })}
          </div>
        </div>
      )}

      {/* ── Step 2: Wallet payment ───────────────────────────────────────────── */}
      {step === "pay" && (!isAdmin || adminMode === "paid") && payMethod === "wallet" && (
        <div className="space-y-4">
          {/* Amount summary pill */}
          <div className="flex items-center justify-between bg-gradient-to-r from-primary/10 to-orange-500/10 border border-primary/20 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">💰</span>
              <span className="text-sm font-bold text-foreground">{t("boost.walletMethod", "Kont Promosyon")}</span>
            </div>
            <span className="text-lg font-black text-primary">${budget.toFixed(2)}</span>
          </div>

          <div className="rounded-2xl border-2 border-dashed border-border bg-gradient-to-br from-muted/30 to-card p-6 text-center space-y-4">
            <div className="flex flex-col items-center gap-1">
              <p className="text-xs text-muted-foreground uppercase tracking-widest">Balans disponib</p>
              <p className={cn("text-4xl font-black tabular-nums", walletSufficient ? "text-green-600 dark:text-green-400" : "text-destructive")}>
                ${walletBalance.toFixed(2)}
              </p>
              {!walletSufficient && (
                <p className="text-xs text-muted-foreground">
                  Bezwen <strong>${(budget - walletBalance).toFixed(2)}</strong> plis
                </p>
              )}
            </div>

            {walletSufficient ? (
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-3">
                <p className="text-sm text-green-700 dark:text-green-400 font-medium">
                  ✓ Balans ase — Boost pral aktive imedyatman
                </p>
              </div>
            ) : (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                <p className="text-sm text-red-700 dark:text-red-400 font-medium">Balans pa ase — rechaje kont ou</p>
              </div>
            )}
          </div>

          {walletSufficient ? (
            <Button
              className="w-full h-13 font-bold text-base bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 border-0 text-white shadow-lg shadow-orange-500/25"
              onClick={handleInitiate}
              disabled={loading || videoUploading}
            >
              {loading ? "Ap tretman…" : videoUploading ? t("boost.videoUploading", { defaultValue: "Ap telechaje videyo…" }) : `⚡ Aktive Boost — $${budget.toFixed(2)}`}
            </Button>
          ) : (
            <a
              href="/wallet"
              className="flex items-center justify-center w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:opacity-90 transition-opacity"
            >
              Rechaje Kont Promosyon →
            </a>
          )}
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="h-3 w-3" /> {t("boost.securePay")}
          </div>
        </div>
      )}

      {/* ── Step 2: Card payment via Stripe Checkout ─────────────────────── */}
      {step === "pay" && (!isAdmin || adminMode === "paid") && payMethod === "card" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-200 dark:border-blue-800 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600" />
              <span className="text-sm font-bold text-foreground">Stripe Checkout</span>
            </div>
            <span className="text-lg font-black text-foreground">${budget.toFixed(2)}</span>
          </div>

          <div className="rounded-2xl border border-border bg-gradient-to-br from-muted/30 to-card p-6 space-y-5">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/25 shrink-0">
                <CreditCard className="h-7 w-7 text-white" />
              </div>
              <div>
                <p className="font-bold text-foreground">Stripe Secure Checkout</p>
                <p className="text-xs text-muted-foreground mt-0.5">256-bit SSL · PCI-DSS compliant</p>
                <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                  {["Visa", "MC", "Amex"].map(brand => (
                    <span key={brand} className="text-[10px] bg-muted border border-border px-1.5 py-0.5 rounded font-bold text-muted-foreground">{brand}</span>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("boost.stripeCardDesc", { defaultValue: "Ou pral redirijé vè paj peman Stripe ki sekirize pou antre enfòmasyon kat ou a." })}
            </p>
          </div>

          <div className="bg-card border border-border rounded-2xl px-4 py-3 flex justify-between items-center">
            <span className="font-semibold text-muted-foreground">{getPlanLabel(plan)}</span>
            <span className="text-2xl font-black text-foreground">${budget.toFixed(2)}</span>
          </div>

          <Button
            className="w-full h-12 font-bold text-base bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 border-0 text-white shadow-lg shadow-blue-500/25"
            onClick={handleCardPay}
            disabled={loading}
            data-testid="button-pay-card"
          >
            {loading ? t("boost.processingPayment") : `💳 ${t("boost.pay")} $${budget.toFixed(2)} · Stripe`}
          </Button>
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="h-3 w-3" /> {t("boost.securePay")} · Powered by Stripe
          </div>
        </div>
      )}

      {/* ── Step 2: SEPA Bank Transfer ─────────────────────────────────────── */}
      {step === "pay" && (!isAdmin || adminMode === "paid") && payMethod === "sepa" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-gradient-to-r from-purple-500/10 to-violet-500/10 border border-purple-200 dark:border-purple-800 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-lg">🏦</span>
              <span className="text-sm font-bold text-foreground">{t("boost.sepaMethod")}</span>
            </div>
            <span className="text-lg font-black text-foreground">${budget.toFixed(2)}</span>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
            <div>
              <Label className="text-sm font-semibold mb-2 block">{t("boost.accountHolder")}</Label>
              <Input
                placeholder="Jean Dupont"
                value={ibanName}
                onChange={e => setIbanName(e.target.value)}
                className="h-11"
                data-testid="input-sepa-name"
              />
            </div>
            <div>
              <Label className="text-sm font-semibold mb-2 block">{t("boost.iban")}</Label>
              <Input
                placeholder="FR76 3000 6000 0112 3456 7890 189"
                value={iban}
                onChange={e => setIban(e.target.value.toUpperCase())}
                className="font-mono h-11"
                data-testid="input-sepa-iban"
              />
            </div>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">{t("boost.demoNotice")}</p>
          </div>

          <Button
            className="w-full h-12 font-bold text-base"
            onClick={handleSepaPay}
            disabled={loading}
            data-testid="button-pay-sepa"
          >
            {loading ? t("boost.processingPayment") : `🏦 ${t("boost.pay")} $${budget.toFixed(2)}`}
          </Button>
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="h-3 w-3" /> {t("boost.securePay")}
          </div>
        </div>
      )}

      {/* ── Step 2: Apple Pay ──────────────────────────────────────────────── */}
      {step === "pay" && (!isAdmin || adminMode === "paid") && payMethod === "apple" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-muted border border-border rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-lg"></span>
              <span className="text-sm font-bold text-foreground">{t("boost.appleMethod")}</span>
            </div>
            <span className="text-lg font-black text-foreground">${budget.toFixed(2)}</span>
          </div>

          <div className="rounded-2xl border border-border bg-gradient-to-br from-neutral-900 to-neutral-800 dark:from-neutral-800 dark:to-neutral-900 p-8 text-center space-y-2">
            <p className="text-5xl"></p>
            <p className="text-sm text-neutral-400">{t("boost.amount")}</p>
            <p className="text-5xl font-black text-white tabular-nums">${budget.toFixed(2)}</p>
            <p className="text-xs text-neutral-500">{getPlanLabel(plan)}</p>
          </div>

          <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">{t("boost.demoNotice")}</p>
          </div>

          <Button
            className="w-full h-12 font-bold text-base bg-black text-white hover:bg-neutral-900 dark:bg-white dark:text-black dark:hover:bg-neutral-100 border-0 shadow-lg"
            onClick={handleApplePay}
            disabled={loading}
            data-testid="button-pay-apple"
          >
            {loading ? t("boost.processingPayment") : `  ${t("boost.payWithApple")}`}
          </Button>
          <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
            <Shield className="h-3 w-3" /> {t("boost.securePay")}
          </div>
        </div>
      )}

      {/* ── Step 2: USDT ───────────────────────────────────────────────────── */}
      {step === "pay" && (!isAdmin || adminMode === "paid") && payMethod === "usdt" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-200 dark:border-emerald-800 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="text-lg font-black text-emerald-600">₮</span>
              <span className="text-sm font-bold text-foreground">USDT TRC-20</span>
            </div>
            <span className="text-lg font-black text-foreground">${budget.toFixed(2)}</span>
          </div>

          <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-gradient-to-br from-emerald-950 to-teal-950 p-6 text-center space-y-1">
            <p className="text-sm text-emerald-400">Montan pou voye</p>
            <p className="text-5xl font-black text-white tabular-nums">${budget.toFixed(2)}</p>
            <p className="text-xs text-emerald-500 font-bold">USDT · TRC-20</p>
          </div>

          <div>
            <Label className="text-sm font-semibold mb-2 block">{t("boost.sendTo")}</Label>
            {USDT_WALLET.trim() ? (
              <div className="bg-muted rounded-xl p-3 flex items-center gap-2 border border-border">
                <code className="text-xs flex-1 break-all text-foreground font-mono">{USDT_WALLET}</code>
                <button
                  onClick={copyWallet}
                  className="flex-shrink-0 p-2 rounded-lg hover:bg-border transition-colors"
                  data-testid="button-copy-wallet"
                >
                  {copied ? <CheckCheck className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4 text-muted-foreground" />}
                </button>
              </div>
            ) : (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                <p className="text-sm text-destructive">USDT payments are currently unavailable. Please choose another payment method.</p>
              </div>
            )}
            <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> {t("boost.onlyTrc20")}
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 space-y-2.5">
            {[
              "Ouvri wallet crypto ou (Trust Wallet, Binance…)",
              `Voye egzakteman $${budget.toFixed(2)} USDT (TRC-20)`,
              "Kopye transaction hash (TXID) ou a",
              "Kole li anba a epi konfime",
            ].map((stepText, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="h-6 w-6 rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-white text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5 shadow-sm">{i + 1}</div>
                <p className="text-sm text-foreground leading-relaxed">{stepText}</p>
              </div>
            ))}
          </div>

          <div>
            <Label className="text-sm font-semibold mb-1.5 block">{t("boost.txHash")}</Label>
            <Input
              placeholder={t("boost.txHashPlaceholder")}
              value={txHash}
              onChange={e => setTxHash(e.target.value)}
              className="font-mono text-sm"
              data-testid="input-tx-hash"
            />
          </div>

          <Button
            className="w-full h-12 font-bold text-base"
            onClick={handleUsdtConfirm}
            disabled={loading || !txHash.trim() || !USDT_WALLET.trim()}
            data-testid="button-confirm-usdt"
          >
            {loading ? t("boost.verifying") : t("boost.sentPayment")}
          </Button>
          <p className="text-xs text-muted-foreground text-center">{t("boost.txHashNote")}</p>
        </div>
      )}

    </div>
  );
}
