import { useState, useEffect, useRef, useMemo } from "react";
import { useSEO } from "@/hooks/useSEO";
import { useRoute, useLocation, Link } from "wouter";
import { Heart, MapPin, Star, MessageCircle, Tag, Zap, ChevronLeft, ChevronRight, Pencil, Trash2, Globe, Phone, CreditCard, Banknote, BadgeCheck, Share2, Copy, CheckCircle2, Shield, Gift, Ticket, Play, Film, Volume2, VolumeX, ShoppingCart, Truck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useGetListing, useAddFavorite, useRemoveFavorite, useCreateConversation, useCreateOffer, useDeleteListing, getGetListingQueryKey, getGetFavoritesQueryKey, getGetListingsQueryKey, getGetFeaturedListingsQueryKey, getGetUserListingsQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/contexts/auth";
import { useCart } from "@/contexts/cart";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import CommentsSection from "@/components/CommentsSection";
import CommissionBreakdown, { type Quote } from "@/components/CommissionBreakdown";
import ShareMenu from "@/components/ShareMenu";
import { useTranslation } from "react-i18next";
import { useViewTracker, formatViewCount } from "@/hooks/useViewTracker";
import { formatPrice, useExchangeRate, htgToUsd, dopToUsd } from "@/lib/currency";
import { cn } from "@/lib/utils";

function isLocalDeliveryCountry(country: string | null | undefined) {
  return country === "Haiti" || country === "Dominican Republic";
}

function getReturnDays(country: string | null | undefined): number {
  const map: Record<string, number> = {
    "USA": 30, "Canada": 30, "Australia": 30,
    "United Kingdom": 14, "France": 14, "Germany": 14, "Italy": 14,
    "Netherlands": 14, "Belgium": 14, "Portugal": 14, "Switzerland": 14,
    "Sweden": 14, "Norway": 14, "Japan": 14, "South Korea": 14,
    "Brazil": 14, "Mexico": 14, "Colombia": 14, "Chile": 14, "South Africa": 14,
    "Jamaica": 7, "Trinidad and Tobago": 7, "Barbados": 7,
    "Bahamas": 7, "Puerto Rico": 7, "Haiti": 3, "Dominican Republic": 3,
    "Nigeria": 7, "Ghana": 7, "Kenya": 7, "Senegal": 7,
    "Philippines": 7, "India": 7, "United Arab Emirates": 7, "Saudi Arabia": 7,
  };
  return map[country ?? ""] ?? 14;
}

// Weight-based carrier rate estimates (USD). Uses billableWeight = max(actual, DIM).
function calcCarrierRate(carrier: string, lbs: number): number {
  type Tier = [number, number];
  const tables: Record<string, Tier[]> = {
    "USPS":  [[0.5,12],[1,16],[2,22],[5,32],[10,50],[20,75],[50,105],[Infinity,140]],
    "FedEx": [[0.5,18],[1,22],[2,30],[5,45],[10,68],[20,100],[50,145],[Infinity,185]],
    "UPS":   [[0.5,17],[1,21],[2,28],[5,42],[10,63],[20,95],[50,138],[Infinity,175]],
    "DHL":   [[0.5,20],[1,25],[2,34],[5,50],[10,75],[20,110],[50,158],[Infinity,200]],
  };
  const tiers = tables[carrier];
  if (!tiers) return 0;
  for (const [maxW, price] of tiers) {
    if (lbs <= maxW) return price;
  }
  return 0;
}

export default function ListingDetail() {
  const [, params] = useRoute("/listings/:id");
  const id = parseInt(params?.id ?? "0", 10);
  const [, setLocation] = useLocation();
  const { user, token } = useAuth();
  const { addItem, removeItem, isInCart, items: cartItems } = useCart();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Dynamic SEO — filled once listing data loads (see below after useGetListing)

  const [imgIndex, setImgIndex] = useState(0);
  // ── Pinch-to-zoom / double-tap-to-zoom state ──────────────────────────────
  const [zoom, setZoom]   = useState(1);
  const [panX, setPanX]   = useState(0);
  const [panY, setPanY]   = useState(0);
  const heroRef           = useRef<HTMLDivElement>(null);
  const zoomLive          = useRef(1);   // live value during gesture (avoids stale closures)
  const panLive           = useRef({ x: 0, y: 0 });
  const pinchRef          = useRef<{ dist: number; z0: number } | null>(null);
  const panStartRef       = useRef<{ ox: number; oy: number } | null>(null);
  const swipeStartXRef    = useRef<number | null>(null);
  const lastTapRef        = useRef(0);
  const [restockOpen, setRestockOpen] = useState(false);
  const [restockQty, setRestockQty] = useState("10");
  const [restocking, setRestocking] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [removeVideoConfirmOpen, setRemoveVideoConfirmOpen] = useState(false);
  const [removeVideoLoading, setRemoveVideoLoading] = useState(false);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerMsg, setOfferMsg] = useState("");
  const [offerSent, setOfferSent] = useState(false);
  const [buyNowOpen, setBuyNowOpen] = useState(false);
  // Offer price override — set when arriving from Offers page with an accepted offer
  const [offerPriceOverride, setOfferPriceOverride] = useState<number | null>(null);
  const [offerIdForPurchase, setOfferIdForPurchase] = useState<number | null>(null);
  const [payStep, setPayStep] = useState<"promo" | "address" | "delivery" | "select" | "usdt" | "moncash" | "natcash" | "wallet">("promo");
  const [walletPayLoading, setWalletPayLoading] = useState(false);
  const [payDone, setPayDone] = useState(false);
  const [payLoading, setPayLoading] = useState(false);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [bnplLoading, setBnplLoading] = useState<string | null>(null);
  const [bnplEligible, setBnplEligible] = useState<boolean | null>(null);
  const [bnplSettings, setBnplSettings] = useState<{ klarnaEnabled: boolean; affirmEnabled: boolean; afterpayEnabled: boolean } | null>(null);
  // Address autocomplete
  const [streetSuggestions, setStreetSuggestions] = useState<Array<{ display_name: string; address: { road?: string; suburb?: string; city?: string; town?: string; village?: string; state?: string; postcode?: string; country?: string } }>>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestLoading, setSuggestLoading] = useState(false);
  const streetDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [usdtTxHash, setUsdtTxHash] = useState("");
  const [mobileMoneyTxId, setMobileMoneyTxId] = useState("");
  const [quote, setQuote] = useState<Quote | null>(null);
  // Shipping form state — persisted to localStorage so a half-filled checkout
  // survives navigation. The key is per-listing so distinct orders don't collide.
  const formKey = `flexamarket_checkout_${id}`;
  const readForm = () => {
    try { return JSON.parse(localStorage.getItem(formKey) ?? "{}"); } catch { return {}; }
  };
  const saved = readForm();
  const [shipName,   setShipName]   = useState<string>(saved.shipName   ?? "");
  const [shipPhone,  setShipPhone]  = useState<string>(saved.shipPhone  ?? "");
  const [shipEmail,  setShipEmail]  = useState<string>(saved.shipEmail  ?? "");
  const [shipStreet, setShipStreet] = useState<string>(saved.shipStreet ?? "");
  const [shipCity,   setShipCity]   = useState<string>(saved.shipCity   ?? "");
  const [shipRegion, setShipRegion] = useState<string>(saved.shipRegion ?? "");
  const [shipZip,    setShipZip]    = useState<string>(saved.shipZip    ?? "");
  const [displayViewCount, setDisplayViewCount] = useState<number | null>(null);
  const [videoMuted, setVideoMuted] = useState(true);

  // Reset mute state whenever the user swipes to a different media item.
  // Guarantees every boost video starts muted (browsers require muted for autoplay).
  useEffect(() => { setVideoMuted(true); }, [imgIndex]);

  const [promoCode, setPromoCode] = useState("");
  const [promoValidating, setPromoValidating] = useState(false);
  const [promoValidation, setPromoValidation] = useState<{ valid: boolean; code: string; discountAmount: number; finalPrice: number; description: string | null } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [purchaseResult, setPurchaseResult] = useState<{ bonusEarned: number; discountAmount: number; promoCodeApplied: string | null } | null>(null);

  // Delivery method is set by the seller on the listing, not chosen by the buyer
  const [deliveryMethod, setDeliveryMethod] = useState<string>("motorcycle");
  const [deliverySpeedTier, setDeliverySpeedTier] = useState<"regular" | "rapid" | "express" | "pickup" | "custom">("rapid");
  const [baseFeeUsd, setBaseFeeUsd] = useState<number>(0);
  const [customDeliveryInput, setCustomDeliveryInput] = useState<string>("");
  const [deliveryFeeUsd, setDeliveryFeeUsd] = useState<number>(0);
  const [deliveryFeeLoading, setDeliveryFeeLoading] = useState(false);
  const [deliveryFeeIsEstimate, setDeliveryFeeIsEstimate] = useState(false);
  const [selectedCarrier, setSelectedCarrier] = useState<string | null>(null);
  // Driver tip
  const [tipUsd, setTipUsd] = useState<number>(0);
  const [customTipInput, setCustomTipInput] = useState("");
  const [showCustomTip, setShowCustomTip] = useState(false);
  // Smart tip prompt (after purchase, if no driver in 5 min)
  const [localDeliveryPurchased, setLocalDeliveryPurchased] = useState(false);
  const [purchasedDeliveryId, setPurchasedDeliveryId] = useState<number | null>(null);
  const [showTipPrompt, setShowTipPrompt] = useState(false);
  const [tipPromptSent, setTipPromptSent] = useState(false);

  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewRating, setReviewRating] = useState(0);
  const [reviewHover, setReviewHover] = useState(0);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewLoading, setReviewLoading] = useState(false);
  const [buyQty, setBuyQty] = useState(1);

  const { t } = useTranslation();

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
  const usdtWalletAddress = usdtWalletData?.address ?? "";

  // Fetch live MonCash / NatCash phone numbers configured by admin.
  const { data: paymentNumbers } = useQuery<{ moncash: string; natcash: string }>({
    queryKey: ["payment-provider-numbers"],
    queryFn: async () => {
      const res = await fetch("/api/payment-providers/numbers");
      if (!res.ok) throw new Error("numbers fetch failed");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const PLATFORM_MONCASH_NUMBER = paymentNumbers?.moncash ?? "+509 3600-3636";
  const NATCASH_NUMBER = paymentNumbers?.natcash ?? "+509 3900-3636";

  // Fetch wallet balance so we can show it on the wallet payment option.
  const { data: walletData } = useQuery<{ balanceUsd: number; availableUsd: number; promoBalance: number }>({
    queryKey: ["wallet-balance-checkout"],
    queryFn: async () => {
      const res = await fetch("/api/wallet/balance", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("wallet fetch failed");
      return res.json();
    },
    enabled: !!token && buyNowOpen,
    staleTime: 30_000,
    retry: false,
  });
  const walletReal  = walletData?.availableUsd ?? walletData?.balanceUsd ?? 0;
  const walletPromo = walletData?.promoBalance ?? 0;
  const walletTotal = walletReal + walletPromo;

  // Fetch BNPL eligibility + settings when checkout opens
  useEffect(() => {
    if (!buyNowOpen || !token) return;
    fetch("/api/bnpl/settings").then(r => r.json()).then(d => {
      setBnplSettings({ klarnaEnabled: d.klarnaEnabled, affirmEnabled: d.affirmEnabled, afterpayEnabled: d.afterpayEnabled });
    }).catch(() => {});
    fetch("/api/bnpl/eligibility", { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(d => {
      setBnplEligible(d.eligible ?? false);
    }).catch(() => setBnplEligible(false));
  }, [buyNowOpen, token]);

  const { data: listing, isLoading } = useGetListing(id, {
    query: { enabled: !!id, queryKey: getGetListingQueryKey(id) },
  });

  // Map listing condition to schema.org itemCondition values
  const schemaCondition: Record<string, string> = {
    new:            "https://schema.org/NewCondition",
    like_new:       "https://schema.org/LikeNewCondition",
    good:           "https://schema.org/UsedCondition",
    fair:           "https://schema.org/UsedCondition",
    poor:           "https://schema.org/DamagedCondition",
  };

  useSEO({
    title: listing?.title ?? undefined,
    description: listing?.title
      ? `${listing.title}${listing.price ? ` — $${listing.price}` : ""}${listing.location ? ` — ${listing.location}` : ""}. Achte sekirize sou FLEXA MARKET ann Ayiti.`
      : undefined,
    image: (listing as any)?.images?.[0] ?? undefined,
    path: id ? `/listings/${id}` : undefined,
    type: "product",
    jsonLd: listing ? {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": listing.title,
      "description": (listing as any).description
        ?? `${listing.title} — disponib sou FLEXA MARKET ann Ayiti.`,
      "image": (listing as any).images ?? [(listing as any).images?.[0]].filter(Boolean),
      "url": `https://flexamarket.com/listings/${listing.id}`,
      "itemCondition": schemaCondition[listing.condition] ?? "https://schema.org/UsedCondition",
      "offers": {
        "@type": "Offer",
        "priceCurrency": (listing as any).currency ?? "USD",
        "price": String(listing.price ?? 0),
        "availability": listing.status === "available"
          ? "https://schema.org/InStock"
          : "https://schema.org/SoldOut",
        "url": `https://flexamarket.com/listings/${listing.id}`,
        "seller": {
          "@type": "Person",
          "name": listing.sellerName ?? "Vandè FlexaMarket",
        },
      },
      "brand": { "@type": "Brand", "name": "FLEXA MARKET" },
    } : null,
  });

  // Prefer seller's own verified MonCash number for direct P2P; fallback to platform number.
  const sellerMonCashNumber: string | null = (listing as any)?.sellerMonCashNumber ?? null;
  const MONCASH_NUMBER = sellerMonCashNumber ?? PLATFORM_MONCASH_NUMBER;
  const moncashIsDirectToSeller = !!sellerMonCashNumber;
  const addFav = useAddFavorite();
  const removeFav = useRemoveFavorite();

  // Track a deduplicated view after the user has been on the page for ≥2.5 s
  const trackView = useViewTracker(id, {
    onCounted: (vc) => setDisplayViewCount(vc),
  });
  useEffect(() => {
    if (!listing?.id) return;
    const timer = setTimeout(trackView, 2500);
    return () => clearTimeout(timer);
  }, [listing?.id, trackView]);

  // Auto-open checkout panel when arriving from the video "Achte" CTA (?buy=1)
  useEffect(() => {
    if (!listing?.id) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("buy") !== "1") return;
    // Remove the flag from the URL without a full reload
    window.history.replaceState(null, "", `/listings/${id}`);
    if (!user) { setLocation("/auth/login"); return; }
    setPayStep("promo");
    setPayDone(false);
    setBuyNowOpen(true);
  }, [listing?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open checkout with agreed offer price when arriving from an accepted offer
  // URL shape: /listings/:id?offerPay=<offerId>&offerAmount=<agreedPrice>
  useEffect(() => {
    if (!listing?.id) return;
    const sp = new URLSearchParams(window.location.search);
    const opid = sp.get("offerPay");
    const oa   = sp.get("offerAmount");
    if (!opid || !oa) return;
    const parsedId  = parseInt(opid, 10);
    const parsedAmt = parseFloat(oa);
    if (isNaN(parsedId) || isNaN(parsedAmt) || parsedAmt <= 0) return;
    window.history.replaceState(null, "", `/listings/${id}`);
    if (!user) { setLocation("/auth/login"); return; }
    setOfferIdForPurchase(parsedId);
    setOfferPriceOverride(parsedAmt);
    setPayStep("promo");
    setPayDone(false);
    setBuyNowOpen(true);
  }, [listing?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const createConv = useCreateConversation();
  const createOffer = useCreateOffer();
  const deleteListing = useDeleteListing();

  // Fetch commission quote when the buy dialog opens — buyer sees the
  // "platform fee included" disclosure with the price breakdown. Declared
  // BEFORE any conditional return to satisfy the Rules of Hooks.
  const listingIdForQuote = (listing as any)?.id as number | undefined;
  const quoteMethod = ["moncash", "natcash", "usdt"].includes(payStep) ? payStep : (payStep === "select" || payStep === "delivery") ? "card" : undefined;
  // Effective delivery fee — 0 for pickup, calculated fee otherwise
  const effectiveDeliveryFee = (deliverySpeedTier === "pickup") ? 0 : deliveryFeeUsd;
  // Effective listing price — uses negotiated offer price when buying via accepted offer
  const effectiveListingPrice = offerPriceOverride ?? (listing?.price ?? 0);
  // Exchange rate for HTG/DOP → USD conversion in payment calculations
  const { data: exchangeRateData } = useExchangeRate();
  const listingCurrencyCode = (listing as any)?.currency ?? "USD";
  // effectiveListingPriceUsd is always in USD — used for wallet checks, payment totals,
  // and all $ displays. effectiveListingPrice (native currency) is kept for formatPrice display.
  const effectiveListingPriceUsd = useMemo(() => {
    if (listingCurrencyCode === "HTG") return htgToUsd(effectiveListingPrice, exchangeRateData?.displayRate ?? 132);
    if (listingCurrencyCode === "DOP") return dopToUsd(effectiveListingPrice);
    return effectiveListingPrice;
  }, [effectiveListingPrice, listingCurrencyCode, exchangeRateData]);
  useEffect(() => {
    if (!buyNowOpen || !token || !listingIdForQuote) { setQuote(null); return; }
    let cancelled = false;
    const url = `/api/commission/quote?listingId=${listingIdForQuote}` + (quoteMethod ? `&method=${quoteMethod}` : "") + (deliveryFeeUsd > 0 ? `&deliveryFeeUsd=${deliveryFeeUsd}` : "");
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setQuote({ ...(d as Quote), deliveryFeeUsd: deliveryFeeUsd > 0 ? deliveryFeeUsd : undefined }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [buyNowOpen, token, listingIdForQuote, quoteMethod, deliveryFeeUsd]);

  // Auto-calculate delivery fee when buyer enters their city (Haiti/DR only, debounced)
  const listingCity = (listing as any)?.city as string | undefined;
  const listingCountry = (listing as any)?.country as string | undefined;
  const isLocalDelivery = isLocalDeliveryCountry(listingCountry);
  const effectiveTip = (isLocalDelivery && deliverySpeedTier !== "pickup") ? tipUsd : 0;

  // Sync delivery method from listing (seller's choice) whenever listing loads
  useEffect(() => {
    const method = (listing as any)?.deliveryMethod;
    if (method === "motorcycle" || method === "car") setDeliveryMethod(method);
  }, [listing]);

  // Persist checkout form to localStorage so a half-filled form survives navigation.
  // Cleared automatically after a successful purchase (see submitPurchase below).
  useEffect(() => {
    if (!id) return;
    try {
      localStorage.setItem(formKey, JSON.stringify({ shipName, shipPhone, shipEmail, shipStreet, shipCity, shipRegion, shipZip }));
    } catch {}
  }, [shipName, shipPhone, shipEmail, shipStreet, shipCity, shipRegion, shipZip, id, formKey]);

  useEffect(() => {
    if (!isLocalDelivery || !shipCity.trim() || !listingCity || !buyNowOpen || !token) {
      if (!isLocalDelivery) {
        // International: fee comes from selectedCarrier + listing.shippingCost
      } else {
        setBaseFeeUsd(0);
        setDeliveryFeeUsd(0);
      }
      return;
    }
    const timer = setTimeout(async () => {
      setDeliveryFeeLoading(true);
      try {
        const res = await fetch("/api/delivery/calculate-price", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ sellerCity: listingCity, buyerCity: shipCity.trim(), country: listingCountry, method: deliveryMethod, listingPriceUsd: effectiveListingPriceUsd }),
        });
        if (res.ok) {
          const data = await res.json();
          const base = typeof data.feeUsd === "number" && data.feeUsd > 0 ? parseFloat(data.feeUsd.toFixed(2)) : 0;
          setBaseFeeUsd(base);
          setDeliveryFeeIsEstimate(base > 0 && data.cityResolved === false);
        } else {
          setBaseFeeUsd(0);
          setDeliveryFeeIsEstimate(false);
        }
      } catch { setBaseFeeUsd(0); setDeliveryFeeIsEstimate(false); }
      finally { setDeliveryFeeLoading(false); }
    }, 600);
    return () => clearTimeout(timer);
  }, [shipCity, listingCity, deliveryMethod, buyNowOpen, token, isLocalDelivery]);

  // Recompute deliveryFeeUsd whenever speed tier changes — fixed $10/$15/$25 tiers
  const DELIVERY_TIER_FEES: Record<string, number> = { regular: 10, rapid: 15, express: 25 };
  useEffect(() => {
    if (!isLocalDelivery) return;
    if (deliverySpeedTier === "custom") return; // custom: buyer sets fee directly via input
    if (deliverySpeedTier === "pickup") { setDeliveryFeeUsd(0); return; }
    setDeliveryFeeUsd(DELIVERY_TIER_FEES[deliverySpeedTier] ?? 10);
  }, [deliverySpeedTier, isLocalDelivery]);

  // International: weight-based carrier rate (falls back to seller flat-rate if no weight set)
  useEffect(() => {
    if (isLocalDelivery) return;
    if (!selectedCarrier) { setDeliveryFeeUsd(0); return; }
    const wLbs: number | null = (listing as any)?.weightLbs ?? null;
    const L: number | null = (listing as any)?.packageLengthIn ?? null;
    const W: number | null = (listing as any)?.packageWidthIn ?? null;
    const H: number | null = (listing as any)?.packageHeightIn ?? null;
    // DIM weight formula used by FedEx/UPS/DHL: L×W×H / 139 (inches, lbs)
    const dimWeight = (L && W && H && L > 0 && W > 0 && H > 0) ? (L * W * H) / 139 : 0;
    const billableWeight = wLbs ? Math.max(wLbs, dimWeight) : dimWeight;
    if (billableWeight > 0) {
      const rate = calcCarrierRate(selectedCarrier, billableWeight);
      setDeliveryFeeUsd(rate > 0 ? rate : 0);
    } else {
      // Fallback: seller-entered flat rate
      const cost = (listing as any)?.shippingCost;
      setDeliveryFeeUsd(typeof cost === "number" && cost > 0 ? parseFloat(cost.toFixed(2)) : 0);
    }
  }, [isLocalDelivery, selectedCarrier, listing]);

  // Smart tip prompt: 5 min after local purchase, poll if delivery still has no driver
  useEffect(() => {
    if (!localDeliveryPurchased || tipPromptSent) return;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/delivery/buyer/active", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        // Find the first waiting delivery without a tip (most likely the one just purchased)
        const waiting = Array.isArray(data)
          ? data.find((d: { id: number; status: string; tipUsd?: number | null }) =>
              d.status === "waiting" && !(d.tipUsd && d.tipUsd > 0)
            )
          : null;
        if (waiting) {
          setPurchasedDeliveryId(waiting.id);
          setShowTipPrompt(true);
        }
      } catch {
        // silently ignore
      }
    }, 5 * 60 * 1000); // 5 minutes
    return () => clearTimeout(timer);
  }, [localDeliveryPurchased, tipPromptSent, token]);

  // ── Zoom: reset whenever user navigates to a different image ───────────────
  useEffect(() => {
    zoomLive.current = 1; panLive.current = { x: 0, y: 0 };
    setZoom(1); setPanX(0); setPanY(0);
  }, [imgIndex]);

  // Non-passive touchmove so we can call preventDefault during pinch/pan
  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const onMove = (e: TouchEvent) => {
      if (zoomLive.current > 1 || e.touches.length === 2) e.preventDefault();
    };
    el.addEventListener("touchmove", onMove, { passive: false });
    return () => el.removeEventListener("touchmove", onMove);
  }, []);

  if (isLoading) {
    // Skeleton mirrors the real layout (image carousel + title + price +
    // seller card + actions) so the page doesn't reflow when data lands.
    return (
      <div className="max-w-4xl mx-auto px-4 py-4 space-y-4" data-testid="listing-skeleton">
        <Skeleton className="w-full rounded-2xl" style={{ aspectRatio: "3/2" }} />
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-6 w-3/4" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
      </div>
    );
  }
  if (!listing) return <div className="max-w-4xl mx-auto px-4 py-8 text-center text-muted-foreground">Listing not found</div>;

  const images = (listing as any).images ?? [];
  const boostVideoUrl = (listing as any).boostVideoUrl as string | null ?? null;
  const listingVideoUrl = (listing as any).listingVideoUrl as string | null ?? null;
  const boostExpiresAt = (listing as any).boostExpiresAt as string | null ?? null;

  // Promo badge only shows while boost is still active; video stays in gallery after expiry
  const isBoostActive = !!listing.isBoosted && !!boostExpiresAt && new Date(boostExpiresAt) > new Date();

  // Unified media items: boost promo video first, then product photos
  type MediaItem = { type: "image" | "video"; url: string; isPromo?: boolean };
  const mediaItems: MediaItem[] = [
    ...(boostVideoUrl ? [{ type: "video" as const, url: boostVideoUrl, isPromo: isBoostActive }] : []),
    ...images.map((url: string) => ({ type: "image" as const, url })),
  ];
  const totalMedia = mediaItems.length;
  const currentMedia: MediaItem = mediaItems[imgIndex] ?? {
    type: "image",
    url: `https://placehold.co/800x600/f97316/white?text=No+Image`,
  };

  const _pinchDist = (t: React.TouchList) =>
    Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

  const onHeroTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      pinchRef.current = { dist: _pinchDist(e.touches), z0: zoomLive.current };
      swipeStartXRef.current = null;
      panStartRef.current = null;
    } else if (e.touches.length === 1) {
      pinchRef.current = null;
      const now = Date.now();
      // Double-tap toggles 1× ↔ 2.5×
      if (now - lastTapRef.current < 280) {
        lastTapRef.current = 0;
        const next = zoomLive.current > 1 ? 1 : 2.5;
        zoomLive.current = next; panLive.current = { x: 0, y: 0 };
        setZoom(next); setPanX(0); setPanY(0);
        return;
      }
      lastTapRef.current = now;
      if (zoomLive.current > 1) {
        // Pan mode: record origin offset
        panStartRef.current = {
          ox: e.touches[0].clientX - panLive.current.x,
          oy: e.touches[0].clientY - panLive.current.y,
        };
        swipeStartXRef.current = null;
      } else {
        // Swipe mode: record start X for navigation
        swipeStartXRef.current = e.touches[0].clientX;
        panStartRef.current = null;
      }
    }
  };

  const onHeroTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2 && pinchRef.current) {
      const scale = Math.min(
        Math.max(pinchRef.current.z0 * (_pinchDist(e.touches) / pinchRef.current.dist), 1),
        5,
      );
      zoomLive.current = scale;
      setZoom(scale);
    } else if (e.touches.length === 1 && panStartRef.current && zoomLive.current > 1) {
      const nx = e.touches[0].clientX - panStartRef.current.ox;
      const ny = e.touches[0].clientY - panStartRef.current.oy;
      panLive.current = { x: nx, y: ny };
      setPanX(nx); setPanY(ny);
    }
  };

  const onHeroTouchEnd = (e: React.TouchEvent) => {
    // Swipe navigation only when not zoomed
    if (zoomLive.current <= 1 && swipeStartXRef.current !== null && totalMedia > 1 && e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - swipeStartXRef.current;
      if (Math.abs(dx) > 45) {
        setImgIndex(i => dx < 0 ? (i + 1) % totalMedia : (i - 1 + totalMedia) % totalMedia);
      }
    }
    swipeStartXRef.current = null;
    pinchRef.current = null;
    panStartRef.current = null;
    // Snap back to 1× if barely zoomed
    if (zoomLive.current < 1.08) {
      zoomLive.current = 1; panLive.current = { x: 0, y: 0 };
      setZoom(1); setPanX(0); setPanY(0);
    }
  };

  const country = (listing as any).country as string | null;
  const sellerPhone = (listing as any).sellerPhone as string | null;
  // The "Haiti" badge / payment hint on the listing card is driven by the
  // listing's country (a US listing should never advertise MonCash to a
  // browsing US user just because they happen to be in Haiti).
  const isHaitiListingCountry = isLocalDeliveryCountry(country);
  // MonCash + NatCash, however, are gated by the *viewer's* selected region:
  // anyone who chose Haiti as their country in their profile gets the
  // mobile-money options on every listing they buy, since those are the
  // payment rails their phone supports. Admins bypass for auditing.
  const isAdminViewer = !!(user?.isAdmin || (user as any)?.isSuperAdmin);
  const viewerCountry = (user as any)?.country as string | null | undefined;
  const showMobileMoney = viewerCountry === "Haiti" || isAdminViewer;

  const handleFav = () => {
    if (!user) { setLocation("/auth/login"); return; }
    const isFav = (listing as any).isFavorited;
    if (isFav) {
      removeFav.mutate({ listingId: id }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(id) }); queryClient.invalidateQueries({ queryKey: getGetFavoritesQueryKey() }); }
      });
    } else {
      addFav.mutate({ listingId: id }, {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(id) }); queryClient.invalidateQueries({ queryKey: getGetFavoritesQueryKey() }); }
      });
    }
  };

  const handleChat = () => {
    if (!user) { setLocation("/auth/login"); return; }
    createConv.mutate({ data: { listingId: id, sellerId: listing.sellerId } }, {
      onSuccess: (conv) => setLocation(`/messages/${(conv as any).id}`),
      onError: () => toast({ title: "Error", description: "Could not start conversation", variant: "destructive" }),
    });
  };

  const handleOffer = () => {
    if (!user) { setLocation("/auth/login"); return; }
    const raw = offerAmount.trim();
    if (!raw) {
      toast({ title: t("offer.enterValidAmount"), variant: "destructive" });
      return;
    }
    const amount = parseFloat(raw);
    if (isNaN(amount) || amount <= 0) {
      toast({ title: t("offer.priceTooLow"), variant: "destructive" });
      return;
    }
    createOffer.mutate({ data: { listingId: id, amount, message: offerMsg || undefined } }, {
      onSuccess: () => { setOfferSent(true); },
      onError: (e: Error) => toast({
        title: e.message || t("errors.serverError"),
        variant: "destructive",
      }),
    });
  };

  const handleDelete = () => {
    deleteListing.mutate({ id }, {
      onSuccess: () => {
        setDeleteConfirmOpen(false);
        toast({ title: t("listing.deleted", { defaultValue: "Listing deleted" }) });
        setLocation("/");
      },
      onError: (err: unknown) => {
        setDeleteConfirmOpen(false);
        const msg = err instanceof Error ? err.message : "Error deleting listing";
        toast({ title: msg, variant: "destructive" });
      },
    });
  };

  const handleRemoveVideo = async () => {
    setRemoveVideoLoading(true);
    try {
      await apiFetch(`/api/listings/${id}/video`, { method: "DELETE" });
      toast({ title: t("listing.videoRemoved", { defaultValue: "Video removed successfully" }) });
      queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(id) });
      setRemoveVideoConfirmOpen(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("common.error", { defaultValue: "Error" });
      toast({ title: msg, variant: "destructive" });
    } finally {
      setRemoveVideoLoading(false);
    }
  };

  const handleSubmitReview = async () => {
    if (!user) { setLocation("/auth/login"); return; }
    if (reviewRating === 0) {
      toast({ title: t("review.chooseStars", { defaultValue: "Please choose a star rating" }), variant: "destructive" });
      return;
    }
    setReviewLoading(true);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sellerId: (listing as any).sellerId, listingId: id, rating: reviewRating, comment: reviewComment.trim() }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error ?? `HTTP ${res.status}`);
      }
      toast({ title: t("review.success", { defaultValue: "Review submitted!" }) });
      setReviewOpen(false);
      setReviewRating(0);
      setReviewComment("");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast({
        title: t("review.error", { defaultValue: "Could not submit review" }),
        description: msg && !msg.startsWith("HTTP") ? msg : undefined,
        variant: "destructive",
      });
    } finally {
      setReviewLoading(false);
    }
  };

  const handleCallSeller = () => {
    if (!sellerPhone) {
      toast({ title: "Phone not available", description: "Message the seller to get their contact info." });
      return;
    }
    window.open(`tel:${sellerPhone}`, "_self");
  };

  const handleWhatsApp = () => {
    const phone = sellerPhone?.replace(/\D/g, "");
    if (!phone) {
      toast({ title: "Phone not available", description: "Message the seller to get their WhatsApp." });
      return;
    }
    const ogUrl = `${window.location.origin}/api/og/${id}`;
    const priceDisplay = formatPrice(listing.price, country, (listing as any).currency);
    const locationStr = (listing as any).city ?? listing.location ?? "";
    const lines = [
      `Bonjou! Mwen enterese ak pwodwi sa sou FLEXA MARKET 👇`,
      ``,
      `🛍️ ${listing.title}`,
      `💵 ${priceDisplay}`,
      ...(locationStr ? [`📍 ${locationStr}`] : []),
      ``,
      `🔗 ${ogUrl}`,
      ``,
      `Èske pwodwi sa toujou disponib?`,
    ];
    const msg = encodeURIComponent(lines.join("\n"));
    window.open(`https://wa.me/${phone}?text=${msg}`, "_blank", "noopener,noreferrer");
  };

  /**
   * Share-this-listing handler used by the bottom Share button. Tries
   * the native Web Share sheet first (mobile), then falls back to
   * copying the canonical listing URL to the clipboard. As a last
   * resort, opens a WhatsApp share window — never silently fails.
   */
  const handleShare = async () => {
    const ogUrl = `${window.location.origin}/api/og/${id}`;
    const priceDisplay = formatPrice(listing.price, country, (listing as any).currency);
    const shareText = `${listing.title} — ${priceDisplay}`;
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      try {
        await (navigator as any).share({ title: listing.title, text: shareText, url: ogUrl });
        return;
      } catch (err: any) {
        if (err?.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(ogUrl);
      toast({ title: "Lyen kopye!", description: "Ou ka kole l kote ou vle." });
    } catch {
      const locationStr = (listing as any).city ?? listing.location ?? "";
      const lines = [
        `Bonjou! Mwen wè pwodwi sa sou FLEXA MARKET 👇`,
        ``,
        `🛍️ ${listing.title}`,
        `💵 ${priceDisplay}`,
        ...(locationStr ? [`📍 ${locationStr}`] : []),
        ``,
        `🔗 ${ogUrl}`,
      ];
      window.open(`https://wa.me/?text=${encodeURIComponent(lines.join("\n"))}`, "_blank", "noopener,noreferrer");
    }
  };

  const validatePromoCode = async () => {
    if (!promoCode.trim()) return;
    setPromoValidating(true);
    setPromoError(null);
    setPromoValidation(null);
    try {
      const res = await fetch("/api/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: promoCode.trim(), orderValue: effectiveListingPriceUsd }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setPromoError(data?.error || "Kòd pa valab"); return; }
      setPromoValidation(data);
    } catch { setPromoError("Echèk rezo"); }
    finally { setPromoValidating(false); }
  };

  const clearPromo = () => { setPromoCode(""); setPromoValidation(null); setPromoError(null); };

  const submitPurchase = async (paymentMethod: string, paymentRef: string) => {
    setPayLoading(true);
    try {
      const res = await fetch(`/api/listings/${id}/purchase`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          paymentMethod,
          paymentRef,
          promoCode: promoValidation?.code ?? undefined,
          // Offer price override — server validates ownership and uses agreed price
          ...(offerIdForPurchase !== null ? { offerId: offerIdForPurchase } : {}),
          // Delivery type + fee
          deliveryType: deliverySpeedTier === "pickup" ? "pickup" : "delivery",
          buyerProposedDeliveryFee: deliverySpeedTier === "custom" && deliveryFeeUsd > 0 ? deliveryFeeUsd : undefined,
          deliveryFeeUsd: deliverySpeedTier === "pickup" ? undefined : (deliveryFeeUsd > 0 ? deliveryFeeUsd : undefined),
          deliveryMethod: deliverySpeedTier !== "pickup" && deliveryFeeUsd > 0 ? (isLocalDelivery ? deliveryMethod : (selectedCarrier ?? undefined)) : undefined,
          deliveryPickupCity: deliverySpeedTier !== "pickup" && deliveryFeeUsd > 0 && isLocalDelivery ? listingCity : undefined,
          // Driver tip (100% to driver, optional)
          deliveryTipUsd: isLocalDelivery && deliverySpeedTier !== "pickup" && tipUsd > 0 ? tipUsd : undefined,
          shipping: {
            name: shipName.trim(),
            phone: shipPhone.trim(),
            email: shipEmail.trim() || undefined,
            street: shipStreet.trim(),
            city: shipCity.trim(),
            region: shipRegion.trim(),
            zip: shipZip.trim() || undefined,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Payment failed", description: data?.error || "Please try again", variant: "destructive" });
        return;
      }
      setPurchaseResult({
        bonusEarned: data?.bonusEarned ?? 0,
        discountAmount: data?.discountAmount ?? 0,
        promoCodeApplied: data?.promoCodeApplied ?? null,
      });
      // Flag for smart tip prompt (fires after 5 min if still no driver)
      if (isLocalDelivery && deliveryFeeUsd > 0) {
        setLocalDeliveryPurchased(true);
      }
      setPayDone(true);
      // Clear persisted checkout form — purchase succeeded, slate is clean
      try { localStorage.removeItem(formKey); } catch {}
      queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(id) });
    } catch {
      toast({ title: "Network error", description: "Please try again", variant: "destructive" });
    } finally {
      setPayLoading(false);
    }
  };

  const handleStripeCheckout = async () => {
    if (!token) { setLocation("/auth/login"); return; }
    setStripeLoading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          listingId: id,
          // Offer price override — server validates ownership and uses agreed price
          ...(offerIdForPurchase !== null ? { offerId: offerIdForPurchase } : {}),
          shippingName: shipName.trim(),
          shippingPhone: shipPhone.trim(),
          shippingEmail: shipEmail.trim() || undefined,
          shippingStreet: shipStreet.trim(),
          shippingCity: shipCity.trim(),
          shippingRegion: shipRegion.trim(),
          shippingZip: shipZip.trim() || undefined,
          // Delivery type + fee
          deliveryType: deliverySpeedTier === "pickup" ? "pickup" : "delivery",
          buyerProposedDeliveryFee: deliverySpeedTier === "custom" && deliveryFeeUsd > 0 ? deliveryFeeUsd : undefined,
          deliveryFeeUsd: deliverySpeedTier === "pickup" ? undefined : (deliveryFeeUsd > 0 ? deliveryFeeUsd : undefined),
          deliveryMethod: deliverySpeedTier !== "pickup" && deliveryFeeUsd > 0 ? (isLocalDelivery ? deliveryMethod : (selectedCarrier ?? undefined)) : undefined,
          deliveryPickupCity: deliverySpeedTier !== "pickup" && deliveryFeeUsd > 0 && isLocalDelivery ? listingCity : undefined,
          // Driver tip
          deliveryTipUsd: isLocalDelivery && deliverySpeedTier !== "pickup" && tipUsd > 0 ? tipUsd : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Payment error", description: data?.error || "Could not start checkout", variant: "destructive" });
        return;
      }
      if (data.url) {
        window.location.href = data.url;
      } else {
        toast({ title: "Payment error", description: "No checkout URL received", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", description: "Please try again", variant: "destructive" });
    } finally {
      setStripeLoading(false);
    }
  };

  const handleBnplCheckout = async (provider: "klarna" | "affirm" | "afterpay_clearpay") => {
    if (!token) { setLocation("/auth/login"); return; }
    setBnplLoading(provider);
    try {
      const res = await fetch("/api/bnpl/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          listingId: id,
          bnplMethod: provider,
          shippingName: shipName.trim(),
          shippingPhone: shipPhone.trim(),
          shippingEmail: shipEmail.trim() || undefined,
          shippingStreet: shipStreet.trim(),
          shippingCity: shipCity.trim(),
          shippingRegion: shipRegion.trim(),
          shippingZip: shipZip.trim() || undefined,
          deliveryType: deliverySpeedTier === "pickup" ? "pickup" : "delivery",
          buyerProposedDeliveryFee: deliverySpeedTier === "custom" && deliveryFeeUsd > 0 ? deliveryFeeUsd : undefined,
          deliveryFeeUsd: deliverySpeedTier === "pickup" ? undefined : (deliveryFeeUsd > 0 ? deliveryFeeUsd : undefined),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: t("checkout.bnplError"), description: data?.error || t("checkout.bnplStart"), variant: "destructive" });
        return;
      }
      if (data.sessionUrl) {
        window.location.href = data.sessionUrl;
      } else {
        toast({ title: t("checkout.bnplError"), description: t("checkout.bnplNoUrl"), variant: "destructive" });
      }
    } catch {
      toast({ title: t("checkout.networkError"), description: t("checkout.tryAgain"), variant: "destructive" });
    } finally {
      setBnplLoading(null);
    }
  };

  const handleStreetChange = (val: string) => {
    setShipStreet(val);
    setShowSuggestions(false);
    if (streetDebounceRef.current) clearTimeout(streetDebounceRef.current);
    if (val.trim().length < 4) { setStreetSuggestions([]); return; }
    streetDebounceRef.current = setTimeout(async () => {
      setSuggestLoading(true);
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(val)}&format=json&addressdetails=1&limit=5`, { headers: { "Accept-Language": "fr,en" } });
        const data = await r.json();
        setStreetSuggestions(Array.isArray(data) ? data : []);
        setShowSuggestions(true);
      } catch { setStreetSuggestions([]); }
      finally { setSuggestLoading(false); }
    }, 420);
  };

  const applySuggestion = (s: typeof streetSuggestions[0]) => {
    const a = s.address;
    const road = [a.road, a.suburb].filter(Boolean).join(", ");
    setShipStreet(road || s.display_name.split(",")[0]);
    setShipCity(a.city ?? a.town ?? a.village ?? "");
    setShipRegion(a.state ?? "");
    setShipZip(a.postcode ?? "");
    setStreetSuggestions([]);
    setShowSuggestions(false);
  };

  const handleConfirmUsdt = () => {
    const hash = usdtTxHash.trim();
    if (hash.length < 10) {
      toast({ title: "Enter a valid USDT transaction hash" });
      return;
    }
    submitPurchase("usdt", hash);
  };

  const handleWalletPayment = async () => {
    if (!token) { setLocation("/auth/login"); return; }
    const effectivePrice = listing ? effectiveListingPriceUsd - (promoValidation?.discountAmount ?? 0) : 0;
    const walletRequired = effectivePrice + effectiveDeliveryFee + effectiveTip;
    if (walletTotal < walletRequired - 0.001) {
      const desc = effectiveDeliveryFee > 0
        ? `Ou bezwen $${walletRequired.toFixed(2)} (atik + livrezon${effectiveTip > 0 ? ` + $${effectiveTip.toFixed(2)} tip` : ""}) men ou gen $${walletTotal.toFixed(2)}.`
        : `Ou bezwen $${walletRequired.toFixed(2)} men ou gen $${walletTotal.toFixed(2)} nan wallet ou.`;
      toast({ title: "Balans pa ase", description: desc, variant: "destructive" });
      return;
    }
    setWalletPayLoading(true);
    await submitPurchase("wallet", `WALLET-${Date.now()}`);
    setWalletPayLoading(false);
  };

  // MonCash / NatCash buyers send the funds outside the app and confirm
  // here. We accept an optional transaction id; when blank we synthesise
  // a server-side reference so the seller still has something to track.
  const handleConfirmMobileMoney = (method: "moncash" | "natcash") => {
    const trimmed = mobileMoneyTxId.trim();
    const ref = trimmed.length > 0
      ? `${method.toUpperCase()}-${trimmed}`
      : `${method.toUpperCase()}-${Date.now()}`;
    submitPurchase(method, ref);
  };

  const isFav = (listing as any).isFavorited;
  const isOwner = (listing as any).isOwner;

  return (
    <div className="min-h-screen bg-background">

      {/* ══════════ HERO IMAGE — full bleed ══════════ */}
      <div
        ref={heroRef}
        className="relative w-full bg-black overflow-hidden"
        style={{ aspectRatio: "3/2", maxHeight: "min(65vw, 440px)", touchAction: zoom > 1 ? "none" : "pan-y" }}
        onTouchStart={onHeroTouchStart}
        onTouchMove={onHeroTouchMove}
        onTouchEnd={onHeroTouchEnd}
      >
        {currentMedia.type === "video" ? (
          <div className="relative w-full h-full">
            <video
              key={currentMedia.url}
              src={currentMedia.url}
              autoPlay
              muted={videoMuted}
              loop
              playsInline
              className="w-full h-full object-contain"
              preload="auto"
              style={{
                transform: `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`,
                transformOrigin: "center center",
                transition: pinchRef.current || panStartRef.current ? "none" : "transform 0.22s ease",
                willChange: "transform",
              }}
            />
            <button
              onClick={() => setVideoMuted(m => !m)}
              className="absolute bottom-12 right-3 bg-black/60 backdrop-blur-sm text-white rounded-full p-2 z-10"
              aria-label={videoMuted ? "Unmute" : "Mute"}
            >
              {videoMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
        ) : (
          <img
            src={currentMedia.url}
            alt={listing.title}
            className="w-full h-full object-contain"
            draggable={false}
            onError={e => { (e.target as HTMLImageElement).src = "https://placehold.co/800x600/f97316/white?text=No+Image"; }}
            style={{
              transform: `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`,
              transformOrigin: "center center",
              transition: pinchRef.current || panStartRef.current ? "none" : "transform 0.22s ease",
              willChange: "transform",
              userSelect: "none",
            }}
          />
        )}

        {/* Back button overlay */}
        <button
          onClick={() => history.back()}
          className="absolute top-4 left-3 z-20 w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
          data-testid="button-back"
        >
          <ChevronLeft className="h-5 w-5 text-white" />
        </button>

        {/* Top-right overlay: fav + share */}
        <div className="absolute top-4 right-3 z-20 flex gap-2">
          <button
            onClick={handleFav}
            data-testid="button-favorite"
            className={`w-9 h-9 rounded-full backdrop-blur-sm flex items-center justify-center active:scale-90 transition-all ${isFav ? "bg-red-500 shadow-lg" : "bg-black/50"}`}
          >
            <Heart className={`h-4 w-4 text-white ${isFav ? "fill-white" : ""}`} />
          </button>
          <button
            onClick={handleShare}
            data-testid="button-share-listing"
            className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center active:scale-90 transition-transform"
          >
            <Share2 className="h-4 w-4 text-white" />
          </button>
        </div>

        {/* Nav arrows */}
        {totalMedia > 1 && (
          <>
            <button
              onClick={() => setImgIndex(i => (i - 1 + totalMedia) % totalMedia)}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/60 backdrop-blur-sm text-white rounded-full p-1.5 z-10"
              data-testid="button-img-prev"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => setImgIndex(i => (i + 1) % totalMedia)}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/60 backdrop-blur-sm text-white rounded-full p-1.5 z-10"
              data-testid="button-img-next"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        {/* Image counter */}
        {totalMedia > 1 && (
          <div className="absolute bottom-3 right-3 z-10 px-2.5 py-0.5 rounded-full bg-black/60 text-white text-xs font-bold tabular-nums">
            {imgIndex + 1}/{totalMedia}
          </div>
        )}

        {/* Dot indicator */}
        {totalMedia > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1.5 z-10">
            {mediaItems.map((item, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === imgIndex
                    ? item.type === "video" ? "bg-orange-400 w-3" : "bg-white w-3"
                    : item.type === "video" ? "bg-orange-300/60 w-1.5" : "bg-white/50 w-1.5"
                }`}
              />
            ))}
          </div>
        )}

        {/* Boosted badge */}
        {listing.isBoosted && (
          <div className="absolute top-14 left-3 z-10 bg-primary text-primary-foreground text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md">
            <Zap className="h-3 w-3" /> {t("listing.featured")}
          </div>
        )}

        {/* Promo video badge */}
        {currentMedia.isPromo && (
          <div className="absolute top-14 right-3 z-10 bg-orange-500 text-white text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md">
            <Film className="h-3 w-3" /> Videyo Promo
          </div>
        )}
      </div>

      {/* Thumbnail strip */}
      {totalMedia > 1 && (
        <div className="flex gap-2 px-4 mt-2 overflow-x-auto pb-1 scrollbar-none">
          {mediaItems.map((item, i) => (
            <button
              key={i}
              onClick={() => setImgIndex(i)}
              className={`relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 bg-black transition-all ${i === imgIndex ? "border-primary" : "border-transparent opacity-60"}`}
            >
              {item.type === "video" ? (
                <>
                  <video src={item.url} preload="metadata" playsInline muted className="w-full h-full object-cover pointer-events-none" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <Play className="h-3 w-3 text-white fill-white" />
                  </div>
                  {item.isPromo && (
                    <div className="absolute bottom-0 inset-x-0 bg-orange-500 text-white text-[8px] font-bold text-center py-0.5">PROMO</div>
                  )}
                </>
              ) : (
                <img src={item.url} alt="" className="w-full h-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}

      {/* Listing video (non-boost) */}
      {listingVideoUrl && (
        <div className="mx-4 mt-2 rounded-xl overflow-hidden border border-border bg-black relative" data-testid="listing-video">
          <video src={listingVideoUrl} controls playsInline className="w-full max-h-56 object-contain" preload="metadata" />
          {isOwner && (
            <button
              onClick={() => setRemoveVideoConfirmOpen(true)}
              className="absolute top-2 right-2 bg-black/70 hover:bg-red-600 text-white rounded-full p-1.5 transition-colors"
              title={t("listing.removeVideo", { defaultValue: "Remove Video" })}
              data-testid="button-remove-video"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* ══════════ SCROLLING INFO STRIP ══════════ */}
      <div className="flex overflow-x-auto scrollbar-none bg-green-600 text-white text-[11px] font-semibold">
        <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 border-r border-white/20 whitespace-nowrap">
          <Shield className="h-3 w-3 flex-shrink-0" /> {t("listing.noImportFees")}
        </div>
        <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 border-r border-white/20 whitespace-nowrap">
          {t("listing.localWarehouse")}
        </div>
        <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 whitespace-nowrap">
          {t("listing.lateCredit")}
        </div>
      </div>

      {/* ══════════ SALES + SELLER STRIP ══════════ */}
      <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground border-b border-border">
        <span className="font-semibold">{formatViewCount(displayViewCount ?? listing.viewCount ?? 0)} {t("listing.views")}</span>
        <span>·</span>
        <span>{t("listing.soldBy")}</span>
        <button
          onClick={() => setLocation(`/profile/${listing.sellerId}`)}
          className="flex items-center gap-1 font-bold text-foreground hover:text-primary transition-colors"
          data-testid="button-view-seller"
        >
          {listing.sellerName}
          {listing.sellerIsVerified && <BadgeCheck className="h-3 w-3 fill-blue-500 text-white" />}
          <ChevronRight className="h-3 w-3 opacity-60" />
        </button>
      </div>

      {/* ══════════ MAIN CONTENT ══════════ */}
      <div className="divide-y divide-border pb-8">

        {/* ── TITLE + PRICE SECTION ── */}
        <div className="px-4 py-4 space-y-2.5">
          <h1 className="text-base font-bold text-foreground leading-snug">{listing.title}</h1>

          {/* Price row: strikethrough → DERNIER JOUR badge → current price */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-sm line-through text-muted-foreground">${(effectiveListingPriceUsd * 1.74).toFixed(2)}</span>
            {listing.isBoosted && (
              <span className="text-[10px] font-black bg-red-600 text-white px-1.5 py-0.5 rounded leading-none">{t("listing.lastDay")}</span>
            )}
            <span className="text-3xl font-black text-red-600">{formatPrice(listing.price, country, (listing as any).currency)}</span>
          </div>

          {/* Discount + stock badges */}
          <div className="flex gap-2 flex-wrap">
            <span className="text-xs font-black bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-700 px-2 py-1 rounded">
              74% {t("checkout.discount")}
            </span>
            {(listing as any).stockQuantity != null && (listing as any).stockQuantity <= 5 && (
              <span className="text-xs font-black bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-800 px-2 py-1 rounded flex items-center gap-1">
                {t("checkout.almostGoneWithCount", { count: (listing as any).stockQuantity })}
              </span>
            )}
            {listing.status === "sold" && <Badge variant="destructive" className="text-xs font-black">{t("checkout.soldBadge")}</Badge>}
          </div>

          {/* BNPL teaser */}
          {bnplSettings && (bnplSettings.affirmEnabled || bnplSettings.klarnaEnabled) && (
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => { if (!user) { setLocation("/auth/login"); return; } setPayStep("promo"); setPayDone(false); setBuyNowOpen(true); }}
            >
              <span>Peye <strong className="text-foreground">${(effectiveListingPriceUsd / 3).toFixed(2)}</strong> jodi a ak</span>
              {bnplSettings.affirmEnabled && <span className="font-black text-[#00d647]">Affirm</span>}
              {bnplSettings.klarnaEnabled && <><span>&</span><span className="font-black text-[#ff69a2]">Klarna</span></>}
              <ChevronRight className="h-3 w-3" />
            </button>
          )}

          {/* Promo code input strip */}
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border bg-muted/20 text-xs">
            <Gift className="h-3.5 w-3.5 text-orange-500 flex-shrink-0" />
            <input
              value={promoCode}
              onChange={e => setPromoCode(e.target.value.toUpperCase())}
              placeholder="Antre kòd promo oswa koupon…"
              className="flex-1 bg-transparent outline-none text-foreground min-w-0 placeholder:text-muted-foreground"
            />
            {promoCode.length >= 3 && (
              <button onClick={validatePromoCode} disabled={promoValidating} className="text-orange-600 font-black flex-shrink-0 disabled:opacity-50">
                {promoValidating ? "…" : "Aplike"}
              </button>
            )}
          </div>
          {promoValidation?.valid && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 text-xs font-bold text-green-700 dark:text-green-400">
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
              ${promoValidation.discountAmount.toFixed(2)} reduksyon aplike · Total: ${promoValidation.finalPrice.toFixed(2)}
            </div>
          )}
          {promoError && <p className="text-xs text-red-500">{promoError}</p>}

        </div>

        {/* ── QUANTITY SELECTOR ── */}
        <div className="px-4 py-4 space-y-3">
          <div className="flex items-center gap-4">
            <img
              src={(listing as any).images?.[0] ?? "https://placehold.co/56x56/f97316/white?text=FM"}
              alt=""
              className="w-14 h-14 rounded-xl object-cover border-2 border-border flex-shrink-0"
            />
            <div className="flex-1">
              <p className="text-xs text-muted-foreground mb-2">
                {t("search.condition")}: <strong className="text-foreground capitalize">{{
                  new: t("search.conditionNew"),
                  like_new: t("search.conditionLikeNew"),
                  good: t("search.conditionGood"),
                  fair: t("search.conditionFair"),
                  poor: t("search.conditionPoor"),
                }[listing.condition] ?? listing.condition.replace("_", " ")}</strong>
                {(listing as any).weightLbs != null && <span className="ml-2">⚖️ {(listing as any).weightLbs} lbs</span>}
              </p>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setBuyQty(q => Math.max(1, q - 1))}
                  disabled={buyQty <= 1}
                  className="w-10 h-10 rounded-xl border-2 border-border flex items-center justify-center font-black text-2xl text-foreground hover:border-primary active:scale-90 transition-all disabled:opacity-30 select-none"
                >
                  −
                </button>
                <span className="text-xl font-black w-8 text-center tabular-nums">{buyQty}</span>
                <button
                  onClick={() => setBuyQty(q => q + 1)}
                  className="w-10 h-10 rounded-xl border-2 border-primary bg-primary/10 flex items-center justify-center font-black text-2xl text-primary hover:bg-primary/20 active:scale-90 transition-all select-none"
                >
                  +
                </button>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-green-700 dark:text-green-400 bg-green-50 dark:bg-green-950/30 rounded-lg px-3 py-2">
            <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Livrezon gratis sou {buyQty} inite</span>
          </div>
        </div>

        {/* ── SELLER + SHIPPING ── */}
        <div className="px-4 py-4 space-y-3">
          <button
            onClick={() => setLocation(`/profile/${listing.sellerId}`)}
            className="flex items-center gap-3 w-full text-left"
          >
            <Avatar className="h-10 w-10 flex-shrink-0">
              <AvatarImage src={listing.sellerAvatar ?? undefined} />
              <AvatarFallback className="bg-primary text-primary-foreground font-bold text-sm">{listing.sellerName[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-sm text-foreground">{listing.sellerName}</span>
                {listing.sellerIsVerified && <BadgeCheck className="h-4 w-4 fill-blue-500 text-white" />}
              </div>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span>{listing.sellerRating.toFixed(1)}</span>
                <span>· {t("listing.viewProfile")}</span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </button>

          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <Truck className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
              <strong className="text-foreground">{t("listing.shippedBy")}</strong>
            </div>
            <div className="flex items-start gap-2">
              <CreditCard className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
              <span dangerouslySetInnerHTML={{ __html: t("listing.standardFreeShipping").replace("FREE", `<strong class="text-green-600 dark:text-green-400">FREE</strong>`).replace("GRATUIT", `<strong class="text-green-600 dark:text-green-400">GRATUIT</strong>`).replace("GRATIS", `<strong class="text-green-600 dark:text-green-400">GRATIS</strong>`) }} />
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 text-green-500 flex-shrink-0" />
              <span className="text-green-700 dark:text-green-400 font-semibold">{t("listing.freeShippingQty", { count: buyQty })}</span>
            </div>
          </div>

          {/* Secondary contact buttons — hidden from the listing owner */}
          {!isOwner && <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={handleChat} disabled={createConv.isPending} data-testid="button-chat-seller">
              <MessageCircle className="h-3.5 w-3.5 mr-1.5" />
              {createConv.isPending ? t("buttons.openingChat") : t("buttons.messageSeller")}
            </Button>
            {isHaitiListingCountry && (
              <Button variant="outline" size="sm" className="flex-1" onClick={handleCallSeller} data-testid="button-call-seller">
                <Phone className="h-3.5 w-3.5 mr-1.5" /> {t("buttons.callSeller")}
              </Button>
            )}
          </div>}

          {!isOwner && listing.isBoosted && sellerPhone && (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-green-700 border-green-300 dark:text-green-400 dark:border-green-700"
              onClick={handleWhatsApp}
              data-testid="button-whatsapp"
            >
              <svg className="h-3.5 w-3.5 mr-2 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              {t("buttons.whatsapp")}
            </Button>
          )}
        </div>

        {/* ── DESCRIPTION ── */}
        <div className="px-4 py-4 space-y-2.5">
          <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">Deskripsyon</h2>
          <p className="text-sm text-foreground/80 leading-relaxed">{listing.description}</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline" className="text-xs">{listing.category}</Badge>
            <Badge variant="secondary" className="text-xs">{{
                new: t("search.conditionNew"),
                like_new: t("search.conditionLikeNew"),
                good: t("search.conditionGood"),
                fair: t("search.conditionFair"),
                poor: t("search.conditionPoor"),
              }[listing.condition] ?? listing.condition.replace("_", " ")}</Badge>
            {(listing as any).weightLbs != null && (
              <Badge variant="outline" className="text-xs gap-1">⚖️ {(listing as any).weightLbs} lbs</Badge>
            )}
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" /> {(listing as any).city ?? listing.location}
            </div>
            {country && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Globe className="h-3 w-3" /> {country}
              </div>
            )}
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border">
            <span>{formatViewCount(displayViewCount ?? listing.viewCount ?? 0)} {t("listing.views")}</span>
            <span>{listing.favoriteCount} {t("listing.saves")}</span>
            <span>{t("listing.postedOn")} {new Date(listing.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        {/* ── DELIVERY & RETURN POLICY ── */}
        {country && (
          <div className="px-4 pb-4">
            <div className="rounded-2xl border border-border bg-card p-4 space-y-2.5">
              <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground mb-1">Livrezon &amp; Retou</h2>

              {/* Return guarantee */}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-green-50 dark:bg-green-950/20 border border-green-200/60 dark:border-green-800/40">
                <span className="text-xl mt-0.5">↩️</span>
                <div>
                  <p className="text-sm font-bold text-green-800 dark:text-green-300">
                    {getReturnDays(country)} jou retou garanti
                  </p>
                  <p className="text-xs text-green-700/80 dark:text-green-400/80 mt-0.5">
                    Si pwodwi a pa kòrèk jan yo dekri l, ou ka retounen l gratis
                  </p>
                </div>
              </div>

              {/* Delivery */}
              {isHaitiListingCountry ? (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40">
                  <span className="text-xl mt-0.5">🚗</span>
                  <div>
                    <p className="text-sm font-bold text-blue-800 dark:text-blue-300">Livrezon pa chofè FlexaMarket</p>
                    <p className="text-xs text-blue-700/80 dark:text-blue-400/80 mt-0.5">Traking an tan reyèl · Konfirmasyon pa kòd sekrè</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200/60 dark:border-blue-800/40">
                  <span className="text-xl mt-0.5">📦</span>
                  <div>
                    <p className="text-sm font-bold text-blue-800 dark:text-blue-300">Livrezon lokal disponib</p>
                    <p className="text-xs text-blue-700/80 dark:text-blue-400/80 mt-0.5">USPS · DHL · FedEx · UPS · ak transpòtè lokal nan peyi ou</p>
                  </div>
                </div>
              )}

              {/* Escrow protection */}
              <div className="flex items-start gap-3 p-3 rounded-xl bg-violet-50 dark:bg-violet-950/20 border border-violet-200/60 dark:border-violet-800/40">
                <span className="text-xl mt-0.5">🔒</span>
                <div>
                  <p className="text-sm font-bold text-violet-800 dark:text-violet-300">Peman pwoteje (Escrow)</p>
                  <p className="text-xs text-violet-700/80 dark:text-violet-400/80 mt-0.5">Lajan ou kenbe jiskaske ou konfime ou resevwa pwodwi a</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── OWNER ACTIONS ── */}
        {isOwner && (
          <div className="px-4 py-4 space-y-2">
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setLocation(`/sell?edit=${id}`)} data-testid="button-edit-listing">
                <Pencil className="h-4 w-4 mr-1" /> {t("buttons.edit")}
              </Button>
              <Button variant="destructive" size="icon" onClick={() => setDeleteConfirmOpen(true)} data-testid="button-delete-listing">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {/* Quick restock button — only shown when listing has a stock quantity */}
            {(listing as any).stockQuantity != null && (
              <button
                onClick={() => { setRestockQty("10"); setRestockOpen(true); }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-dashed border-orange-400/60 bg-orange-50 dark:bg-orange-950/20 text-sm hover:bg-orange-100 dark:hover:bg-orange-950/40 transition-colors"
                data-testid="button-restock"
              >
                <span className="text-orange-700 dark:text-orange-400 font-semibold">
                  📦 Stock kounye a: <strong>{(listing as any).stockQuantity}</strong>
                </span>
                <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full font-bold">+ Ajoute</span>
              </button>
            )}
            {listing.status === "available" ? (
              <Button variant="default" className="w-full bg-green-600 hover:bg-green-700 text-white" onClick={async () => {
                try {
                  await apiFetch(`/api/listings/${id}`, { method: "PUT", body: JSON.stringify({ status: "sold" }) });
                  toast({ title: t("listing.markedSold", { defaultValue: "Marked as sold" }) });
                  queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(id) });
                  queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getGetFeaturedListingsQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getGetUserListingsQueryKey(listing.sellerId) });
                  queryClient.invalidateQueries({ queryKey: getGetFavoritesQueryKey() });
                } catch { toast({ title: t("common.error", { defaultValue: "Error" }), variant: "destructive" }); }
              }} data-testid="button-mark-sold">
                <CheckCircle2 className="h-4 w-4 mr-2" /> {t("buttons.markAsSold", { defaultValue: "Mark as sold" })}
              </Button>
            ) : listing.status === "sold" ? (
              <Button variant="outline" className="w-full" onClick={async () => {
                try {
                  await apiFetch(`/api/listings/${id}`, { method: "PUT", body: JSON.stringify({ status: "available" }) });
                  toast({ title: t("listing.relisted", { defaultValue: "Re-listed as available" }) });
                  queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(id) });
                  queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getGetFeaturedListingsQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getGetUserListingsQueryKey(listing.sellerId) });
                } catch { toast({ title: t("common.error", { defaultValue: "Error" }), variant: "destructive" }); }
              }} data-testid="button-relist">
                {t("buttons.relist", { defaultValue: "Re-list as available" })}
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setLocation(`/boost/${id}`)} data-testid="button-boost-listing">
              <Zap className="h-4 w-4 mr-1" /> {t("buttons.boostListing")}
            </Button>
          </div>
        )}

        {isAdminViewer && !isOwner && (
          <div className="px-4 py-3">
            <Button variant="outline" size="sm" className="w-full border-amber-400 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/20" onClick={() => setLocation(`/boost/${id}`)} data-testid="button-admin-boost-listing">
              <Zap className="h-4 w-4 mr-1" />
              <Shield className="h-3.5 w-3.5 mr-1.5 opacity-70" />
              Boost (Admin)
            </Button>
          </div>
        )}

        {(listing.status !== "available" || isOwner) && (
          <div className="px-4 py-3">
            <Button variant="outline" className="w-full" onClick={handleShare} data-testid="button-share-listing-secondary">
              <Share2 className="h-4 w-4 mr-2" /> {t("buttons.share")}
            </Button>
          </div>
        )}

        {!isOwner && listing.status === "available" && (
          <div className="px-4 py-3">
            <Button variant="ghost" className="w-full" onClick={() => setOfferOpen(true)} data-testid="button-make-offer">
              <Tag className="h-4 w-4 mr-2" /> {t("buttons.makeOffer")}
            </Button>
          </div>
        )}

        {/* ── REVIEW PROMPT ── */}
        {user && !isOwner && (
          <div className="px-4 py-3">
            <button onClick={() => setReviewOpen(true)} className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 hover:underline" data-testid="button-leave-review">
              <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
              {t("review.rateSeller", { defaultValue: "Rate this seller" })}
            </button>
          </div>
        )}

        {/* ── COMMENTS ── */}
        <div className="px-4 pt-4 pb-2">
          <CommentsSection listingId={id} />
        </div>

        {/* spacer so content clears the sticky buy bar — always rendered
            when the buy bar could appear so the layout never shifts when the
            buy dialog opens / closes (removing it caused the page to jump) */}
        {!isOwner && listing.status === "available" && (
          <div className="h-24" />
        )}

      </div>

      {/* ══════════ FLOATING CART BUBBLE ══════════ */}
      {user && !isOwner && !buyNowOpen && (
        <button
          onClick={() => setLocation("/cart")}
          className="fixed top-20 right-4 z-[55] flex flex-col items-center gap-0.5"
        >
          <div className="relative w-14 h-14 rounded-full bg-primary shadow-xl flex items-center justify-center">
            <ShoppingCart className="h-6 w-6 text-primary-foreground" />
            {cartItems.length > 0 && (
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-500 text-white text-[10px] font-black flex items-center justify-center">
                {cartItems.length > 99 ? "99+" : cartItems.length}
              </span>
            )}
          </div>
          <span className="text-[9px] font-bold text-center text-muted-foreground leading-tight max-w-[60px] bg-background/90 rounded px-1 py-0.5 shadow">
            {t("listing.noImportFees")}
          </span>
        </button>
      )}


      {/* ══════════ STICKY BOTTOM BUY BAR (Temu-style) ══════════ */}
      {!isOwner && listing.status === "available" && !buyNowOpen && (
        <div className="fixed bottom-0 left-0 right-0 z-[60] bg-background border-t border-border/60 shadow-[0_-4px_24px_rgba(0,0,0,0.10)] flex items-center gap-2.5 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">

          {/* Add to Cart */}
          {user && user.id !== listing.sellerId && (() => {
            const inCart = isInCart(id);
            return (
              <button
                onClick={() => {
                  if (inCart) {
                    removeItem(id);
                    toast({ title: t("listing.removeFromCart") });
                  } else {
                    addItem({
                      listingId: id,
                      title: listing.title,
                      price: listing.price,
                      currency: (listing as any).currency ?? "USD",
                      image: (listing as any).images?.[0] ?? null,
                      country: (listing as any).country ?? null,
                      sellerId: listing.sellerId,
                    });
                    toast({ title: `✅ ${t("listing.addedToCart")}`, description: listing.title });
                  }
                }}
                data-testid="button-add-to-cart"
                className={`flex-1 flex items-center justify-center gap-2 h-12 rounded-xl border-2 font-bold text-sm transition-all active:scale-95 ${
                  inCart
                    ? "border-green-500 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400"
                    : "border-border text-foreground bg-background hover:bg-muted"
                }`}
              >
                <ShoppingCart className="h-4 w-4 flex-shrink-0" />
                <span className="text-[13px]">{inCart ? t("listing.inCart") : t("listing.addToCart")}</span>
              </button>
            );
          })()}

          {/* Buy Now */}
          <button
            onClick={() => { if (!user) { setLocation("/auth/login"); return; } setPayStep("promo"); setPayDone(false); setBuyNowOpen(true); }}
            data-testid="button-buy-now"
            className="flex-[1.6] h-12 flex items-center justify-center gap-2 rounded-xl font-black text-sm text-white active:scale-95 transition-all"
            style={{ background: "linear-gradient(135deg,#fb923c 0%,#f97316 60%,#ea6c08 100%)" }}
          >
            <Zap className="h-4 w-4 flex-shrink-0" />
            <div className="flex flex-col items-start leading-tight">
              <span className="text-[13px] font-black">{t("buttons.buyNow")}</span>
              <span className="text-[10px] font-semibold opacity-90">{formatPrice(listing.price, country, (listing as any).currency)}</span>
            </div>
          </button>
        </div>
      )}

      {/* Offer Dialog */}
      {/* ── DELETE CONFIRM DIALOG ── */}
      {/* ── Restock Dialog ── */}
      <Dialog open={restockOpen} onOpenChange={setRestockOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              📦 Ogmante kantite stock la
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-4">
            <p className="text-sm text-muted-foreground">
              Stock kounye a: <strong>{(listing as any)?.stockQuantity ?? 0}</strong>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setRestockQty(q => String(Math.max(1, parseInt(q || "0") - 1)))}
                className="h-9 w-9 rounded-lg border border-border flex items-center justify-center text-lg font-bold hover:bg-muted transition-colors"
              >−</button>
              <Input
                type="number"
                min="1"
                max="9999"
                value={restockQty}
                onChange={e => setRestockQty(e.target.value)}
                className="text-center font-bold text-lg h-9"
              />
              <button
                onClick={() => setRestockQty(q => String(Math.min(9999, parseInt(q || "0") + 1)))}
                className="h-9 w-9 rounded-lg border border-border flex items-center justify-center text-lg font-bold hover:bg-muted transition-colors"
              >+</button>
            </div>
            <div className="flex gap-2">
              {[5, 10, 20, 50].map(n => (
                <button
                  key={n}
                  onClick={() => setRestockQty(String(n))}
                  className="flex-1 text-xs py-1.5 rounded-lg border border-border hover:bg-muted font-semibold transition-colors"
                >+{n}</button>
              ))}
            </div>
          </div>
          <DialogFooter className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1" onClick={() => setRestockOpen(false)} disabled={restocking}>
              Anile
            </Button>
            <Button
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold"
              disabled={restocking || !restockQty || parseInt(restockQty) < 1}
              onClick={async () => {
                const add = parseInt(restockQty);
                if (!add || add < 1) return;
                setRestocking(true);
                try {
                  const res = await fetch(`/api/listings/${id}/restock`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                    body: JSON.stringify({ add }),
                  });
                  if (!res.ok) throw new Error();
                  const data = await res.json();
                  toast({ title: `✅ Stock mete ajou: ${data.stockQuantity} disponib` });
                  queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(id) });
                  queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getGetUserListingsQueryKey((listing as any).sellerId) });
                  setRestockOpen(false);
                } catch {
                  toast({ title: "Erè restock", variant: "destructive" });
                } finally {
                  setRestocking(false);
                }
              }}
              data-testid="button-restock-confirm"
            >
              {restocking ? "Ap sovgade…" : `Ajoute ${restockQty} nan stock`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              {t("listing.confirmDelete", { defaultValue: "Delete listing?" })}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            {t("listing.confirmDeleteMsg", { defaultValue: "This action cannot be undone. Your listing will be permanently removed." })}
          </p>
          <DialogFooter className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteConfirmOpen(false)} disabled={deleteListing.isPending}>
              {t("buttons.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button variant="destructive" className="flex-1" onClick={handleDelete} disabled={deleteListing.isPending} data-testid="button-delete-confirm">
              {deleteListing.isPending ? "..." : t("buttons.delete", { defaultValue: "Delete" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={removeVideoConfirmOpen} onOpenChange={setRemoveVideoConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Film className="h-5 w-5" />
              {t("listing.confirmRemoveVideo", { defaultValue: "Remove video?" })}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            {t("listing.confirmRemoveVideoMsg", { defaultValue: "The promo video will be permanently removed from this listing." })}
          </p>
          <DialogFooter className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setRemoveVideoConfirmOpen(false)} disabled={removeVideoLoading}>
              {t("buttons.cancel", { defaultValue: "Cancel" })}
            </Button>
            <Button variant="destructive" className="flex-1" onClick={handleRemoveVideo} disabled={removeVideoLoading} data-testid="button-remove-video-confirm">
              {removeVideoLoading ? "..." : t("listing.removeVideo", { defaultValue: "Remove Video" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={offerOpen} onOpenChange={v => { setOfferOpen(v); if (!v) { setOfferSent(false); setOfferAmount(""); setOfferMsg(""); } }}>
        <DialogContent>
          {offerSent ? (
            <>
              <DialogHeader><DialogTitle>{t("offer.offerSent")}</DialogTitle></DialogHeader>
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <CheckCircle2 className="h-14 w-14 text-green-500" />
                <p className="text-lg font-bold text-foreground">{t("offer.offerSent")}</p>
                <p className="text-sm text-muted-foreground">{t("offer.sellerWillRespond")}</p>
              </div>
              <DialogFooter className="flex gap-2">
                <Button variant="outline" onClick={() => { setOfferOpen(false); setOfferSent(false); setOfferAmount(""); setOfferMsg(""); }}>
                  {t("buttons.close")}
                </Button>
                <Link href="/offers">
                  <Button onClick={() => setOfferOpen(false)}>
                    {t("offer.viewOffers")}
                  </Button>
                </Link>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader><DialogTitle>{t("offer.makeOffer")}</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm text-muted-foreground">{t("offer.listedPrice")}: <strong>{formatPrice(listing.price, country, (listing as any).currency)}</strong></p>
                    <p className="text-xs text-muted-foreground">{t("offer.minimumOffer")}</p>
                  </div>
                  <Input
                    type="number"
                    min="1"
                    step="any"
                    placeholder={t("offer.yourOffer")}
                    value={offerAmount}
                    onChange={e => setOfferAmount(e.target.value)}
                    data-testid="input-offer-amount"
                  />
                </div>
                <Textarea
                  placeholder={t("offer.messageOptional")}
                  value={offerMsg}
                  onChange={e => setOfferMsg(e.target.value)}
                  rows={3}
                  data-testid="input-offer-message"
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOfferOpen(false)}>{t("buttons.cancel")}</Button>
                <Button onClick={handleOffer} disabled={createOffer.isPending} data-testid="button-send-offer">
                  {createOffer.isPending ? t("buttons.sending") : t("buttons.sendOffer")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Smart Tip Prompt — shown 5 min after purchase if still waiting for driver */}
      {showTipPrompt && purchasedDeliveryId && !tipPromptSent && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowTipPrompt(false)} />
          <div className="relative w-full max-w-sm bg-card rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
            <div className="h-1.5 bg-gradient-to-r from-emerald-400 via-teal-400 to-emerald-500 animate-pulse" />
            <div className="p-5 space-y-4">
              <div className="text-center">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-100 to-teal-100 dark:from-emerald-900/40 dark:to-teal-900/30 flex items-center justify-center mx-auto mb-3">
                  <span className="text-3xl">⚡</span>
                </div>
                <h3 className="text-lg font-black">Chofè yo poko aksepte</h3>
                <p className="text-sm text-muted-foreground mt-1">Ajoute yon tip pou ankouraje plis chofè pran livrezon an pi vit.</p>
              </div>
              <div className="flex gap-2">
                {[1, 2, 3, 5].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={async () => {
                      try {
                        await fetch(`/api/delivery/${purchasedDeliveryId}/tip`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
                          body: JSON.stringify({ tipUsd: amt }),
                        });
                        setTipPromptSent(true);
                        setShowTipPrompt(false);
                        toast({ title: `💰 +$${amt} tip ajoute!`, description: "Chofè yo wè tip ou a epi ap reponn pi vit." });
                      } catch {
                        toast({ title: t("checkout.networkError"), variant: "destructive" });
                      }
                    }}
                    className="flex-1 py-3 rounded-2xl border-2 border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-black text-sm transition-all active:scale-95"
                  >
                    +${amt}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setShowTipPrompt(false)}
                className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
              >
                Pa ajoute tip pou kounya
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Buy Now Dialog */}
      <Dialog open={buyNowOpen} onOpenChange={v => { setBuyNowOpen(v); if (!v) { setPayDone(false); setPayStep("promo"); clearPromo(); setPurchaseResult(null); setTipUsd(0); setDeliverySpeedTier("rapid"); } }}>
        <DialogContent className="max-w-md w-[calc(100%-2rem)] max-h-[88vh] overflow-y-auto p-4 rounded-2xl">
          {payDone ? (
            /* Enhanced Success */
            <div className="text-center py-6 space-y-4">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <span className="text-4xl">✓</span>
              </div>
              <div>
                <h2 className="text-xl font-extrabold">{t("payment.usdtSuccess")}</h2>
                <p className="text-muted-foreground text-sm mt-1">{t("payment.usdtSuccessDesc")}</p>
              </div>
              {/* Savings + Bonus summary */}
              {purchaseResult && (purchaseResult.discountAmount > 0 || purchaseResult.bonusEarned > 0) && (
                <div className="space-y-2 text-left">
                  {purchaseResult.discountAmount > 0 && (
                    <div className="flex items-center gap-3 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-xl px-4 py-3">
                      <Ticket className="h-5 w-5 text-green-600 dark:text-green-400 shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-green-700 dark:text-green-400">Ou ekonomize ${purchaseResult.discountAmount.toFixed(2)}!</p>
                        {purchaseResult.promoCodeApplied && (
                          <p className="text-xs text-green-600 dark:text-green-500">Kòd: {purchaseResult.promoCodeApplied}</p>
                        )}
                      </div>
                    </div>
                  )}
                  {purchaseResult.bonusEarned > 0 && (
                    <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-xl px-4 py-3">
                      <Gift className="h-5 w-5 text-primary shrink-0" />
                      <div>
                        <p className="text-sm font-bold text-primary">+${purchaseResult.bonusEarned.toFixed(2)} kredi bonis!</p>
                        <p className="text-xs text-muted-foreground">Ajoute nan pòtfèy FLEXA MARKET ou</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <Button className="w-full" onClick={() => { setBuyNowOpen(false); setPayDone(false); setPayStep("select"); clearPromo(); setPurchaseResult(null); }}>{t("buttons.done")}</Button>
            </div>
          ) : (
            <>
              {/* ── 4-step checkout wizard header ── */}
              {(["promo","address","delivery","select"] as const).includes(payStep as "promo"|"address"|"delivery"|"select") && (
                <div className="pb-2">
                  <div className="flex items-center">
                    {([
                      { step: "promo",    num: 1, label: t("listing.checkoutStepPromo") },
                      { step: "address",  num: 2, label: t("listing.checkoutStepAddress") },
                      { step: "delivery", num: 3, label: t("listing.checkoutStepDelivery") },
                      { step: "select",   num: 4, label: t("listing.checkoutStepPayment") },
                    ] as const).map((s, i) => {
                      const ord: Record<string,number> = { promo: 1, address: 2, delivery: 3, select: 4 };
                      const cur = ord[payStep] ?? 0;
                      const done = s.num < cur; const active = s.num === cur;
                      return (
                        <div key={s.step} className="flex items-center flex-1">
                          <div className="flex flex-col items-center gap-0.5 shrink-0">
                            <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all",
                              done ? "bg-primary text-white" : active ? "bg-primary text-white ring-2 ring-primary/30 ring-offset-1" : "bg-muted text-muted-foreground")}>
                              {done ? "✓" : s.num}
                            </div>
                            <span className={cn("text-[8px] font-bold text-center leading-tight w-10",
                              active ? "text-primary" : done ? "text-foreground/70" : "text-muted-foreground")}>{s.label}</span>
                          </div>
                          {i < 3 && <div className={cn("flex-1 h-0.5 mb-3 mx-0.5 transition-all", done ? "bg-primary" : "bg-muted")} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ══ STEP 1: KAT PROMO ══ */}
              {payStep === "promo" && (
                <div className="space-y-3">
                  <DialogHeader className="px-0 pb-0">
                    <DialogTitle className="flex items-center gap-2 text-base"><span>🎟</span> Kat Promo</DialogTitle>
                  </DialogHeader>
                  <div className="rounded-lg border border-dashed border-primary/30 bg-primary/5 p-3 space-y-2">
                    <p className="text-sm font-bold">Èske ou gen yon kòd promo?</p>
                    {promoValidation ? (
                      <div className="flex items-center gap-2 bg-green-50 dark:bg-green-950/30 border border-green-300 dark:border-green-700 rounded-lg px-3 py-2">
                        <Ticket className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-green-700 dark:text-green-400">{promoValidation.code} — économize ${promoValidation.discountAmount.toFixed(2)}</p>
                        </div>
                        <button onClick={clearPromo} className="text-xs text-muted-foreground hover:text-foreground shrink-0 p-1">✕</button>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex gap-2">
                          <div className="relative flex-1 min-w-0">
                            <Ticket className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                            <Input placeholder="Eg. FLEXA10, SAVE20..." value={promoCode}
                              onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoError(null); }}
                              onKeyDown={e => e.key === "Enter" && validatePromoCode()}
                              className="pl-8 text-sm font-mono h-9" data-testid="input-promo-code" />
                          </div>
                          <Button size="sm" onClick={validatePromoCode} disabled={!promoCode.trim() || promoValidating} className="shrink-0 h-9 px-3" data-testid="button-apply-promo">
                            {promoValidating ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : "Aplike"}
                          </Button>
                        </div>
                        {promoError && <p className="text-xs text-destructive">{promoError}</p>}
                      </div>
                    )}
                  </div>
                  {!promoValidation && (
                    <div className="space-y-1.5">
                      <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Promo ki disponib pou ou</p>
                      {[
                        { code: "FLEXA10", badge: "10% RABÈ", desc: "10% sou kòmand >$50", color: "orange" as const },
                        { code: "LIVRES",  badge: "$5 RABÈ",  desc: "$5 sou frè livrezon", color: "green" as const },
                        { code: "NEWUSER", badge: "15% RABÈ", desc: "15% — nouvo itilizatè sèlman", color: "blue" as const },
                      ].map(p => (
                        <button key={p.code} type="button" onClick={() => { setPromoCode(p.code); setPromoError(null); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg border border-border hover:border-primary hover:bg-primary/5 transition-all text-left">
                          <div className={cn("px-1.5 py-0.5 rounded text-[9px] font-black shrink-0 whitespace-nowrap",
                            p.color === "orange" ? "bg-orange-100 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400" :
                            p.color === "green"  ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" :
                                                   "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400"
                          )}>{p.badge}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold">{p.code}</p>
                            <p className="text-[10px] text-muted-foreground truncate">{p.desc}</p>
                          </div>
                          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        </button>
                      ))}
                      <p className="text-[10px] text-muted-foreground px-0.5">⚠️ Yon kòd promo ka itilize yon sèl fwa sèlman.</p>
                    </div>
                  )}
                  <div className="rounded-lg border border-amber-200 dark:border-amber-700/50 bg-amber-50/50 dark:bg-amber-950/20 px-2.5 py-2 flex items-center gap-2">
                    <span className="text-sm shrink-0">🚚</span>
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 flex-1 leading-snug">Frè livrezon <strong>obligatwa</strong> pral ajoute nan etap Livrezon.</p>
                  </div>
                  <div className="rounded-lg border border-border bg-card px-3 py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] text-muted-foreground">Pri pwodwi (livrezon pa enkli)</p>
                      <p className="text-base font-black">${(effectiveListingPriceUsd - (promoValidation?.discountAmount ?? 0)).toFixed(2)}
                        {promoValidation && <span className="text-sm font-normal text-green-600 dark:text-green-400 ml-1">(-${promoValidation.discountAmount.toFixed(2)})</span>}
                      </p>
                      {offerPriceOverride !== null && (
                        <p className="text-[10px] text-green-600 dark:text-green-400 font-semibold mt-0.5">✅ Pri ofè ou a</p>
                      )}
                    </div>
                    <Button size="sm" className="font-bold shrink-0 h-9" onClick={() => setPayStep("address")}>Kontinye <ChevronRight className="h-4 w-4 ml-1" /></Button>
                  </div>
                  <button onClick={() => setBuyNowOpen(false)} className="w-full text-center text-xs text-muted-foreground hover:text-foreground py-1">{t("buttons.cancel")}</button>
                </div>
              )}

              {/* ══ STEP 2: ADRÈS ══ */}
              {payStep === "address" && (
                <div className="space-y-0">
                  <DialogHeader className="px-0 pb-3">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setPayStep("promo")} className="p-1.5 rounded-lg hover:bg-muted shrink-0 transition-colors"><ChevronLeft className="h-5 w-5" /></button>
                      <DialogTitle className="text-base font-bold">Adrès livrezon</DialogTitle>
                    </div>
                  </DialogHeader>

                  <div className="space-y-4">
                    {/* ── Contact Info ── */}
                    <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-4 pt-3 pb-2">Enfòmasyon kontak</p>

                      {/* Full Name */}
                      <div className="px-4 py-3">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Non konplè <span className="text-destructive">*</span></label>
                        <input
                          type="text"
                          value={shipName}
                          onChange={e => setShipName(e.target.value)}
                          placeholder="ex: Jean Pierre"
                          data-testid="input-ship-name"
                          className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground/50 text-foreground"
                        />
                      </div>

                      {/* Phone */}
                      <div className="px-4 py-3">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Telefòn <span className="text-destructive">*</span></label>
                        <input
                          type="tel"
                          value={shipPhone}
                          onChange={e => setShipPhone(e.target.value)}
                          placeholder="ex: +509 1234-5678"
                          data-testid="input-ship-phone"
                          className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground/50 text-foreground"
                        />
                      </div>

                      {/* Email */}
                      <div className="px-4 py-3">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Imèl <span className="text-muted-foreground font-normal">(opsyonèl)</span></label>
                        <input
                          type="email"
                          value={shipEmail}
                          onChange={e => setShipEmail(e.target.value)}
                          placeholder="ex: jean@gmail.com"
                          data-testid="input-ship-email"
                          className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground/50 text-foreground"
                        />
                      </div>
                    </div>

                    {/* ── Delivery Address ── */}
                    <div className="rounded-2xl border border-border bg-card overflow-hidden divide-y divide-border">
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-4 pt-3 pb-2">Adrès livrezon</p>

                      {/* Street — with autocomplete */}
                      <div className="relative px-4 py-3">
                        <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">
                          Adrès lari <span className="text-destructive">*</span>
                          {suggestLoading && <span className="ml-2 text-[10px] text-primary font-normal normal-case">Ap chèche…</span>}
                        </label>
                        <input
                          type="text"
                          value={shipStreet}
                          onChange={e => handleStreetChange(e.target.value)}
                          onFocus={() => streetSuggestions.length > 0 && setShowSuggestions(true)}
                          onBlur={() => setTimeout(() => setShowSuggestions(false), 180)}
                          placeholder="ex: 12 Rue des Miracles"
                          data-testid="input-ship-street"
                          className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground/50 text-foreground"
                          autoComplete="off"
                        />
                        {/* Dropdown suggestions */}
                        {showSuggestions && streetSuggestions.length > 0 && (
                          <div className="absolute left-0 right-0 top-full z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden mt-1 mx-1">
                            {streetSuggestions.map((s, i) => {
                              const parts = s.display_name.split(",");
                              const main = parts.slice(0, 2).join(",").trim();
                              const sub  = parts.slice(2, 4).join(",").trim();
                              return (
                                <button key={i} type="button"
                                  onMouseDown={() => applySuggestion(s)}
                                  className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted text-left transition-colors border-b border-border/60 last:border-0">
                                  <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                  <div className="min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate">{main}</p>
                                    {sub && <p className="text-xs text-muted-foreground truncate">{sub}</p>}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* City + Region */}
                      <div className="grid grid-cols-2 divide-x divide-border">
                        <div className="px-4 py-3">
                          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Vil <span className="text-destructive">*</span></label>
                          <input
                            type="text"
                            value={shipCity}
                            onChange={e => setShipCity(e.target.value)}
                            placeholder="ex: Pòtoprens"
                            data-testid="input-ship-city"
                            className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground/50 text-foreground"
                          />
                        </div>
                        <div className="px-4 py-3">
                          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Depatman / Eta <span className="text-destructive">*</span></label>
                          <input
                            type="text"
                            value={shipRegion}
                            onChange={e => setShipRegion(e.target.value)}
                            placeholder="ex: Ouest"
                            data-testid="input-ship-region"
                            className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground/50 text-foreground"
                          />
                        </div>
                      </div>

                      {/* ZIP — international only */}
                      {!isLocalDelivery && (
                        <div className="px-4 py-3">
                          <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1">Kòd postal / ZIP <span className="text-muted-foreground font-normal">(opsyonèl)</span></label>
                          <input
                            type="text"
                            value={shipZip}
                            onChange={e => setShipZip(e.target.value)}
                            placeholder="ex: 10001"
                            data-testid="input-ship-zip"
                            className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-muted-foreground/50 text-foreground"
                          />
                        </div>
                      )}
                    </div>

                    {/* ── CTA ── */}
                    <Button className="w-full h-12 font-bold text-base rounded-xl" data-testid="button-shipping-continue"
                      onClick={() => {
                        if (shipName.trim().length < 2) { toast({ title: t("checkout.enterFullName") }); return; }
                        if (shipPhone.replace(/\D/g, "").length < 6) { toast({ title: t("checkout.enterPhone") }); return; }
                        if (shipStreet.trim().length < 3) { toast({ title: t("checkout.enterStreet") }); return; }
                        if (shipCity.trim().length < 2) { toast({ title: t("checkout.enterCity"), description: t("checkout.deliveryRequired") }); return; }
                        if (shipRegion.trim().length < 2) { toast({ title: t("checkout.enterRegion") }); return; }
                        if (shipEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shipEmail.trim())) { toast({ title: t("checkout.invalidEmail") }); return; }
                        setPayStep("delivery");
                      }}>
                      {t("buttons.confirm")} <ChevronRight className="h-5 w-5 ml-1" />
                    </Button>
                    <button onClick={() => setBuyNowOpen(false)} className="w-full text-center text-sm text-muted-foreground hover:text-foreground py-1">{t("buttons.cancel")}</button>
                  </div>
                </div>
              )}

              {/* ══ STEP 3: LIVREZON + TIP ══ */}
              {payStep === "delivery" && (
                <div className="space-y-3">
                  <DialogHeader className="px-0 pb-0">
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setPayStep("address")} className="p-1 rounded-lg hover:bg-muted shrink-0"><ChevronLeft className="h-5 w-5" /></button>
                      <DialogTitle>{t("listing.deliveryHeader")}</DialogTitle>
                    </div>
                  </DialogHeader>
                  {/* Delivery tier picker */}
                  {isLocalDelivery ? (
                    <div className="rounded-xl border border-border bg-muted/10 overflow-hidden">
                      <p className="text-[11px] font-black uppercase tracking-wider text-muted-foreground px-3 pt-2.5 pb-1.5">🚚 {t("listing.deliveryOptions")}</p>
                      {([
                        { key: "regular" as const, labelKey: "listing.deliveryStandard", subKey: "listing.deliveryStandardSub", emoji: "🚛", fixedFee: 10 },
                        { key: "rapid"   as const, labelKey: "listing.deliveryRapid",    subKey: "listing.deliveryRapidSub",    emoji: "⚡", fixedFee: 15, popular: true },
                        { key: "express" as const, labelKey: "listing.deliveryExpress",  subKey: "listing.deliveryExpressSub",  emoji: "🚀", fixedFee: 25 },
                        { key: "pickup"  as const, labelKey: "listing.deliveryPickup",   subKey: "listing.deliveryPickupSub",   emoji: "🏪", fixedFee: 0,  free: true },
                        { key: "custom"  as const, labelKey: "listing.deliveryCustom",   subKey: "listing.deliveryCustomSub",   emoji: "✏️", fixedFee: 0 },
                      ]).map((opt, idx) => {
                        const finalFee = (opt.key === "pickup" || opt.key === "custom") ? 0 : opt.fixedFee;
                        const selected = deliverySpeedTier === opt.key;
                        return (
                          <button key={opt.key} type="button" onClick={() => setDeliverySpeedTier(opt.key)}
                            className={cn("w-full flex items-center gap-3 px-3 py-3 text-left transition-all",
                              idx > 0 && "border-t border-border/60",
                              selected ? "bg-primary/8 dark:bg-primary/10" : "hover:bg-muted/40")}>
                            <div className={cn("w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center transition-all",
                              selected ? "border-primary" : "border-muted-foreground/40")}>
                              {selected && <div className="w-2 h-2 rounded-full bg-primary" />}
                            </div>
                            <span className="text-base shrink-0">{opt.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className={cn("text-sm font-semibold", selected && "text-primary")}>
                                  {opt.key === "custom" ? "Propoze pri ou" : t(opt.labelKey)}
                                </span>
                                {(opt as any).popular && <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded-md bg-primary text-white">{t("listing.deliveryPopular")}</span>}
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {opt.key === "custom" ? "Antre yon pri livrezon ou menm" : t(opt.subKey)}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              {opt.free ? (
                                <span className="text-sm font-bold text-green-600 dark:text-green-400">{t("listing.deliveryFree")}</span>
                              ) : opt.key === "custom" ? (
                                <span className="text-xs text-muted-foreground italic">✏️</span>
                              ) : (
                                <span className={cn("text-sm font-bold", selected ? "text-primary" : "text-foreground")}>${finalFee.toFixed(2)}</span>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Shipping carrier</p>
                      <div className="flex flex-wrap gap-2">
                        {((listing as any)?.shippingCarriers?.length ? (listing as any).shippingCarriers : ["UPS", "FedEx", "DHL", "USPS", "Other"]).map((c: string) => (
                          <button key={c} type="button" onClick={() => setSelectedCarrier(c)}
                            className={cn("px-3 py-1.5 rounded-lg border-2 text-sm font-medium transition-all",
                              selectedCarrier === c ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-muted-foreground"
                            )} data-testid={`button-carrier-${c.toLowerCase()}`}>{c}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Custom delivery price input */}
                  {isLocalDelivery && deliverySpeedTier === "custom" && (
                    <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-3 space-y-2">
                      <p className="text-xs font-bold text-primary flex items-center gap-1.5">✏️ Propoze yon pri livrezon</p>
                      <p className="text-[11px] text-muted-foreground">Chwazi yon pri ou vle oswa antre youn oumenm. Chofè ap resevwa 85%.</p>
                      {/* Quick-pick buttons */}
                      <div className="flex gap-2">
                        {[10, 15, 25].map(amt => (
                          <button
                            key={amt}
                            type="button"
                            onClick={() => { setCustomDeliveryInput(String(amt)); setDeliveryFeeUsd(amt); }}
                            className={cn(
                              "flex-1 h-9 rounded-lg border-2 text-sm font-bold transition-all",
                              deliveryFeeUsd === amt
                                ? "border-primary bg-primary text-white"
                                : "border-primary/30 text-primary hover:bg-primary/10",
                            )}
                          >
                            ${amt}
                          </button>
                        ))}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="1"
                          value={customDeliveryInput}
                          onChange={e => {
                            setCustomDeliveryInput(e.target.value);
                            const v = parseFloat(e.target.value);
                            setDeliveryFeeUsd(!isNaN(v) && v >= 0 ? parseFloat(v.toFixed(2)) : 0);
                          }}
                          className="w-full h-10 pl-7 pr-3 rounded-xl border-2 border-primary/30 focus:border-primary bg-background text-sm font-mono focus:outline-none"
                          placeholder="Antre yon lòt pri..."
                        />
                      </div>
                    </div>
                  )}
                  {deliveryFeeIsEstimate && effectiveDeliveryFee > 0 && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-500 px-1">⚠️ Pri estime — chofè ka ajiste selon distans reyèl</p>
                  )}
                  {/* Driver tip — local only, not for pickup or custom */}
                  {isLocalDelivery && deliverySpeedTier !== "pickup" && deliverySpeedTier !== "custom" && baseFeeUsd > 0 && (
                    <div className="rounded-xl border border-rose-200 dark:border-rose-800/50 bg-gradient-to-br from-rose-50/70 to-pink-50/40 dark:from-rose-950/20 dark:to-pink-950/10 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold flex items-center gap-1">💝 Ankouraje chofè a ak yon tip <span className="text-[10px] font-normal text-muted-foreground">(opsyonèl)</span></p>
                          <p className="text-[10px] text-muted-foreground">100% ale jwenn chofè ou dirèkteman</p>
                        </div>
                        {tipUsd > 0 && <span className="text-sm font-black text-rose-500 dark:text-rose-400">+${tipUsd.toFixed(2)}</span>}
                      </div>
                      <div className="flex gap-1.5">
                        {[1, 2, 5, 10].map(amt => (
                          <button key={amt} type="button"
                            onClick={() => { setTipUsd(amt); setShowCustomTip(false); setCustomTipInput(""); }}
                            className={cn("flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all duration-150 active:scale-95",
                              tipUsd === amt && !showCustomTip
                                ? "border-rose-400 bg-rose-400/15 text-rose-700 dark:text-rose-400 shadow-sm"
                                : "border-border bg-background hover:border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                            )}>${amt}</button>
                        ))}
                        <button type="button" onClick={() => { setShowCustomTip(true); setTipUsd(0); }}
                          className={cn("flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all duration-150 active:scale-95",
                            showCustomTip ? "border-rose-400 bg-rose-400/15 text-rose-700 dark:text-rose-400" : "border-border bg-background hover:border-rose-300"
                          )}>Lòt</button>
                      </div>
                      {showCustomTip && (
                        <div className="flex gap-2 items-center animate-in slide-in-from-top-1 duration-150">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-foreground">$</span>
                            <input type="number" inputMode="decimal" min="0.5" max="50" step="0.5" placeholder="0.00"
                              value={customTipInput} onChange={e => setCustomTipInput(e.target.value)}
                              className="w-full border-2 border-rose-300 dark:border-rose-700 focus:border-rose-500 rounded-xl pl-7 pr-3 py-2 text-sm font-bold bg-background focus:outline-none" autoFocus />
                          </div>
                          <button type="button"
                            onClick={() => { const v = parseFloat(customTipInput); if (!isNaN(v) && v >= 0.5 && v <= 50) setTipUsd(parseFloat(v.toFixed(2))); }}
                            className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-500 text-white hover:bg-rose-600 active:scale-95 transition-all">OK</button>
                        </div>
                      )}
                      <p className="text-[10px] text-muted-foreground italic text-center">
                        {tipUsd >= 5 ? "🌟 Mèsi paske w ap sipòte chofè lokal yo!" : tipUsd > 0 ? "💚 Chofè yo livre pi rapid lè yo resevwa bon tip." : "✨ Tip ou ede amelyore sèvis livrezon an."}
                      </p>
                    </div>
                  )}
                  {isLocalDelivery && listingCity && baseFeeUsd === 0 && !deliveryFeeLoading && deliverySpeedTier !== "pickup" && deliverySpeedTier !== "custom" && (
                    <div className="flex items-center gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-700/50 rounded-xl px-3 py-2.5">
                      <span className="text-lg shrink-0">🚚</span>
                      <p className="text-[11px] text-amber-700 dark:text-amber-400">
                        {shipCity.trim().length < 2 ? "Retounen sou etap Adrès pou antre vil ou." : "Vil ou pa jwenn. Verifye epi eseye ankò."}
                        {" "}Livrezon pa gratis — chofè yo ap touche nan kont FM yo.
                      </p>
                    </div>
                  )}
                  {/* Live price summary */}
                  <div className="rounded-xl border border-border bg-card p-3.5 space-y-2">
                    <p className="text-[11px] font-black uppercase tracking-wide text-muted-foreground">Rezime pri</p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">🛍 Pri pwodwi</span>
                        <span className="font-semibold">${effectiveListingPriceUsd.toFixed(2)}</span>
                      </div>
                      {(promoValidation?.discountAmount ?? 0) > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">🎟 Rabè ({promoValidation!.code})</span>
                          <span className="font-semibold text-green-600 dark:text-green-400">−${promoValidation!.discountAmount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">🚚 Livrezon{deliverySpeedTier !== "pickup" && deliverySpeedTier !== "custom" && ` (${deliverySpeedTier === "rapid" ? "Rapid" : deliverySpeedTier === "express" ? "Express" : "Standard"})`}{deliverySpeedTier === "custom" && " (Pwopoze)"}</span>
                        {deliverySpeedTier === "pickup" ? (
                          <span className="font-semibold text-green-600 dark:text-green-400">Gratis</span>
                        ) : deliverySpeedTier === "custom" ? (
                          deliveryFeeUsd > 0
                            ? <span className="font-semibold text-blue-600 dark:text-blue-400">+${deliveryFeeUsd.toFixed(2)}</span>
                            : <span className="text-muted-foreground text-xs italic">Antre pri…</span>
                        ) : deliveryFeeLoading ? (
                          <span className="text-muted-foreground text-xs italic">Kalkil...</span>
                        ) : effectiveDeliveryFee > 0 ? (
                          <span className="font-semibold text-blue-600 dark:text-blue-400">+${effectiveDeliveryFee.toFixed(2)}</span>
                        ) : (
                          <span className="text-amber-500 text-xs">⚠️ vil ?</span>
                        )}
                      </div>
                      {effectiveTip > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">💝 Tip chofè</span>
                          <span className="font-semibold text-rose-500">+${effectiveTip.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                    <div className="border-t border-border pt-2 flex items-center justify-between">
                      <span className="font-black text-sm">💰 Total aktyèl</span>
                      <span className="text-xl font-black text-primary">
                        {(deliverySpeedTier !== "pickup" && deliverySpeedTier !== "custom" && isLocalDelivery && effectiveDeliveryFee === 0 && !deliveryFeeLoading)
                          ? `$${(effectiveListingPriceUsd - (promoValidation?.discountAmount ?? 0)).toFixed(2)} + liv.`
                          : `$${(effectiveListingPriceUsd - (promoValidation?.discountAmount ?? 0) + effectiveDeliveryFee + effectiveTip).toFixed(2)}`}
                      </span>
                    </div>
                  </div>
                  <Button className="w-full font-bold"
                    disabled={deliveryFeeLoading || (isLocalDelivery && deliverySpeedTier !== "pickup" && deliverySpeedTier !== "custom" && deliveryFeeUsd === 0) || (isLocalDelivery && deliverySpeedTier === "custom" && deliveryFeeUsd === 0) || (!isLocalDelivery && !selectedCarrier)}
                    onClick={() => setPayStep("select")}>
                    {deliveryFeeLoading ? "Kalkil frè livrezon..." : <>Kontinye <ChevronRight className="h-4 w-4 ml-1" /></>}
                  </Button>
                  <button onClick={() => setBuyNowOpen(false)} className="w-full text-center text-sm text-muted-foreground hover:text-foreground">{t("buttons.cancel")}</button>
                </div>
              )}

              {/* ══ STEP 4: PEMAN ══ */}
              {payStep === "select" && (
                <>
                  <DialogHeader className="px-0 pb-1">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPayStep("delivery")} className="p-1 rounded hover:bg-muted" data-testid="button-back-shipping"><ChevronLeft className="h-4 w-4" /></button>
                      <DialogTitle>{t("payment.title")} · {formatPrice(effectiveListingPrice, country, (listing as any).currency)}</DialogTitle>
                    </div>
                  </DialogHeader>
                  <p className="text-sm text-muted-foreground">{listing.title}</p>
                  {quote && (
                    <div className="mt-2">
                      <CommissionBreakdown quote={quote} audience="buyer" showDeliveryRow={isLocalDelivery}
                        tipUsd={effectiveTip}
                        deliveryTierName={isLocalDelivery ? (deliverySpeedTier === "pickup" ? "Pickup" : deliverySpeedTier === "express" ? "Express" : deliverySpeedTier === "rapid" ? "Rapid" : "Standard") : undefined} />
                    </div>
                  )}
                  <div className="space-y-3 mt-3">
                    {/* ── Kat FM (FIRST) ── */}
                    {user && (
                      <button onClick={handleWalletPayment}
                        disabled={walletPayLoading || walletTotal < (effectiveListingPriceUsd - (promoValidation?.discountAmount ?? 0) + effectiveDeliveryFee + effectiveTip) - 0.001}
                        className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-violet-400 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/20 hover:border-violet-500 hover:bg-violet-100 dark:hover:bg-violet-950/40 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        data-testid="button-pay-wallet">
                        <div className="w-10 h-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                          {walletPayLoading ? <div className="h-5 w-5 border-2 border-violet-600 border-t-transparent rounded-full animate-spin" /> : <span className="text-lg">💳</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-semibold">Kat FM</p>
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-violet-200 dark:bg-violet-900/60 text-violet-700 dark:text-violet-300 uppercase tracking-wide">Otomatik ⚡</span>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            {walletData ? `Balans: $${walletReal.toFixed(2)}${walletPromo > 0 ? ` + $${walletPromo.toFixed(2)} promo` : ""} = $${walletTotal.toFixed(2)}` : "Chaje balans…"}
                          </p>
                          <p className="text-[10px] text-violet-600 dark:text-violet-400 mt-0.5">Dédwi dirèkteman — pa bezwen antre nimewo</p>
                          {walletTotal < (effectiveListingPriceUsd - (promoValidation?.discountAmount ?? 0) + effectiveDeliveryFee + effectiveTip) - 0.001 && walletData && (
                            <p className="text-xs text-destructive mt-0.5">
                              Balans pa ase — ou bezwen ${(effectiveListingPriceUsd - (promoValidation?.discountAmount ?? 0) + effectiveDeliveryFee + effectiveTip).toFixed(2)}
                              {effectiveDeliveryFee > 0 ? ` (atik $${(effectiveListingPriceUsd - (promoValidation?.discountAmount ?? 0)).toFixed(2)} + liv. $${effectiveDeliveryFee.toFixed(2)})` : ""}
                            </p>
                          )}
                        </div>
                      </button>
                    )}
                    {/* ── Card / Stripe (SECOND) ── */}
                    <button onClick={handleStripeCheckout} disabled={stripeLoading}
                      className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed"
                      data-testid="button-pay-card">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                        {stripeLoading ? <div className="h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /> : <CreditCard className="h-5 w-5 text-blue-600" />}
                      </div>
                      <div>
                        <p className="font-semibold">{stripeLoading ? "Redirecting to Stripe…" : t("payment.cardPayment")}</p>
                        <p className="text-xs text-muted-foreground">{t("payment.cardSubtitle")}</p>
                      </div>
                    </button>

                    {/* ── BNPL Section — Buy Now Pay Later ── */}
                    {(() => {
                      const totalAmt = quote?.buyerTotal ?? effectiveListingPriceUsd;
                      const inst4 = (totalAmt / 4).toFixed(2);
                      const anyBnplEnabled = bnplSettings && (bnplSettings.klarnaEnabled || bnplSettings.affirmEnabled || bnplSettings.afterpayEnabled);
                      if (!anyBnplEnabled) return null;
                      return (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 my-1">
                            <div className="flex-1 h-px bg-border" />
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-1">Peye Vèsman · BNPL</span>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                          {/* Eligibility badge */}
                          {bnplEligible === false && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                              <span className="text-amber-600 text-sm">⚠️</span>
                              <p className="text-xs text-amber-800 dark:text-amber-300">Kont ou pa satisfè kritè BNPL yo — li bezwen 90+ jou aktivite. Ou ka toujou eseye peman dirèk.</p>
                            </div>
                          )}
                          {bnplEligible === true && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                              <span className="text-green-600 text-sm">✅</span>
                              <p className="text-xs text-green-800 dark:text-green-300 font-semibold">Flexa Credit Eligible — ou ka peye vèsman san enterè!</p>
                            </div>
                          )}
                          {/* Klarna */}
                          {bnplSettings?.klarnaEnabled && (
                            <button onClick={() => handleBnplCheckout("klarna")}
                              disabled={!!bnplLoading || bnplEligible === false}
                              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-pink-200 dark:border-pink-900 bg-pink-50 dark:bg-pink-950/20 hover:border-pink-400 hover:bg-pink-100 dark:hover:bg-pink-950/40 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                              data-testid="button-pay-klarna">
                              <div className="w-10 h-10 rounded-lg bg-pink-100 dark:bg-pink-900/40 flex items-center justify-center flex-shrink-0 font-black text-pink-700 text-base">K</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-pink-800 dark:text-pink-300">Klarna</p>
                                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-pink-200 dark:bg-pink-900/60 text-pink-700 dark:text-pink-300 uppercase tracking-wide">0% enterè</span>
                                </div>
                                <p className="text-xs text-muted-foreground">Peye ${inst4} jodi a, epi 3 × ${inst4} chak 2 semèn</p>
                                <p className="text-[10px] text-pink-600 dark:text-pink-400 mt-0.5">Total: ${totalAmt.toFixed(2)} · 4 peman egal</p>
                              </div>
                              {bnplLoading === "klarna" && <div className="h-5 w-5 border-2 border-pink-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                            </button>
                          )}
                          {/* Afterpay */}
                          {bnplSettings?.afterpayEnabled && (
                            <button onClick={() => handleBnplCheckout("afterpay_clearpay")}
                              disabled={!!bnplLoading || bnplEligible === false}
                              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-teal-200 dark:border-teal-900 bg-teal-50 dark:bg-teal-950/20 hover:border-teal-400 hover:bg-teal-100 dark:hover:bg-teal-950/40 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                              data-testid="button-pay-afterpay">
                              <div className="w-10 h-10 rounded-lg bg-teal-100 dark:bg-teal-900/40 flex items-center justify-center flex-shrink-0 font-black text-teal-700 text-base">A</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-teal-800 dark:text-teal-300">Afterpay</p>
                                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-teal-200 dark:bg-teal-900/60 text-teal-700 dark:text-teal-300 uppercase tracking-wide">4 peman</span>
                                </div>
                                <p className="text-xs text-muted-foreground">Peye ${inst4} jodi a, epi 3 × ${inst4} chak 2 semèn</p>
                                <p className="text-[10px] text-teal-600 dark:text-teal-400 mt-0.5">Clearpay disponib nan UK/AU/CA</p>
                              </div>
                              {bnplLoading === "afterpay_clearpay" && <div className="h-5 w-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                            </button>
                          )}
                          {/* Affirm */}
                          {bnplSettings?.affirmEnabled && (
                            <button onClick={() => handleBnplCheckout("affirm")}
                              disabled={!!bnplLoading || bnplEligible === false}
                              className="w-full flex items-center gap-4 p-4 rounded-xl border-2 border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/20 hover:border-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-950/40 transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
                              data-testid="button-pay-affirm">
                              <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0 font-black text-indigo-700 text-sm">Aff</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-indigo-800 dark:text-indigo-300">Affirm</p>
                                  <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-indigo-200 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">Mensyèl</span>
                                </div>
                                <p className="text-xs text-muted-foreground">Divize ${totalAmt.toFixed(2)} an peman mensyèl fleksib</p>
                                <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-0.5">Peman anyèl · disponib US sèlman</p>
                              </div>
                              {bnplLoading === "affirm" && <div className="h-5 w-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />}
                            </button>
                          )}
                        </div>
                      );
                    })()}

                    <button onClick={() => usdtWalletAddress.trim() ? setPayStep("usdt") : undefined}
                      disabled={!usdtWalletAddress.trim()}
                      className={cn("w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left", usdtWalletAddress.trim() ? "border-border hover:border-primary hover:bg-primary/5" : "border-border opacity-50 cursor-not-allowed")}
                      data-testid="button-pay-usdt">
                      <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-green-500 dark:text-green-400 font-black text-sm">₮</span>
                      </div>
                      <div>
                        <p className="font-semibold">{t("payment.usdtPayment")}</p>
                        <p className="text-xs text-muted-foreground">{usdtWalletAddress.trim() ? t("payment.usdtSubtitle") : "Currently unavailable — choose another method"}</p>
                      </div>
                    </button>
                  </div>
                  <button onClick={() => setBuyNowOpen(false)} className="w-full text-center text-sm text-muted-foreground mt-2 hover:text-foreground">{t("buttons.cancel")}</button>
                </>
              )}

              {/* ══ USDT ══ */}
              {payStep === "usdt" && (
                <>
                  <DialogHeader>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPayStep("select")} className="p-1 rounded hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
                      <DialogTitle>{t("payment.usdtPayment")}</DialogTitle>
                    </div>
                  </DialogHeader>
                  <div className="space-y-4 mt-1">
                    <div className="text-center">
                      <p className="text-3xl font-black text-primary">{effectiveListingPriceUsd.toFixed(2)} USDT</p>
                      <p className="text-xs text-muted-foreground mt-1">TRC-20 Network (TRON)</p>
                    </div>
                    {quote && <CommissionBreakdown quote={quote} audience="buyer" />}
                    {usdtWalletAddress.trim() ? (
                      <div className="bg-muted rounded-xl p-4 space-y-2">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("payment.walletAddress")}</p>
                        <p className="font-mono text-xs break-all select-all bg-background border border-border rounded-lg px-3 py-2">{usdtWalletAddress}</p>
                        <button onClick={() => { navigator.clipboard.writeText(usdtWalletAddress); toast({ title: t("payment.walletCopied") }); }} className="text-xs text-primary hover:underline" data-testid="button-copy-wallet">{t("payment.copyAddress")}</button>
                      </div>
                    ) : (
                      <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-3 flex items-center gap-2">
                        <span className="text-destructive text-lg">⚠</span>
                        <p className="text-sm text-destructive">USDT payments are currently unavailable. Please choose another payment method.</p>
                      </div>
                    )}
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                      <p className="text-xs text-amber-800 dark:text-amber-300">⚠️ {t("payment.usdtWarning", { amount: effectiveListingPriceUsd.toFixed(2) })}</p>
                    </div>
                    <Input placeholder="Paste your USDT transaction hash (TRC-20)" value={usdtTxHash} onChange={e => setUsdtTxHash(e.target.value)} data-testid="input-usdt-hash" />
                    <Button className="w-full font-bold" onClick={handleConfirmUsdt} disabled={payLoading || !usdtWalletAddress.trim()} data-testid="button-confirm-usdt">
                      {payLoading ? "Verifying…" : t("payment.iSentPayment")}
                    </Button>
                  </div>
                </>
              )}

              {/* ══ MONCASH / NATCASH ══ */}
              {(payStep === "moncash" || payStep === "natcash") && (
                <>
                  <DialogHeader>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setPayStep("select")} className="p-1 rounded hover:bg-muted" data-testid="button-back-mobile-money"><ChevronLeft className="h-4 w-4" /></button>
                      <DialogTitle>{payStep === "moncash" ? t("payment.moncashPayment") : t("payment.natcashPayment")}</DialogTitle>
                    </div>
                  </DialogHeader>
                  <div className="space-y-4 mt-1">
                    <div className="text-center">
                      <p className="text-3xl font-black text-primary">{formatPrice(effectiveListingPrice, country, (listing as any).currency)}</p>
                      <p className="text-xs text-muted-foreground mt-1">{payStep === "moncash" ? t("payment.moncashSubtitle") : t("payment.natcashSubtitle")}</p>
                    </div>
                    {quote && <CommissionBreakdown quote={quote} audience="buyer" />}
                    <div className="bg-muted rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{t("payment.sendToNumber")}</p>
                        {payStep === "moncash" && moncashIsDirectToSeller && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400">
                            <BadgeCheck className="h-3 w-3" /> Dirèk nan men vendè
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-base font-bold text-foreground select-all bg-background border border-border rounded-lg px-3 py-2 text-center">
                        {payStep === "moncash" ? MONCASH_NUMBER : NATCASH_NUMBER}
                      </p>
                      {payStep === "moncash" && moncashIsDirectToSeller && (
                        <p className="text-[11px] text-green-700 dark:text-green-400 text-center">📱 Nimewo MonCash vendè a verifye — voye lajan dirèkteman ba li</p>
                      )}
                      <button onClick={() => { const num = payStep === "moncash" ? MONCASH_NUMBER : NATCASH_NUMBER; navigator.clipboard.writeText(num); toast({ title: t("payment.numberCopied") }); }}
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1" data-testid="button-copy-mobile-number">
                        <Copy className="h-3 w-3" /> {t("payment.copyNumber")}
                      </button>
                    </div>
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                      <p className="text-xs text-amber-800 dark:text-amber-300">💡 {t("payment.mobileMoneyHint")}</p>
                    </div>
                    <Input placeholder={t("payment.transactionId")} value={mobileMoneyTxId} onChange={e => setMobileMoneyTxId(e.target.value)} data-testid="input-mobile-money-txid" />
                    <Button className="w-full font-bold"
                      onClick={() => handleConfirmMobileMoney(payStep === "moncash" ? "moncash" : "natcash")}
                      disabled={payLoading}
                      data-testid={payStep === "moncash" ? "button-confirm-moncash" : "button-confirm-natcash"}>
                      {payLoading ? t("payment.processing") : t("payment.iSentMobileMoney")}
                    </Button>
                  </div>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Leave a Review dialog ── */}
      <Dialog open={reviewOpen} onOpenChange={v => { setReviewOpen(v); if (!v) { setReviewRating(0); setReviewComment(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("review.title", { defaultValue: "Rate this Seller" })}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              {t("review.subtitle", { defaultValue: "Share your experience with this seller" })}
            </p>
            {/* Star picker */}
            <div className="flex justify-center gap-2">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setReviewRating(star)}
                  onMouseEnter={() => setReviewHover(star)}
                  onMouseLeave={() => setReviewHover(0)}
                  className="transition-transform hover:scale-110"
                  data-testid={`star-${star}`}
                  aria-label={`${star} star`}
                >
                  <Star
                    className={`h-9 w-9 transition-colors ${
                      star <= (reviewHover || reviewRating)
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>
            {reviewRating > 0 && (
              <p className="text-center text-sm font-semibold text-amber-600 dark:text-amber-400">
                {["", "⭐ Très mauvais", "⭐⭐ Mauvais", "⭐⭐⭐ Moyen", "⭐⭐⭐⭐ Bien", "⭐⭐⭐⭐⭐ Excellent"][reviewRating]}
              </p>
            )}
            <Textarea
              placeholder={t("review.commentPlaceholder", { defaultValue: "Share your experience (optional)…" })}
              value={reviewComment}
              onChange={e => setReviewComment(e.target.value)}
              rows={3}
              data-testid="input-review-comment"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewOpen(false)} disabled={reviewLoading}>
              {t("buttons.cancel")}
            </Button>
            <Button onClick={handleSubmitReview} disabled={reviewLoading || reviewRating === 0} data-testid="button-submit-review">
              {reviewLoading ? t("review.submitting", { defaultValue: "Sending…" }) : t("review.submit", { defaultValue: "Submit Review" })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
