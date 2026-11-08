import { useState, useEffect, useMemo, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import {
  Zap, Check, CreditCard, ArrowLeft, Clock, Eye,
  Copy, CheckCheck, AlertCircle, Shield, Info,
  Video, X, Upload, Loader2, Gift, Target, MessageCircle,
} from "lucide-react";
import "./boost-listing.css";
import "./flexa-boost.css";
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
import {
  BoostVideoUploadError,
  MAX_BOOST_VIDEO_BYTES,
} from "@/lib/boostVideoUpload";
import { isAndroidApp } from "@/lib/androidPurchasePolicy";
import { startVideoUpload } from "@/lib/videoUploadQueue";
import { probeVideoDuration } from "@/lib/probeVideoDuration";
import { VideoUploadChooser } from "@/components/VideoUploadCenter";
import { BoostProductCard } from "@/components/boost/BoostProductCard";
import { BoostAdPreview } from "@/components/boost/BoostAdPreview";
import { BoostAudiencePanel, type BoostAudiencePanelHandle } from "@/components/boost/BoostAudiencePanel";
import { scrollToInvalidField } from "@/lib/formValidation";
import { AdaptiveVideoPlayer } from "@/components/media/AdaptiveVideoPlayer";

const MIN_CAMPAIGN_BUDGET = 2;
const BUDGET_PRESETS = [2, 5, 10, 20, 50, 100] as const;

const PLANS = [
  {
    id: "1day",
    price: 2.00,
    badge: null as "popular" | "bestValue" | null,
    perks: ["featuredSection", "prioritySearch"],
    color: "border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-800",
    selectedColor: "border-blue-500 bg-blue-50 dark:bg-blue-950/20",
    badgeColor: "",
  },
  {
    id: "3day",
    price: 5.00,
    badge: "popular" as const,
    perks: ["everything1day", "highlightedBadge"],
    color: "border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800",
    selectedColor: "border-primary bg-orange-50 dark:bg-orange-950/20",
    badgeColor: "bg-primary text-white",
  },
  {
    id: "7day",
    price: 10.00,
    badge: "bestValue" as const,
    perks: ["everything3day", "topWeek"],
    color: "border-purple-200 bg-purple-50 dark:bg-purple-950/20 dark:border-purple-800",
    selectedColor: "border-purple-500 bg-purple-50 dark:bg-purple-950/20",
    badgeColor: "bg-purple-600 text-white",
  },
] as const;

const PERK_I18N_KEYS: Record<string, string> = {
  featuredSection:  "boost.perkFeaturedSection",
  prioritySearch:   "boost.perkPrioritySearch",
  everything1day:   "boost.perkEverything1day",
  highlightedBadge: "boost.perkHighlightedBadge",
  everything3day:   "boost.perkEverything3day",
  topWeek:          "boost.perkTopWeek",
};

type Plan = (typeof PLANS)[number]["id"];
type PayMethod = "card" | "usdt" | "sepa" | "apple" | "wallet";
type Step = "audience" | "budget" | "pay" | "success" | "activated";

const HAITI_DEPARTMENTS = [
  "Ouest", "Sud-Est", "Nord", "Nord-Est", "Artibonite",
  "Centre", "Sud", "Grand'Anse", "Nord-Ouest", "Nippes",
] as const;

const RADIUS_OPTIONS = [5, 10, 20, 25, 50, 100] as const;

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
  const { user, token } = useAuth();
  const { t }         = useTranslation();
  const purchasesDisabled = isAndroidApp();

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

  const [audStates, setAudStates]               = useState<string[]>([]);
  const [audCities, setAudCities]               = useState<string[]>([]);
  const [audCityInput, setAudCityInput]         = useState<string>("");
  const [audNeighborhood, setAudNeighborhood]   = useState<string>("");
  const [audRadiusKm, setAudRadiusKm]           = useState<number | null>(10);
  const [geoError, setGeoError]                 = useState<string | null>(null);
  const audiencePanelRef                        = useRef<BoostAudiencePanelHandle>(null);

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

  const [budget, setBudget]             = useState<number>(MIN_CAMPAIGN_BUDGET);
  const [customBudgetMode, setCustomBudgetMode] = useState(false);
  const [customBudgetInput, setCustomBudgetInput] = useState(String(MIN_CAMPAIGN_BUDGET));
  const [estimatedReach, setEstimatedReach] = useState<number | null>(null);

  // Optional ≤5 minute promo video. Stored as the publicly-fetchable URL we'll
  // pass to /boost/initiate. Validation happens client-side via a hidden
  // <video> element that decodes metadata to read .duration.
  const [videoUrl, setVideoUrl]         = useState<string | null>(null);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoUploadPercent, setVideoUploadPercent] = useState(0);
  const videoFileInputRef               = useRef<HTMLInputElement | null>(null);

  // Active-boost video-management state (used when an existing paid boost is detected)
  const [abvUploading, setAbvUploading] = useState(false);
  const [abvUploadPercent, setAbvUploadPercent] = useState(0);
  const [abvSuccess, setAbvSuccess]     = useState(false);
  const abvFileInputRef                 = useRef<HTMLInputElement | null>(null);
  const MAX_VIDEO_SECONDS = 120; // Booster Pro: max 2 minutes
  const MAX_VIDEO_BYTES   = MAX_BOOST_VIDEO_BYTES;

  const handleVideoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_VIDEO_BYTES) {
      toast({ title: t("boost.videoTooBig"), variant: "destructive" });
      return;
    }
    setVideoUploading(true);
    setVideoUploadPercent(0);
    try {
      if (!user) {
        toast({ title: t("boost.videoUploadFailed"), variant: "destructive" });
        return;
      }
      const seconds = await probeVideoDuration(file);
      if (Number.isFinite(seconds) && seconds > MAX_VIDEO_SECONDS + 0.5) {
        toast({ title: t("boost.videoTooLong"), variant: "destructive" });
        return;
      }
      setVideoUrl(await startVideoUpload(file, token, {
        ownerId: user.id,
        purpose: "boost",
        onProgress: setVideoUploadPercent,
      }));
      setVideoUploadPercent(100);
    } catch (error) {
      const code = error instanceof BoostVideoUploadError ? error.code : "VIDEO_UPLOAD_FAILED";
      const descriptionKey = (() => {
        if (["UPLOAD_AUTH_REQUIRED", "UPLOAD_OWNER_MISMATCH"].includes(code)) return "boost.videoUploadAuth";
        if (["UPLOAD_SESSION_EXPIRED", "UPLOAD_SESSION_NOT_FOUND"].includes(code)) return "boost.videoUploadExpired";
        if (["UPLOAD_NETWORK_ERROR", "UPLOAD_STATUS_UNAVAILABLE"].includes(code)) return "boost.videoUploadNetwork";
        if (["VIDEO_TYPE_UNSUPPORTED", "VIDEO_CONVERSION_FAILED"].includes(code)) return "boost.videoConversionFailed";
        if (code === "VIDEO_DURATION_EXCEEDED") return "boost.videoTooLong";
        if (["UPLOAD_SERVICE_STARTING", "VIDEO_STORAGE_UNAVAILABLE", "VIDEO_STORAGE_FAILED", "CHUNK_STORAGE_FAILED"].includes(code)) return "boost.videoStorageFailed";
        if (code === "UPLOAD_INCOMPLETE" || code === "CHUNK_SIZE_INVALID") return "boost.videoUploadIncomplete";
        if (code === "VIDEO_PROCESSING_TIMEOUT") return "boost.videoProcessingTimeout";
        return "boost.videoUploadRetry";
      })();
      toast({
        title: t("boost.videoUploadFailed"),
        description: t(descriptionKey),
        variant: "destructive",
      });
    } finally {
      setVideoUploading(false);
    }
  };

  useEffect(() => {
    const suggested = PLANS.find(p => p.id === plan)?.price ?? MIN_CAMPAIGN_BUDGET;
    setBudget(suggested);
    setCustomBudgetMode(false);
    setCustomBudgetInput(suggested.toFixed(2));
  }, [plan]);

  const planDays = plan === "1day" ? 1 : plan === "3day" ? 3 : 7;
  const estimatedDailyBudget = budget > 0 ? Math.round((budget / planDays) * 100) / 100 : 0;
  const platformFeeUsd = 0;
  const amountPayable = Math.round((budget + platformFeeUsd) * 100) / 100;

  const applyBudgetPreset = (amount: number) => {
    setCustomBudgetMode(false);
    setBudget(amount);
    setCustomBudgetInput(amount.toFixed(2));
  };

  const applyCustomBudget = (raw: string) => {
    setCustomBudgetMode(true);
    setCustomBudgetInput(raw);
    const parsed = parseFloat(raw);
    if (Number.isFinite(parsed)) setBudget(Math.round(parsed * 100) / 100);
  };

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

  // Detect an existing paid active boost for this listing so we can short-circuit
  // the wizard and offer video-management only (no second charge).
  const listingIsBoosted =
    !!(listing as any)?.isBoosted &&
    !!(listing as any)?.boostExpiresAt &&
    new Date((listing as any).boostExpiresAt as string).getTime() > Date.now();

  const { data: myActiveBoostsData, refetch: refetchActiveBoosts } = useQuery<{
    boosts: Array<{
      listingId: number;
      boostId: number;
      boostVideoUrl: string | null;
      boostExpiresAt: string | null;
      plan: string;
      budget: number;
    }>;
  }>({
    queryKey: ["boost-my-active", user?.id],
    queryFn: async () => {
      const tk = localStorage.getItem("flexamarket_token");
      const res = await fetch("/api/boost/my-active", {
        headers: tk ? { Authorization: `Bearer ${tk}` } : {},
      });
      if (!res.ok) return { boosts: [] };
      return res.json();
    },
    enabled: !!user && listingIsBoosted,
    staleTime: 30_000,
  });

  // The active boost record for this specific listing (null if none or not loaded yet)
  const activeBoostForListing =
    myActiveBoostsData?.boosts.find(b => b.listingId === listingId) ?? null;

  const isSuperAdmin = !!(user?.isSuperAdmin);
  // Super-admin can override audience country; others locked to their own (or listing's country for free boosts)
  const effectiveAudienceCountry = isSuperAdmin && adminCountry
    ? adminCountry
    : (isAdmin && adminMode === "free")
      ? ((listing as any)?.country ?? user?.country ?? "")
      : (user?.country ?? "");

  const audience = useMemo(() => ({
    country: effectiveAudienceCountry || user?.country || "",
    state: audStates[0] || null,
    states: audStates.length > 0 ? audStates : null,
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
  }), [effectiveAudienceCountry, user?.country, adminCity, audStates, audCities, audNeighborhood, audRadiusKm, audienceType, audienceName, ageMin, ageMax, gender, objective]);

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
    {
      id: "wallet",
      label: t("boost.walletMethod"),
      icon: "💰",
      sub: walletSufficient
        ? t("wallet.walletAvailable", { amount: walletBalance.toFixed(2) })
        : t("wallet.walletInsufficientShort", { amount: walletBalance.toFixed(2) }),
    },
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
    // Department only required for custom audience in Haiti — inline, scroll to map
    if (effectiveAudienceCountry === "Haiti" && audienceType === "custom" && audStates.length === 0) {
      const msg = t("boost.geoSelectAreaError", {
        defaultValue: "Please select at least one geographic area to continue.",
      });
      setGeoError(msg);
      const el = audiencePanelRef.current?.getGeoSectionEl() ?? null;
      scrollToInvalidField(el);
      return;
    }
    setGeoError(null);
    setStep("budget");
  };

  const handleInitiate = async () => {
    if (purchasesDisabled) return;
    if (videoUploading) {
      toast({ title: t("boost.videoStillUploading", { defaultValue: "Your video is still uploading. Wait until it finishes before continuing." }), variant: "destructive" });
      return;
    }
    if (effectiveAudienceCountry === "Haiti" && audienceType === "custom" && audStates.length === 0) {
      const msg = t("boost.geoSelectAreaError", {
        defaultValue: "Please select at least one geographic area to continue.",
      });
      setGeoError(msg);
      setStep("audience");
      setTimeout(() => scrollToInvalidField(audiencePanelRef.current?.getGeoSectionEl()), 50);
      return;
    }
    if (!(budget >= MIN_CAMPAIGN_BUDGET)) {
      toast({
        title: t("boost.budgetTooLow"),
        description: t("boost.budgetMinHint", { amount: MIN_CAMPAIGN_BUDGET.toFixed(2) }),
        variant: "destructive",
      });
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
          title: t("boost.walletInsufficientTitle", { defaultValue: "Insufficient wallet balance" }),
          description: t("boost.walletInsufficientDesc", {
            amount: err.shortfallUsd?.toFixed(2) ?? "?",
            defaultValue: "You need ${{amount}} more. Top up your wallet.",
          }),
          variant: "destructive",
        });
        return;
      }
      toast({ title: t("errors.somethingWrong", { defaultValue: "Something went wrong" }), description: err?.error ?? t("boost.initiateError", { defaultValue: "Could not initiate boost" }), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleCardPay = async () => {
    if (purchasesDisabled) return;
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
      // Redirect to Stripe's hosted checkout page
      window.location.href = data.url;
    } catch (e: any) {
      toast({ title: "Payment failed", description: e?.error ?? "Try again", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleUsdtConfirm = async () => {
    if (purchasesDisabled) return;
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
    if (purchasesDisabled) return;
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
    if (purchasesDisabled) return;
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
          title: t("boost.adminQuotaReached", { defaultValue: "Monthly limit reached" }),
          description: t("boost.adminQuotaDesc", {
            defaultValue: "You used {{used}}/{{limit}} free boosts this month. Try again next month.",
            used: e.used,
            limit: e.limit,
          }),
          variant: "destructive",
        });
      } else {
        toast({ title: "Boost echwe", description: e?.error ?? "Try again", variant: "destructive" });
      }
    } finally {
      setAdminFreeLoading(false);
    }
  };

  // ── Active-boost video management ─────────────────────────────────────────
  // When this listing already has a paid active boost owned by this seller,
  // skip the new-boost wizard entirely and offer only video attach/replace.
  // This prevents accidental second charges and duplicate boost records.
  if (activeBoostForListing && !isAdmin) {
    const daysLeft = activeBoostForListing.boostExpiresAt
      ? Math.max(0, Math.ceil(
          (new Date(activeBoostForListing.boostExpiresAt).getTime() - Date.now()) / 86_400_000,
        ))
      : null;

    const handleAbvVideoSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !token || !user) return;
      if (file.size > MAX_VIDEO_BYTES) {
        toast({ title: t("boost.videoTooBig"), variant: "destructive" });
        return;
      }
      setAbvUploading(true);
      setAbvUploadPercent(0);
      try {
        const seconds = await probeVideoDuration(file);
        if (Number.isFinite(seconds) && seconds > MAX_VIDEO_SECONDS + 0.5) {
          toast({ title: t("boost.videoTooLong"), variant: "destructive" });
          return;
        }
        const uploadedUrl = await startVideoUpload(file, token, {
          ownerId: user.id,
          purpose: "boost",
          onProgress: setAbvUploadPercent,
        });
        const res = await fetch(`/api/boost/${activeBoostForListing.boostId}/video`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ videoUrl: uploadedUrl }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast({ title: data.error ?? t("boost.videoUploadFailed"), variant: "destructive" });
          return;
        }
        await refetchActiveBoosts();
        queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(listingId) });
        setAbvUploadPercent(100);
        setAbvSuccess(true);
      } catch (error) {
        const code = error instanceof BoostVideoUploadError ? error.code : "VIDEO_UPLOAD_FAILED";
        const descKey = ((): string => {
          if (["UPLOAD_AUTH_REQUIRED", "UPLOAD_OWNER_MISMATCH"].includes(code)) return "boost.videoUploadAuth";
          if (["UPLOAD_SESSION_EXPIRED", "UPLOAD_SESSION_NOT_FOUND"].includes(code)) return "boost.videoUploadExpired";
          if (["UPLOAD_NETWORK_ERROR", "UPLOAD_STATUS_UNAVAILABLE"].includes(code)) return "boost.videoUploadNetwork";
          if (["VIDEO_TYPE_UNSUPPORTED", "VIDEO_CONVERSION_FAILED"].includes(code)) return "boost.videoConversionFailed";
          if (code === "VIDEO_DURATION_EXCEEDED") return "boost.videoTooLong";
          if (["UPLOAD_SERVICE_STARTING", "VIDEO_STORAGE_UNAVAILABLE", "VIDEO_STORAGE_FAILED", "CHUNK_STORAGE_FAILED"].includes(code)) return "boost.videoStorageFailed";
          return "boost.videoUploadRetry";
        })();
        toast({
          title: t("boost.videoUploadFailed"),
          description: t(descKey),
          variant: "destructive",
        });
      } finally {
        setAbvUploading(false);
      }
    };

    const handleAbvVideoUsed = async (uploadedUrl: string) => {
      if (!token) return;
      setAbvUploading(true);
      try {
        const res = await fetch(`/api/boost/${activeBoostForListing.boostId}/video`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ videoUrl: uploadedUrl }),
        });
        const data = await res.json();
        if (!res.ok) {
          toast({ title: data.error ?? t("boost.videoUploadFailed"), variant: "destructive" });
          return;
        }
        await refetchActiveBoosts();
        queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(listingId) });
        setAbvSuccess(true);
      } catch {
        toast({
          title: t("boost.videoUploadFailed"),
          description: t("boost.videoUploadRetry"),
          variant: "destructive",
        });
      } finally {
        setAbvUploading(false);
      }
    };

    const hasVideo = !!activeBoostForListing.boostVideoUrl;

    // Success screen after attaching/replacing the video
    if (abvSuccess) {
      return (
        <div className="boost-listing">
          <div className="bl-terminal">
            <div className="w-full max-w-sm text-center space-y-5">
              <div className="bl-orb">
                <div className="ping" />
                <div className="core"><CheckCheck className="h-11 w-11" /></div>
              </div>
              <div>
                <h1>{t("boost.videoAdded", { defaultValue: "Video Added!" })}</h1>
                <p className="sub">
                  {t("boost.videoAddedDesc", { defaultValue: "Your promo video will appear in the feed right away." })}
                </p>
              </div>
              <div className="bl-active-banner" style={{ textAlign: "left" }}>
                <div className="mark"><Check className="h-3.5 w-3.5" /></div>
                <p style={{ margin: 0 }}>
                  {t("boost.videoLiveDesc", { defaultValue: "Your listing is now appearing in the video feed" })}
                </p>
              </div>
              <button type="button" className="bl-cta" onClick={() => setLocation("/booster")}>
                {t("myBoosts.title", { defaultValue: "My Boosts" })}
              </button>
              <Button variant="ghost" className="w-full" onClick={() => setLocation(`/listings/${listingId}`)}>
                {t("boost.viewListing", { defaultValue: "View listing" })}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    // Main panel: show active-boost status and video upload/replace
    return (
      <div className="boost-listing">
      <div className="bl-shell">
        <div className="bl-hero">
          <div className="bl-hero-inner">
            <button
              type="button"
              className="bl-hero-back"
              onClick={() => setLocation(`/listings/${listingId}`)}
              aria-label="Back"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="bl-hero-copy">
              <p className="bl-hero-kicker">Flexa Market</p>
              <h1 className="bl-hero-title">
                <Zap className="h-5 w-5" />
                {t("boost.boostListing", { defaultValue: "Boost Listing" })}
              </h1>
              {listing && (
                <p className="bl-hero-listing">{(listing as any).title}</p>
              )}
            </div>
            {daysLeft !== null && (
              <div className="bl-hero-budget">
                <span>
                  {daysLeft === 0
                    ? t("myBoosts.expiresIn", { defaultValue: "Today" })
                    : daysLeft === 1
                    ? t("myBoosts.daysLeft", { n: 1, defaultValue: "1 day" })
                    : t("myBoosts.daysLeftPlural", { n: daysLeft, defaultValue: `${daysLeft} jou` })}
                </span>
                <strong>{t("myBoosts.activeLabel", { defaultValue: "Active" })}</strong>
              </div>
            )}
          </div>
        </div>

        <div className="bl-active-banner">
          <div className="mark">
            <Zap className="h-3.5 w-3.5 fill-current" />
          </div>
          <div className="flex-1 min-w-0">
            <strong>{t("boost.alreadyActive", { defaultValue: "Boost already active" })}</strong>
            <p>
              {t("boost.alreadyActiveDesc", { defaultValue: "Your ad is already live. Add or replace the promo video without a new payment." })}
            </p>
          </div>
        </div>

        {/* Video attach / replace card */}
        <div className="rounded-xl border border-border bg-card p-4 mb-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shrink-0">
              <Video className="h-3.5 w-3.5 text-white" />
            </div>
            <p className="text-sm font-bold text-foreground">
              {t("boost.videoLabel", { defaultValue: "Promo Video" })}
            </p>
            {hasVideo && (
              <span className="text-xs font-medium text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded">✓</span>
            )}
          </div>

          {hasVideo ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 bg-muted/60 rounded-lg px-3 py-2.5">
                <Check className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                <span className="text-sm font-medium text-foreground flex-1">
                  {t("boost.videoAttached", { defaultValue: "Video attached ✓" })}
                </span>
              </div>
              {abvUploading && (
                <div
                  className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-3"
                  role="status"
                  aria-live="polite"
                >
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold text-primary">
                    <span>{t("boost.videoUploadingPct", { percent: abvUploadPercent, defaultValue: "Uploading video: {{percent}}%" })}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-primary/15">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-200 ease-out"
                      style={{ width: `${abvUploadPercent}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {abvUploadPercent < 100
                      ? t("boost.videoUploadKeepOpen", { defaultValue: "Keep this page open while the video uploads." })
                      : t("boost.videoProcessing", { defaultValue: "Processing video…" })}
                  </p>
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                {t("boost.replaceVideoDesc", { defaultValue: "You can replace the video anytime. The new video appears immediately." })}
              </p>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => abvFileInputRef.current?.click()}
                disabled={abvUploading}
              >
                {abvUploading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("boost.videoUploadingPct", { percent: abvUploadPercent, defaultValue: "Uploading video: {{percent}}%" })}</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" />{t("boost.replaceVideo", { defaultValue: "Replace Video" })}</>
                )}
              </Button>
              {abvUploading && (
                <div
                  className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-3"
                  role="status"
                  aria-live="polite"
                >
                  <div className="mb-2 flex items-center justify-between text-xs font-semibold text-primary">
                    <span>{t("boost.videoUploadingPct", { percent: abvUploadPercent, defaultValue: "Uploading video: {{percent}}%" })}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-primary/15">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-200 ease-out"
                      style={{ width: `${abvUploadPercent}%` }}
                    />
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {abvUploadPercent < 100
                      ? t("boost.videoUploadKeepOpen", { defaultValue: "Keep this page open while the video uploads." })
                      : t("boost.videoProcessing", { defaultValue: "Processing video…" })}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                {t("boost.videoHelp", { defaultValue: "Max 2 minutes. Shown as an overlay while people browse the feed." })}
              </p>
              <Button
                type="button"
                className="w-full"
                onClick={() => abvFileInputRef.current?.click()}
                disabled={abvUploading}
              >
                {abvUploading ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{t("boost.videoUploadingPct", { percent: abvUploadPercent, defaultValue: "Uploading video: {{percent}}%" })}</>
                ) : (
                  <><Upload className="h-4 w-4 mr-2" />{t("boost.videoPick", { defaultValue: "Choose video" })}</>
                )}
              </Button>
              {abvUploading && (
                <div
                  className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-3"
                  role="status"
                  aria-live="polite"
                >
                  <div className="mb-2 text-xs font-semibold text-primary">
                    {t("boost.videoUploadingPct", { percent: abvUploadPercent, defaultValue: "Uploading video: {{percent}}%" })}
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-primary/15">
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-200 ease-out"
                      style={{ width: `${Math.max(2, abvUploadPercent)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}
          <VideoUploadChooser purpose="boost" onUse={handleAbvVideoUsed} />
        </div>

        {/* Back to My Boosts */}
        <Button variant="ghost" className="w-full" onClick={() => setLocation("/booster")}>
          {t("myBoosts.title", { defaultValue: "Back to My Boosts" })}
        </Button>

        {/* Hidden file input */}
        <input
          ref={abvFileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={handleAbvVideoSelected}
        />
      </div>
      </div>
    );
  }

  if (purchasesDisabled) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-2xl border bg-card p-6 text-center shadow-sm">
          <Info className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">{t("androidPurchasePolicy.unavailable")}</p>
          <Button className="mt-5 w-full" variant="outline" onClick={() => setLocation(`/listings/${listingId}`)}>
            {t("boost.viewListing", { defaultValue: "View listing" })}
          </Button>
        </div>
      </div>
    );
  }

  // ── Admin free-boost success screen ─────────────────────────────────────────
  if (adminFreeSuccess) {
    return (
      <div className="boost-listing">
        <div className="bl-terminal">
          <div className="w-full max-w-sm text-center space-y-5">
            <div className="bl-orb">
              <div className="ping" />
              <div className="core"><CheckCheck className="h-11 w-11" /></div>
            </div>
            <div>
              <h1>{t("boost.liveTitle", { defaultValue: "Boost Active!" })}</h1>
              <p className="sub">
                {t("boost.adminFreeDesc", {
                  defaultValue: "Listing boosted for {{days}} day(s) — active immediately.",
                  days: adminFreeDays,
                })}
              </p>
            </div>
            <div className="bl-active-banner" style={{ textAlign: "left" }}>
              <div className="mark"><Check className="h-3.5 w-3.5" /></div>
              <p style={{ margin: 0 }}>Listing ou a kounye a ap parèt nan video feed la</p>
            </div>
            <button type="button" className="bl-cta" onClick={() => setLocation(`/listings/${listingId}`)} data-testid="button-view-listing">
              {t("boost.viewListing", { defaultValue: "View listing" })}
            </button>
            <Button variant="ghost" className="w-full" onClick={() => setLocation("/admin")}>
              {t("boost.backAdmin", { defaultValue: "Back to admin" })}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Instant activation success screen ─────────────────────────────────────
  // Shown after wallet or Stripe card payment activates the boost immediately.
  if (step === "activated") {
    return (
      <div className="boost-listing">
        <div className="bl-terminal">
          <div className="w-full max-w-sm text-center space-y-5">
            <div className="bl-orb">
              <div className="ping" />
              <div className="core"><CheckCheck className="h-11 w-11" /></div>
            </div>
            <div>
              <h1>{t("boost.liveTitle", { defaultValue: "Boost Active!" })}</h1>
              <p className="sub">
                {t("boost.liveDesc", {
                  defaultValue: "Your listing is now live as a boosted ad. It will appear at the top of search results and the video feed.",
                })}
              </p>
            </div>
            <div className="bl-card p-4 text-left space-y-2.5">
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
            <button type="button" className="bl-cta" onClick={() => setLocation(`/listings/${listingId}`)}>
              {t("boost.viewMyListing", { defaultValue: "View My Listing" })}
            </button>
            <Button variant="ghost" className="w-full" onClick={() => setLocation("/")}>
              {t("boost.backHome", { defaultValue: "Back to Home" })}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Pending-review screen ───────────────────────────────────────────────────
  // Shown after the seller submits their payment reference (USDT/SEPA/Apple).
  // The boost is NOT yet active; an admin must verify the payment first.
  if (step === "success") {
    return (
      <div className="boost-listing">
        <div className="bl-terminal pending">
          <div className="w-full max-w-sm text-center space-y-5">
            <div className="bl-orb amber">
              <div className="core"><Clock className="h-11 w-11" /></div>
            </div>
            <div>
              <h1>{t("boost.pendingReviewTitle", { defaultValue: "Payment Under Review" })}</h1>
              <p className="sub">
                {t("boost.pendingReviewDesc", {
                  defaultValue: "Your payment reference has been received. An admin will verify it and activate your boost shortly.",
                })}
              </p>
            </div>
            <div className="bl-card p-4 text-left space-y-2.5">
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
            <button type="button" className="bl-cta" onClick={() => setLocation(`/listings/${listingId}`)} data-testid="button-view-listing">
              {t("boost.viewListing")}
            </button>
            <Button variant="ghost" className="w-full" onClick={() => setLocation("/")}>
              {t("boost.backHome")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main page ───────────────────────────────────────────────────────────────
  return (
    <div className="boost-listing flexa-boost">
    <div className="bl-shell">
      {/* ── Return-to-app banner ──────────────────────────────────────────── */}
      {showReturnApp && (
        <div className="bl-banner">
          <p className="truncate">Tap to return to Flexa Market app.</p>
          <button
            type="button"
            onClick={() => { window.location.href = "flexamarket://"; }}
          >
            Open App
          </button>
        </div>
      )}

      {/* ── Gradient Hero Header ── */}
      <div className="bl-hero">
        <div className="bl-hero-inner">
          <button
            type="button"
            className="bl-hero-back"
            aria-label="Back"
            onClick={() => {
              if (step === "audience") setLocation(`/listings/${listingId}`);
              else if (step === "budget") setStep("audience");
              else if (step === "pay") setStep("budget");
              else setLocation(`/listings/${listingId}`);
            }}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="bl-hero-copy">
            <p className="bl-hero-kicker">Flexa Market</p>
            <h1 className="bl-hero-title">
              <Zap className="h-5 w-5" />
              {t("boost.boostListing")}
            </h1>
            {listing && (
              <p className="bl-hero-listing">{(listing as any).title}</p>
            )}
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
                <div className="bl-hero-chips">
                  <span className="bl-chip">{localStr}</span>
                  {usdEq && <span className="bl-chip soft">{usdEq}</span>}
                </div>
              );
            })()}
          </div>
          {step !== "audience" && (
            <div className="bl-hero-budget">
              <span>Total</span>
              <strong>${budget.toFixed(2)}</strong>
            </div>
          )}
        </div>
      </div>

      {/* ── Admin control panel ──────────────────────────────────────────────── */}
      {isAdmin && (
        <div className="bl-admin" data-testid="admin-boost-panel">
          <div className="bl-admin-head">
            <Shield className="h-4 w-4 flex-shrink-0" />
            <span>Admin Boost Control</span>
          </div>

          <div className="bl-admin-modes">
            <button
              type="button"
              onClick={() => setAdminMode("free")}
              className={cn("bl-admin-mode", adminMode === "free" && "on-free")}
              data-testid="admin-boost-mode-free"
            >
              <Gift className="h-4 w-4" />
              {t("boost.adminFreeMode", { defaultValue: "Free Boost" })}
            </button>
            <button
              type="button"
              onClick={() => setAdminMode("paid")}
              className={cn("bl-admin-mode", adminMode === "paid" && "on-paid")}
              data-testid="admin-boost-mode-paid"
            >
              <CreditCard className="h-4 w-4" />
              {t("boost.adminPaidMode", { defaultValue: "Paid (All Methods)" })}
            </button>
          </div>

          {adminMode === "free" && (
            <div>
              <p className="bl-admin-note">
                {t("boost.adminFreeNote", { defaultValue: "Boost activates immediately with no payment required." })}
              </p>
              {quotaData && (
                quotaData.isSuperAdmin ? (
                  <div className="bl-quota unlimited">∞ Boost gratis san limit (Super Admin)</div>
                ) : (
                  <div className={cn("bl-quota", quotaData.used >= (quotaData.limit ?? 3) ? "warn" : "ok")}>
                    <span>Boost gratis mwa sa</span>
                    <span className="tabular-nums font-black">{quotaData.used}/{quotaData.limit}</span>
                  </div>
                )
              )}
              <p className="bl-admin-note" style={{ marginTop: "0.55rem" }}>
                {t("boost.adminFreeWizardHint", { defaultValue: "Follow the steps below to configure audience, duration, and promo video." })}
              </p>
            </div>
          )}

          {adminMode === "paid" && (
            <p className="bl-admin-note">
              {t("boost.adminPaidNote", { defaultValue: "All payment methods unlocked. Payment still goes through pending review before activation." })}
            </p>
          )}
        </div>
      )}

      {/* Stepper */}
      <div className="bl-stepper">
        <div className="bl-progress">
          <i style={{ width: step === "audience" ? "33%" : step === "budget" ? "66%" : "100%" }} />
        </div>
        <div className="bl-steps">
          {(["audience", "budget", "pay"] as const).map((s, i) => {
            const active = step === s;
            const done = (["audience", "budget", "pay"].indexOf(step) > i);
            const labels = {
              audience: t("boost.stepAudience"),
              budget: t("boost.stepBudget"),
              pay: (isAdmin && adminMode === "free")
                ? t("boost.stepConfirm", { defaultValue: "Confirm" })
                : t("boost.stepPay"),
            };
            return (
              <div key={s} className={cn("bl-step", active && "on", done && "done")}>
                <span className="n">
                  {done ? <Check className="h-2.5 w-2.5" /> : i + 1}
                </span>
                {labels[s]}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Step 1: Flexa Boost redesign — product, video, audience, live preview ── */}
      {step === "audience" && (
        <div className="bl-step-panel space-y-4">
          {listing && (
            <BoostProductCard
              listing={{
                title: (listing as any).title,
                price: (listing as any).price,
                currency: (listing as any).currency,
                country: (listing as any).country,
                images: (listing as any).images,
                description: (listing as any).description,
              }}
            />
          )}

          {isSuperAdmin && (
            <div className="bl-card p-3 space-y-2" style={{ borderColor: "#c4b5fd" }}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold bg-violet-600 text-white rounded-full px-1.5 py-0.5">ADMIN</span>
                <p className="text-xs font-semibold text-violet-700">{t("boost.audienceCountry")}</p>
              </div>
              <Select
                value={adminCountry || user?.country || ""}
                onValueChange={v => { setAdminCountry(v); setAdminCity("__all__"); setAudStates([]); setAudCities([]); }}
              >
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_COUNTRIES.map(c => (
                    <SelectItem key={c} value={c}>{COUNTRY_FLAGS[c]} {c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <label className="fb-label">{t("boost.objective", { defaultValue: "Campaign objective" })}</label>
            <select
              className="fb-input"
              value={objective}
              onChange={(e) => setObjective(e.target.value as typeof objective)}
              data-testid="boost-objective-select"
            >
              <option value="auto">{t("boost.objAuto", { defaultValue: "More Sales / Automatic" })}</option>
              <option value="messages">{t("boost.objMessages", { defaultValue: "Get more messages" })}</option>
              <option value="views">{t("boost.objViews", { defaultValue: "Get more views" })}</option>
            </select>
          </div>

          <div className="fb-video-box" data-testid="boost-video-section">
            <div className="flex items-center gap-2 mb-1">
              <Video className="h-4 w-4 text-violet-600" />
              <p className="text-sm font-bold text-slate-900">{t("boost.videoLabel", { defaultValue: "Promo Video" })}</p>
              <span className="text-[11px] text-slate-500">({t("boost.optional")})</span>
            </div>
            <p className="text-xs text-slate-500 mb-2">
              {t("boost.videoHelp", { defaultValue: "Max 2 minutes • MP4, MOV" })}
            </p>
            {videoUrl ? (
              <div className="space-y-2">
                <AdaptiveVideoPlayer src={videoUrl} maxHeight={280} muted controls />
                <div className="fb-video-progress"><i style={{ width: "100%" }} /></div>
                <p className="text-xs font-semibold text-green-600">
                  {t("boost.videoReadyPreview", { defaultValue: "Video ready for preview." })}
                </p>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => videoFileInputRef.current?.click()} disabled={videoUploading}>
                    {t("boost.replaceVideo", { defaultValue: "Replace" })}
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="text-red-600 border-red-200" onClick={() => setVideoUrl(null)} data-testid="button-video-remove">
                    {t("boost.removeVideo", { defaultValue: "Remove" })}
                  </Button>
                </div>
              </div>
            ) : videoUploading ? (
              <div
                className="bl-upload bl-upload-progress space-y-2 pointer-events-none"
                role="status"
                aria-live="polite"
                data-testid="boost-video-upload-progress"
              >
                <div className="flex items-center justify-center gap-2 text-sm font-semibold text-violet-700">
                  <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                  <span>
                    {videoUploadPercent < 100
                      ? t("boost.videoUploadingPct", { percent: videoUploadPercent, defaultValue: "Uploading video: {{percent}}%" })
                      : t("boost.videoProcessing", { defaultValue: "Processing video…" })}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-violet-100">
                  <div
                    className="h-full rounded-full bg-violet-600 transition-all duration-200 ease-out"
                    style={{ width: `${Math.max(2, videoUploadPercent)}%` }}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground text-center">
                  {videoUploadPercent < 100
                    ? t("boost.videoUploadKeepOpen", { defaultValue: "Keep this page open while the video uploads." })
                    : t("boost.videoProcessing", { defaultValue: "Processing video…" })}
                </p>
              </div>
            ) : (
              <button
                type="button"
                className="bl-upload"
                onClick={() => videoFileInputRef.current?.click()}
                data-testid="button-video-pick"
              >
                <Upload className="h-4 w-4" /> {t("boost.videoPick", { defaultValue: "Upload Media" })}
              </button>
            )}
            <VideoUploadChooser purpose="boost" onUse={setVideoUrl} />
          </div>

          <BoostAudiencePanel
            ref={audiencePanelRef}
            country={effectiveAudienceCountry || user?.country || ""}
            audienceType={audienceType}
            onAudienceType={setAudienceType}
            audStates={audStates}
            setAudStates={setAudStates}
            audCities={audCities}
            setAudCities={setAudCities}
            audRadiusKm={audRadiusKm ?? 10}
            setAudRadiusKm={(v) => setAudRadiusKm(v)}
            ageMin={ageMin}
            ageMax={ageMax}
            setAgeMin={setAgeMin}
            setAgeMax={setAgeMax}
            gender={gender}
            setGender={setGender}
            geoError={geoError}
            onGeoErrorClear={() => setGeoError(null)}
            estimatedLabel={undefined}
            estimatedSize={plan === "7day" || audStates.length >= 3 || audCities.length >= 3 ? "large" : audienceType === "advantage_plus" ? "medium" : "small"}
          />

          {listing && (
            <div>
              <p className="fb-label">{t("boost.livePreview", { defaultValue: "Live ad preview" })}</p>
              <BoostAdPreview
                title={(listing as any).title}
                price={(listing as any).price}
                currency={(listing as any).currency}
                country={(listing as any).country}
                description={(listing as any).description}
                images={(listing as any).images}
                videoUrl={videoUrl}
                sellerName={user?.name ?? null}
              />
            </div>
          )}

          <input
            ref={videoFileInputRef}
            type="file"
            accept="video/mp4,video/webm,video/quicktime"
            className="hidden"
            onChange={handleVideoSelected}
            data-testid="input-video-file"
          />

          <button
            type="button"
            className="fb-cta-primary"
            onClick={handleAudienceNext}
            data-testid="button-audience-next"
          >
            {t("boost.continueToBudget", { defaultValue: "Continue to Budget →" })}
          </button>
        </div>
      )}

      {/* ── Step 2: Budget + Plan — Meta Ads Payment style ───────────────────── */}
      {step === "budget" && (
        <div className="bl-step-panel md:grid md:grid-cols-3 md:gap-6">

          {/* ── LEFT: Plan + Budget + Payment ── */}
          <div className="md:col-span-2 space-y-0">

            {/* Duration / Plan */}
            <div className="bl-section first:pt-0">
              <div className="bl-section-head">
                <div className="bl-icon-tile ember">
                  <Zap className="h-3.5 w-3.5 fill-white" />
                </div>
                <p className="bl-section-title">
                  {t("boost.chooseDuration", { defaultValue: "Boost Duration" })}
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
                              <Check className="h-2.5 w-2.5 text-green-500" />{t(PERK_I18N_KEYS[k])}
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
                <div className="h-6 w-6 rounded-lg bg-[hsl(152,65%,18%)] flex items-center justify-center shrink-0">
                  <span className="text-white text-xs font-black">$</span>
                </div>
                <p className="text-sm font-bold text-foreground">
                  {t("boost.yourBudget")}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 mb-3" role="group" aria-label={t("boost.budgetPresets")}>
                {BUDGET_PRESETS.map((amount) => {
                  const selected = !customBudgetMode && Math.abs(budget - amount) < 0.001;
                  return (
                    <button
                      key={amount}
                      type="button"
                      onClick={() => applyBudgetPreset(amount)}
                      data-testid={`button-budget-preset-${amount}`}
                      className={cn(
                        "min-h-11 px-3.5 rounded-full text-sm font-semibold border transition-colors",
                        selected
                          ? "bg-[hsl(152,65%,18%)] text-white border-transparent"
                          : "bg-card text-foreground border-border hover:bg-accent",
                      )}
                    >
                      ${amount}
                    </button>
                  );
                })}
                <button
                  type="button"
                  onClick={() => {
                    setCustomBudgetMode(true);
                    setCustomBudgetInput(budget >= MIN_CAMPAIGN_BUDGET ? budget.toFixed(2) : String(MIN_CAMPAIGN_BUDGET));
                  }}
                  data-testid="button-budget-custom"
                  className={cn(
                    "min-h-11 px-3.5 rounded-full text-sm font-semibold border transition-colors",
                    customBudgetMode
                      ? "bg-[hsl(152,65%,18%)] text-white border-transparent"
                      : "bg-card text-foreground border-border hover:bg-accent",
                  )}
                >
                  {t("boost.customAmount")}
                </button>
              </div>

              <div className="bg-gradient-to-br from-muted/50 to-card border border-border rounded-2xl p-5 space-y-3">
                <div className="flex items-baseline gap-1 justify-center">
                  <span className="text-3xl font-black text-muted-foreground/60">$</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min={MIN_CAMPAIGN_BUDGET}
                    value={customBudgetMode ? customBudgetInput : budget}
                    onChange={(e) => applyCustomBudget(e.target.value)}
                    onFocus={() => setCustomBudgetMode(true)}
                    className="text-5xl font-black h-16 border-0 shadow-none focus-visible:ring-0 px-0 w-full text-center bg-transparent"
                    data-testid="input-budget"
                    aria-label={t("boost.yourBudget")}
                  />
                  <span className="text-sm font-bold text-muted-foreground/60 self-center">USD</span>
                </div>
                <p className="text-center text-xs text-muted-foreground">
                  {t("boost.budgetMinHint", { amount: MIN_CAMPAIGN_BUDGET.toFixed(2) })}
                </p>
              </div>

              <div className="mt-3 rounded-2xl border border-border bg-card p-4 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("boost.totalCampaignBudget")}</span>
                  <span className="font-semibold tabular-nums">${budget.toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("boost.campaignDuration")}</span>
                  <span className="font-semibold">{getPlanLabel(plan)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("boost.estimatedDailyBudget")}</span>
                  <span className="font-semibold tabular-nums">${estimatedDailyBudget.toFixed(2)}</span>
                </div>
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{t("boost.platformFees")}</span>
                  <span className="font-semibold tabular-nums">${platformFeeUsd.toFixed(2)}</span>
                </div>
                <div className="h-px bg-border" />
                <div className="flex justify-between gap-3 items-baseline">
                  <span className="font-semibold text-foreground">{t("boost.amountPayable")}</span>
                  <span className="text-xl font-black tabular-nums text-[hsl(152,65%,18%)] dark:text-emerald-400">
                    ${amountPayable.toFixed(2)}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">{t("boost.budgetNote")}</p>
              <p className="text-xs text-muted-foreground mt-1">{t("boost.noGuarantees")}</p>
            </div>}

            {/* Payment method — hidden for free admin mode */}
            {(!isAdmin || adminMode !== "free") && <div className="py-5">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-6 w-6 rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center shrink-0">
                  <CreditCard className="h-3.5 w-3.5 text-white" />
                </div>
                <p className="text-sm font-bold text-foreground">
                  {t("boost.paymentMethod", { defaultValue: "Payment Method" })}
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
                    <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">{t("boost.walletBalanceLow", { defaultValue: "Insufficient balance" })}</p>
                    <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                      {t("boost.walletBalanceDetail", {
                        have: walletBalance.toFixed(2),
                        need: budget.toFixed(2),
                        shortfall: (budget - walletBalance).toFixed(2),
                        defaultValue: "You have ${{have}}, you need ${{need}}. Top up ${{shortfall}} more.",
                      })}
                    </p>
                    <a href="/wallet" className="text-xs text-primary font-bold underline mt-1 block">{t("boost.rechargePromoWallet", { defaultValue: "Top up Promo Wallet →" })}</a>
                  </div>
                </div>
              )}
              {/* Wallet sufficient banner */}
              {payMethod === "wallet" && walletSufficient && (
                <div className="mt-3 rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 dark:border-green-800/40 p-3 flex items-center gap-2">
                  <span className="text-green-400 text-sm">✓</span>
                  <p className="text-sm text-green-800 dark:text-green-300 font-medium">
                    {t("boost.walletSufficientBanner", { defaultValue: "Balance OK — Boost activates immediately after you tap Continue." })}
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
                    {t("boost.estimatedResults", { defaultValue: "Estimated Results / Day" })}
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
                  {t("boost.paymentSummary", { defaultValue: "Payment Summary" })}
                </p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("boost.objective", { defaultValue: "Objective" })}</span>
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
                    <span className="text-muted-foreground">{t("boost.duration", { defaultValue: "Duration" })}</span>
                    <span className="font-medium text-foreground">
                      {(isSuperAdmin && adminMode === "free")
                        ? `${parseInt(adminFreeDays, 10) || 7} jou`
                        : getPlanLabel(plan)}
                    </span>
                  </div>
                  {(!isAdmin || adminMode !== "free") && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("boost.estimatedDailyBudget")}</span>
                    <span className="font-medium text-foreground tabular-nums">
                      ${estimatedDailyBudget.toFixed(2)}
                    </span>
                  </div>
                  )}
                  {(!isAdmin || adminMode !== "free") && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t("boost.platformFees")}</span>
                    <span className="font-medium text-foreground tabular-nums">${platformFeeUsd.toFixed(2)}</span>
                  </div>
                  )}
                  <div className="h-px bg-border my-1" />
                  <div className="flex justify-between items-baseline">
                    <span className="text-sm font-semibold text-foreground">{t("boost.amountPayable")}</span>
                    {(isAdmin && adminMode === "free") ? (
                      <span className="text-2xl font-black text-green-600 dark:text-green-400">$0.00</span>
                    ) : (
                      <span className="text-2xl font-black text-foreground tabular-nums">${amountPayable.toFixed(2)}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("boost.adRunFor")} {getPlanLabel(plan)}.
                  </p>
                  <p className="text-xs text-muted-foreground">{t("boost.noGuarantees")}</p>
                </div>
              </div>

              {/* CTA */}
              {(isAdmin && adminMode === "free") ? (
                <button
                  type="button"
                  className="bl-cta success"
                  onClick={() => setStep("pay")}
                  data-testid="button-proceed-to-confirm"
                >
                  <span className="inline-flex items-center justify-center gap-1.5">
                    <Zap className="h-4 w-4" />
                    {t("boost.continueToConfirm", { defaultValue: "Continue to Confirm →" })}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  className="bl-cta"
                  onClick={handleInitiate}
                  disabled={loading || videoUploading}
                  data-testid="button-proceed-to-pay"
                >
                  {loading ? t("boost.processing") : videoUploading ? t("boost.videoUploadingPct", { percent: videoUploadPercent, defaultValue: "Uploading video: {{percent}}%" }) : t("boost.publishAd", { amount: budget.toFixed(2) })}
                </button>
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
              <button
                type="button"
                className="bl-cta success"
                onClick={() => setStep("pay")}
                data-testid="button-proceed-to-confirm-mobile"
              >
                <span className="inline-flex items-center justify-center gap-1.5">
                  <Zap className="h-4 w-4" />
                  {t("boost.continueToConfirm", { defaultValue: "Continue to Confirm →" })}
                </span>
              </button>
            ) : (
              <button
                type="button"
                className="bl-cta"
                onClick={handleInitiate}
                disabled={loading || videoUploading}
                data-testid="button-proceed-to-pay-mobile"
              >
                {loading ? t("boost.processing") : videoUploading ? t("boost.videoUploadingPct", { percent: videoUploadPercent, defaultValue: "Uploading video: {{percent}}%" }) : `${t("boost.continue")} — $${budget.toFixed(2)}`}
              </button>
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
        <div className="bl-step-panel space-y-5">

          {/* Header */}
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-r from-green-500/10 to-emerald-500/10 border border-green-300 dark:border-green-800">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-green-400 to-emerald-600 flex items-center justify-center shrink-0">
              <Zap className="h-5 w-5 text-white fill-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-green-800 dark:text-green-300">
                {t("boost.adminFreeConfirmTitle", { defaultValue: "Confirm Free Boost" })}
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
                  <p className="text-sm font-bold text-purple-800 dark:text-purple-300">{t("boost.adminUnlimitedTitle", { defaultValue: "Super Admin — Unlimited" })}</p>
                  <p className="text-xs text-purple-600 dark:text-purple-400">{t("boost.adminUnlimitedDesc", { defaultValue: "You can create as many free boosts as you want." })}</p>
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
                      ? t("boost.adminQuotaReached", { defaultValue: "Monthly limit reached" })
                      : t("boost.adminQuotaRemaining", { defaultValue: "Free boosts remaining this month" })}
                  </p>
                  <p className={`text-xs ${quotaData.used >= (quotaData.limit ?? 3) ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}`}>
                    {quotaData.used >= (quotaData.limit ?? 3)
                      ? t("boost.adminQuotaTryNextMonth", { defaultValue: "Try again next month." })
                      : t("boost.adminQuotaRemainingCount", { count: (quotaData.limit ?? 3) - quotaData.used, defaultValue: "{{count}} remaining" })}
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
              {t("boost.paymentSummary", { defaultValue: "Boost Summary" })}
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("boost.objective", { defaultValue: "Objective" })}</span>
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
              {audStates.length > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground shrink-0">{t("boost.department")}</span>
                  <span className="font-medium text-foreground text-right">
                    {audStates.join(", ")}
                  </span>
                </div>
              )}
              {adminCity && adminCity !== "__all__" && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vil</span>
                  <span className="font-medium text-foreground">{adminCity}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("boost.duration", { defaultValue: "Duration" })}</span>
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
          <button
            type="button"
            className="bl-cta success"
            onClick={handleAdminFreeBoost}
            disabled={adminFreeLoading || (!!quotaData && !quotaData.isSuperAdmin && quotaData.used >= (quotaData.limit ?? 3))}
            data-testid="button-admin-free-boost"
          >
            {adminFreeLoading ? (
              t("boost.boosting", { defaultValue: "Activating…" })
            ) : (
              <span className="inline-flex items-center justify-center gap-2">
                <Zap className="h-5 w-5 fill-white" />
                {t("boost.adminBoostNow", { defaultValue: "Activate Free Boost Now" })}
              </span>
            )}
          </button>

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
              <span className="text-sm font-bold text-foreground">{t("boost.walletMethod", { defaultValue: "Promo Wallet" })}</span>
            </div>
            <span className="text-lg font-black text-primary">${budget.toFixed(2)}</span>
          </div>

          <div className="rounded-2xl border-2 border-dashed border-border bg-gradient-to-br from-muted/30 to-card p-6 text-center space-y-4">
            <div className="flex flex-col items-center gap-1">
              <p className="text-xs text-muted-foreground uppercase tracking-widest">{t("boost.walletAvailable", { defaultValue: "Available balance" })}</p>
              <p className={cn("text-4xl font-black tabular-nums", walletSufficient ? "text-green-600 dark:text-green-400" : "text-destructive")}>
                ${walletBalance.toFixed(2)}
              </p>
              {!walletSufficient && (
                <p className="text-xs text-muted-foreground">
                  {t("boost.walletNeedMore", { amount: (budget - walletBalance).toFixed(2), defaultValue: "Need ${{amount}} more" })}
                </p>
              )}
            </div>

            {walletSufficient ? (
              <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl p-3">
                <p className="text-sm text-green-700 dark:text-green-400 font-medium">
                  {t("boost.walletSufficientShort", { defaultValue: "Balance OK — Boost activates immediately" })}
                </p>
              </div>
            ) : (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                <p className="text-sm text-red-700 dark:text-red-400 font-medium">{t("boost.walletInsufficientShort", { defaultValue: "Insufficient balance — top up your wallet" })}</p>
              </div>
            )}
          </div>

          {walletSufficient ? (
            <Button
              className="w-full h-13 font-bold text-base bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 border-0 text-white shadow-lg shadow-orange-500/25"
              onClick={handleInitiate}
              disabled={loading || videoUploading}
            >
              {loading ? t("boost.processing") : videoUploading ? t("boost.videoUploadingPct", { percent: videoUploadPercent, defaultValue: "Uploading video: {{percent}}%" }) : t("boost.activateBoost", { amount: budget.toFixed(2), defaultValue: "Activate Boost — ${{amount}}" })}
            </Button>
          ) : (
            <a
              href="/wallet"
              className="flex items-center justify-center w-full h-12 rounded-xl bg-primary text-primary-foreground font-bold text-base hover:opacity-90 transition-opacity"
            >
              {t("boost.rechargePromoWallet", { defaultValue: "Top up Promo Wallet →" })}
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
              {t("boost.stripeCardDesc", { defaultValue: "You will be redirected to a secure Stripe payment page to enter your card details." })}
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
    </div>
  );
}
