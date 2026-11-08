import { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { useSEO } from "@/hooks/useSEO";
import { useRoute, useLocation, Link } from "wouter";
import { Heart, MapPin, Star, MessageCircle, Tag, Zap, ArrowLeft, ChevronLeft, ChevronRight, Pencil, Trash2, Globe, Phone, CreditCard, Banknote, BadgeCheck, Share2, Copy, CheckCircle2, Shield, Gift, Ticket, Play, Film, Volume2, VolumeX, ShoppingCart, Truck, Users, Search, AlertTriangle, Send, ImageIcon, MoreHorizontal, Maximize2, Headphones } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useGetListing, useGetListings, useAddFavorite, useRemoveFavorite, useCreateConversation, useCreateOffer, useDeleteListing, getGetListingQueryKey, getGetFavoritesQueryKey, getGetListingsQueryKey, getGetFeaturedListingsQueryKey, getGetUserListingsQueryKey } from "@workspace/api-client-react";
import ListingCard from "@/components/ListingCard";
import { useAuth } from "@/contexts/auth";
import { useCart } from "@/contexts/cart";
import { useAuthRequired } from "@/components/auth/AuthRequiredModal";
import { useShoppingLocation } from "@/contexts/shopping-location";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import CommentsSection from "@/components/CommentsSection";
import CommissionBreakdown, { type Quote } from "@/components/CommissionBreakdown";
import ShareMenu from "@/components/ShareMenu";
import { useTranslation } from "react-i18next";
import { useViewTracker, formatViewCount } from "@/hooks/useViewTracker";
import { formatPrice, useExchangeRate, htgToUsd, dopToUsd } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { isAndroidApp } from "@/lib/androidPurchasePolicy";
import { readSavedCheckoutAddress, saveCheckoutAddress } from "@/lib/savedCheckoutAddress";

import { listingCarriersForCountry } from "@/lib/listingCarriers";
import { listingImageProps } from "@/lib/listingImage";
import {
  CheckoutOutlineButton,
  CheckoutPrimaryButton,
  CheckoutStepper,
  GlassCard,
  PaymentSuccessPanel,
  ProcessingPaymentPanel,
  PromoHero,
  RadioDot,
} from "@/components/checkout/CheckoutPrimitives";
import { CheckoutProductBackdrop } from "@/components/checkout/CheckoutProductBackdrop";

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
  const { requireAuth } = useAuthRequired();
  const { country: shoppingCountry } = useShoppingLocation();
  const { addItem, removeItem, isInCart, updateQuantity, items: cartItems } = useCart();
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
  const [adminActioning, setAdminActioning] = useState<"approve" | "reject" | "delete" | null>(null);
  const [adminConfirmAction, setAdminConfirmAction] = useState<"reject" | "delete" | null>(null);
  const [adminReason, setAdminReason] = useState("");
  const [offerOpen, setOfferOpen] = useState(false);
  const [offerAmount, setOfferAmount] = useState("");
  const [offerMsg, setOfferMsg] = useState("");
  const [offerSent, setOfferSent] = useState(false);
  const [buyNowOpen, setBuyNowOpen] = useState(false);
  // Offer price override — set when arriving from Offers page with an accepted offer
  const [offerPriceOverride, setOfferPriceOverride] = useState<number | null>(null);
  const [offerIdForPurchase, setOfferIdForPurchase] = useState<number | null>(null);
  const [payStep, setPayStep] = useState<"promo" | "address" | "delivery" | "select" | "review" | "processing" | "usdt" | "moncash" | "natcash" | "wallet" | "friend">("promo");
  const [selectedPayMethod, setSelectedPayMethod] = useState<"stripe" | "wallet" | "klarna" | "afterpay_clearpay" | "affirm" | "usdt" | "friend" | null>(null);
  const [addressEditMode, setAddressEditMode] = useState(false);
  const [lastPaidMethod, setLastPaidMethod] = useState<string>("Stripe");
  const [lastTransactionId, setLastTransactionId] = useState<string>("");
  const [walletPayLoading, setWalletPayLoading] = useState(false);
  const [friendQuery, setFriendQuery] = useState("");
  const [friendSearching, setFriendSearching] = useState(false);
  const [friendResults, setFriendResults] = useState<Array<{id: number; name: string; avatar: string|null; country: string|null}>>([]);
  const [friendRecipient, setFriendRecipient] = useState<{id: number; name: string; avatar: string|null} | null>(null);
  const [friendConfirmOpen, setFriendConfirmOpen] = useState(false);
  const [friendSending, setFriendSending] = useState(false);
  const [friendRequestSent, setFriendRequestSent] = useState(false);
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
  // Must stay above every loading/not-found return. Safari can briefly put the
  // cached listing query back into a loading state during browser back/forward
  // navigation; declaring this hook below that return changes the hook count.
  const [failedMediaUrls, setFailedMediaUrls] = useState<Set<string>>(new Set());
  const [pdpTab, setPdpTab] = useState<"details" | "specs" | "reviews" | "qa">("details");
  const [pdpSearchQ, setPdpSearchQ] = useState("");
  const [galleryFullscreen, setGalleryFullscreen] = useState(false);
  const pdpTabsRef = useRef<HTMLDivElement>(null);
  const pdpTabPanelRef = useRef<HTMLDivElement>(null);

  /** Switch PDP tab and bring the panel into view under the sticky tab bar. */
  const handlePdpTabClick = (tabId: "details" | "specs" | "reviews" | "qa") => {
    setPdpTab(tabId);
    // After the panel swaps, scroll so tabs sit under the green header and
    // the section content is not left under Related Products or clipped.
    requestAnimationFrame(() => {
      const tabsEl = pdpTabsRef.current;
      if (!tabsEl) return;
      const isDesktop = window.matchMedia("(min-width: 768px)").matches;
      const scrollParent = tabsEl.closest(".app-main-scroll") as HTMLElement | null;
      const stickyTop =
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--pdp-tabs-sticky-top")) || 0;
      // Mobile: only .app-main-scroll scrolls (header is outside → sticky top ≈ 0).
      // Desktop: document scrolls with sticky header → offset by measured header height.
      if (scrollParent && !isDesktop) {
        const parentTop = scrollParent.getBoundingClientRect().top;
        const tabsTop = tabsEl.getBoundingClientRect().top;
        const nextTop = scrollParent.scrollTop + (tabsTop - parentTop) - stickyTop;
        scrollParent.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
        return;
      }
      const nextTop = window.scrollY + tabsEl.getBoundingClientRect().top - stickyTop;
      window.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
    });
  };

  // Measure green header height for sticky tab offset (desktop / window scroll).
  // On mobile, content scrolls inside .app-main-scroll below the header → top 0.
  useEffect(() => {
    const updateStickyTop = () => {
      const header = document.querySelector("header.mobile-app-header") as HTMLElement | null;
      const mobileScroll = window.matchMedia("(max-width: 767px)").matches;
      const topPx = mobileScroll ? 0 : Math.round(header?.getBoundingClientRect().height ?? 64);
      document.documentElement.style.setProperty("--pdp-tabs-sticky-top", `${topPx}px`);
    };
    updateStickyTop();
    window.addEventListener("resize", updateStickyTop);
    const header = document.querySelector("header.mobile-app-header");
    const ro = header ? new ResizeObserver(updateStickyTop) : null;
    if (header && ro) ro.observe(header);
    return () => {
      window.removeEventListener("resize", updateStickyTop);
      ro?.disconnect();
      document.documentElement.style.removeProperty("--pdp-tabs-sticky-top");
    };
  }, []);

  // Reset mute state whenever the user swipes to a different media item.
  // Guarantees every boost video starts muted (browsers require muted for autoplay).
  useEffect(() => { setVideoMuted(true); }, [imgIndex]);

  const [promoCode, setPromoCode] = useState("");
  const [promoValidating, setPromoValidating] = useState(false);
  const [promoValidation, setPromoValidation] = useState<{ valid: boolean; code: string; discountAmount: number; finalPrice: number; description: string | null } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [purchaseResult, setPurchaseResult] = useState<{ bonusEarned: number; discountAmount: number; promoCodeApplied: string | null; transactionId?: number | null } | null>(null);

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
  const [blockLoading, setBlockLoading] = useState(false);
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

  const relatedCategory = listing?.categorySlug || listing?.category;
  const relatedCountry = user?.country ?? shoppingCountry;
  const { data: relatedData } = useGetListings(
    {
      category: relatedCategory || undefined,
      limit: 18,
      ...(relatedCountry ? { country: relatedCountry } : {}),
    },
    {
      query: {
        enabled: !!relatedCategory,
        queryKey: getGetListingsQueryKey({
          category: relatedCategory || undefined,
          limit: 18,
          ...(relatedCountry ? { country: relatedCountry } : {}),
        }),
      },
    },
  );
  const relatedListingsAll = (relatedData?.listings ?? []).filter((l: { id: number }) => l.id !== id).slice(0, 18);
  const relatedListings = relatedListingsAll.slice(0, 6);

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

  const createConv = useCreateConversation();
  const createOffer = useCreateOffer();
  const deleteListing = useDeleteListing();

  // Resume Contact Seller after guest auth (?contact=1)
  useEffect(() => {
    if (!listing?.id || !user) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("contact") !== "1") return;
    window.history.replaceState(null, "", `/listings/${id}`);
    createConv.mutate({ data: { listingId: id, sellerId: listing.sellerId } }, {
      onSuccess: (conv) => setLocation(`/messages/${(conv as any).id}`),
      onError: () => toast({ title: "Error", description: "Could not start conversation", variant: "destructive" }),
    });
  }, [listing?.id, user]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open checkout panel when arriving from the video "Achte" CTA (?buy=1)
  useEffect(() => {
    if (!listing?.id) return;
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("buy") !== "1") return;
    // Remove the flag from the URL without a full reload
    window.history.replaceState(null, "", `/listings/${id}`);
    if (!user) {
      if (!isLoading) {
        requireAuth({
          action: "buyNow",
          next: `/listings/${id}`,
          listingId: id,
          sellerId: listing.sellerId,
          title: listing.title,
          price: listing.price,
          currency: (listing as any).currency ?? "USD",
          image: (listing as any).images?.[0] ?? null,
          country: (listing as any).country ?? null,
        });
      }
      return;
    }
    setPayStep("promo");
    setPayDone(false);
    setBuyNowOpen(true);
  }, [listing?.id, user, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!user) {
      if (!isLoading) {
        requireAuth({ action: "buyNow", next: `/listings/${id}`, listingId: id });
      }
      return;
    }
    setOfferIdForPurchase(parsedId);
    setOfferPriceOverride(parsedAmt);
    setPayStep("promo");
    setPayDone(false);
    setBuyNowOpen(true);
  }, [listing?.id, user, isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

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
  const checkoutBackdropItems = useMemo(() => ([
    {
      id: `current-${id}`,
      title: listing?.title,
      image: ((listing as any)?.images?.[0] as string | undefined) ?? null,
      price: listing ? effectiveListingPriceUsd : null,
    },
    ...relatedListingsAll.map((item: any) => ({
      id: item.id,
      title: item.title as string | undefined,
      image: (item.images?.[0] as string | undefined) ?? null,
      price: typeof item.price === "number" ? item.price : null,
    })),
  ].filter((i) => !!i.image)), [id, listing, relatedListingsAll, effectiveListingPriceUsd]);
  useEffect(() => {
    if (!buyNowOpen || !token || !listingIdForQuote) { setQuote(null); return; }
    let cancelled = false;
    const url = `/api/commission/quote?listingId=${listingIdForQuote}`
      + (quoteMethod ? `&method=${quoteMethod}` : "")
      + (deliveryFeeUsd > 0 ? `&deliveryFeeUsd=${deliveryFeeUsd}` : "")
      + (offerIdForPurchase !== null ? `&offerId=${offerIdForPurchase}` : "");
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && d) setQuote({ ...(d as Quote), deliveryFeeUsd: deliveryFeeUsd > 0 ? deliveryFeeUsd : undefined }); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [buyNowOpen, token, listingIdForQuote, quoteMethod, deliveryFeeUsd, offerIdForPurchase]);

  // Auto-calculate delivery fee when buyer enters their city (Haiti/DR only, debounced)
  const listingCity = (listing as any)?.city as string | undefined;
  const listingCountry = (listing as any)?.country as string | undefined;
  const viewerCountry = (user as any)?.country as string | null | undefined;
  // FM delivery is available only when both ends are in the FM service area.
  // Fail closed when the buyer has no country configured: foreign buyers must
  // use an international carrier, even for a listing located in Haiti or DR.
  const isLocalDelivery =
    listingCountry !== "Dominican Republic" &&
    isLocalDeliveryCountry(listingCountry) &&
    isLocalDeliveryCountry(viewerCountry);
  const isDominicanDelivery = listingCountry === "Dominican Republic";
  const isDominicanSellerDelivery = isDominicanDelivery && (listing as any)?.deliveryMethod === "self_delivery";
  const dominicanCarriers: string[] = ((listing as any)?.shippingCarriers ?? [])
    .filter((carrier: string) => listingCarriersForCountry("Dominican Republic").includes(carrier));
  const effectiveTip = (isLocalDelivery && deliverySpeedTier !== "pickup") ? tipUsd : 0;
  useEffect(() => {
    if (!isDominicanDelivery) {
      setSelectedCarrier(previous => previous === "self_delivery" ||
        listingCarriersForCountry("Dominican Republic").includes(previous ?? "") ? null : previous);
      return;
    }
    setDeliverySpeedTier("regular");
    setSelectedCarrier(previous => isDominicanSellerDelivery ? "self_delivery"
      : dominicanCarriers.includes(previous ?? "") ? previous : dominicanCarriers[0] ?? null);
  }, [listing, isDominicanDelivery, isDominicanSellerDelivery]);

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

  // Auto-fill the shipping form from the buyer's registered profile.
  // Only fills fields the buyer hasn't already typed (or restored from a saved
  // draft) — never overwrites their input. Runs once the user object loads.
  useEffect(() => {
    if (!user) return;
    const u = user as { id?: number; name?: string; phone?: string | null; email?: string | null; location?: string | null; state?: string | null; neighborhood?: string | null };
    const address = readSavedCheckoutAddress(u.id);
    if (address.name) setShipName(v => v || address.name!);
    if (address.phone) setShipPhone(v => v || address.phone!);
    if (address.email) setShipEmail(v => v || address.email!);
    if (address.street) setShipStreet(v => v || address.street!);
    if (address.city) setShipCity(v => v || address.city!);
    if (address.region) setShipRegion(v => v || address.region!);
    if (address.zip) setShipZip(v => v || address.zip!);
    if (u.name)  setShipName(v => v || u.name!.trim());
    if (u.phone) setShipPhone(v => v || u.phone!.trim());
    if (u.email) setShipEmail(v => v || u.email!.trim());
    if (u.location || u.neighborhood) setShipCity(v => v || (u.location || u.neighborhood)!.trim());
    if (u.state) setShipRegion(v => v || u.state!.trim());
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  const rememberCheckoutAddress = () => {
    saveCheckoutAddress((user as any)?.id, {
      name: shipName.trim(),
      phone: shipPhone.trim(),
      email: shipEmail.trim() || undefined,
      street: shipStreet.trim(),
      city: shipCity.trim(),
      region: shipRegion.trim(),
      zip: shipZip.trim() || undefined,
    });
  };

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
    if (isDominicanDelivery) {
      const cost = (listing as any)?.shippingCost;
      setDeliveryFeeUsd(typeof cost === "number" && cost >= 0 ? Math.round(cost * 100) / 100 : 0);
      return;
    }
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
  }, [isLocalDelivery, isDominicanDelivery, selectedCarrier, listing]);

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

  // Keep quantity within live stock — null stock means single-item listing (max 1)
  useEffect(() => {
    const raw = (listing as any)?.stockQuantity;
    const max =
      raw == null || Number.isNaN(Number(raw))
        ? 1
        : Math.max(0, Math.min(99, Math.floor(Number(raw))));
    setBuyQty((q) => {
      if (max <= 0) return 1;
      return Math.min(Math.max(1, q), max);
    });
  }, [(listing as any)?.stockQuantity, listing?.id]);

  if (isLoading) {
    // Skeleton mirrors the compact product layout so the page doesn't reflow.
    return (
      <div className="max-w-4xl mx-auto" data-testid="listing-skeleton">
        <Skeleton className="w-full rounded-none" style={{ aspectRatio: "1 / 1", maxHeight: 360 }} />
        <div className="px-4 py-3 space-y-2">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-5 w-4/5" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-36" />
        </div>
        <div className="px-4 space-y-2 pb-4">
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-full rounded-xl" />
        </div>
      </div>
    );
  }
  if (!listing) return <div className="max-w-4xl mx-auto px-4 py-8 text-center text-muted-foreground">{t("tr.listingNotFound")}</div>;

  // Strip external placeholder service URLs that load successfully but show
  // an orange "No Image" image (so onError never fires for them).
  const images = ((listing as any).images ?? []).filter(
    (url: unknown) =>
      typeof url === "string" &&
      url.trim().length > 0 &&
      !url.includes("placehold.co") &&
      !url.includes("via.placeholder.com"),
  );
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
  const currentMedia = mediaItems[imgIndex] ?? null;

  // Track all failed image URLs as a Set so navigating away and back doesn't
  // retry a broken URL from scratch (previously a single string, now a Set).
  const addFailedUrl = (url: string) =>
    setFailedMediaUrls(prev => { const s = new Set(prev); s.add(url); return s; });

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
  const canonicalRole = String(user?.role ?? "").toLowerCase().replace(/[\s-]+/g, "_");
  const isModeratorViewer = canonicalRole === "moderator";
  const isSuperAdminViewer = !!(user as any)?.isSuperAdmin || canonicalRole === "super_admin";
  const isAdminViewer = !!(
    user?.isAdmin ||
    isSuperAdminViewer ||
    isModeratorViewer ||
    canonicalRole === "admin"
  );
  const canAdminBoost = !!(user?.isAdmin || isSuperAdminViewer) && !isModeratorViewer;
  const showMobileMoney = viewerCountry === "Haiti" || isAdminViewer;

  const searchFriendUsers = async () => {
    if (!friendQuery.trim()) return;
    setFriendSearching(true);
    try {
      const res = await fetch(`/api/wallet/p2p/search?q=${encodeURIComponent(friendQuery)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setFriendResults((await res.json()).users ?? []);
    } finally { setFriendSearching(false); }
  };

  const handleFriendPayRequest = async () => {
    if (!friendRecipient || !listing) return;
    setFriendSending(true);
    try {
      await fetch("/api/friend-pay-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ listingId: listing.id, toUserId: friendRecipient.id, amount: effectiveListingPriceUsd }),
      });
    } catch {}
    setFriendConfirmOpen(false);
    setFriendRequestSent(true);
    setFriendSending(false);
  };

  const handleFav = () => {
    if (!user) {
      if (!isLoading) {
        requireAuth({ action: "favorite", next: `/listings/${id}`, listingId: id });
      }
      return null;
    }
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
    if (!user) {
      if (!isLoading) {
        requireAuth({
          action: "contactSeller",
          next: `/listings/${id}`,
          listingId: id,
          sellerId: listing.sellerId,
          title: t("authGate.signInToContact", { defaultValue: "Sign in to contact this seller." }),
        });
      }
      return null;
    }
    createConv.mutate({ data: { listingId: id, sellerId: listing.sellerId } }, {
      onSuccess: (conv) => setLocation(`/messages/${(conv as any).id}`),
      onError: () => toast({ title: "Error", description: "Could not start conversation", variant: "destructive" }),
    });
  };

  const refreshListingAfterAdminAction = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(id) }),
      queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetFeaturedListingsQueryKey() }),
      queryClient.invalidateQueries({ queryKey: getGetUserListingsQueryKey(listing.sellerId) }),
      queryClient.invalidateQueries({ queryKey: getGetFavoritesQueryKey() }),
    ]);
  };

  const handleAdminListingAction = async (action: "approve" | "reject" | "delete", reason = "") => {
    if (action === "reject" && !reason.trim()) {
      toast({ title: t("listing.adminReasonRequired"), variant: "destructive" });
      return;
    }

    setAdminActioning(action);
    try {
      if (action === "approve") {
        await apiFetch(`/api/admin/moderation/${id}/approve`, { method: "POST" });
      } else if (action === "reject") {
        await apiFetch(`/api/admin/moderation/${id}/reject`, {
          method: "POST",
          body: JSON.stringify({ reason: reason.trim() }),
        });
      } else {
        await apiFetch(`/api/listings/${id}`, { method: "DELETE" });
      }
      await refreshListingAfterAdminAction();
      setAdminConfirmAction(null);
      setAdminReason("");
      toast({
        title: action === "approve"
          ? t("listing.adminApproved")
          : action === "reject"
            ? t("listing.adminRejected")
            : t("listing.adminDeleted"),
      });
      if (action === "delete") setLocation(`/profile/${listing.sellerId}`);
    } catch (error: any) {
      toast({
        title: t("listing.adminActionFailed"),
        description: error?.message ?? t("listing.tryAgain"),
        variant: "destructive",
      });
    } finally {
      setAdminActioning(null);
    }
  };

  const handleOffer = () => {
    if (!user) {
      if (!isLoading) {
        requireAuth({ action: "generic", next: `/listings/${id}`, listingId: id });
      }
      return null;
    }
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
    if (!user) { if (!isLoading) setLocation("/auth/login"); return null; }
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

  /** Mobile PDP Back — history when available, otherwise marketplace home. */
  const handlePdpBack = () => {
    try {
      if (typeof window !== "undefined" && window.history.length > 1) {
        window.history.back();
        return;
      }
    } catch {
      /* ignore */
    }
    setLocation("/");
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
    setPayStep("processing");
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
          deliveryMethod: isDominicanDelivery ? selectedCarrier ?? undefined : deliverySpeedTier !== "pickup" && deliveryFeeUsd > 0 ? (isLocalDelivery ? deliveryMethod : (selectedCarrier ?? undefined)) : undefined,
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
        setPayStep("review");
        return;
      }
      const methodLabels: Record<string, string> = {
        wallet: "FM Card",
        card: "Stripe",
        stripe: "Stripe",
        usdt: "USDT",
        moncash: "MonCash",
        natcash: "NatCash",
      };
      setLastPaidMethod(methodLabels[paymentMethod] ?? paymentMethod);
      const txId = data?.transactionId ?? data?.id ?? null;
      setLastTransactionId(txId ? `FM-${txId}` : `FM-${String(Date.now()).slice(-7)}`);
      setPurchaseResult({
        bonusEarned: data?.bonusEarned ?? 0,
        discountAmount: data?.discountAmount ?? 0,
        promoCodeApplied: data?.promoCodeApplied ?? null,
        transactionId: typeof txId === "number" ? txId : null,
      });
      // Flag for smart tip prompt (fires after 5 min if still no driver)
      if (isLocalDelivery && deliveryFeeUsd > 0) {
        setLocalDeliveryPurchased(true);
      }
      setPayDone(true);
      rememberCheckoutAddress();
      // Clear persisted checkout form — purchase succeeded, slate is clean
      try { localStorage.removeItem(formKey); } catch {}
      queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(id) });
    } catch {
      toast({ title: "Network error", description: "Please try again", variant: "destructive" });
      setPayStep("review");
    } finally {
      setPayLoading(false);
    }
  };

  const handleStripeCheckout = async () => {
    if (!token) { setLocation("/auth/login"); return; }
    setStripeLoading(true);
    setPayStep("processing");
    setLastPaidMethod("Stripe");
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
          deliveryMethod: isDominicanDelivery ? selectedCarrier ?? undefined : deliverySpeedTier !== "pickup" && deliveryFeeUsd > 0 ? (isLocalDelivery ? deliveryMethod : (selectedCarrier ?? undefined)) : undefined,
          deliveryPickupCity: deliverySpeedTier !== "pickup" && deliveryFeeUsd > 0 && isLocalDelivery ? listingCity : undefined,
          // Driver tip
          deliveryTipUsd: isLocalDelivery && deliverySpeedTier !== "pickup" && tipUsd > 0 ? tipUsd : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Payment error", description: data?.error || "Could not start checkout", variant: "destructive" });
        setPayStep("review");
        return;
      }
      if (data.url) {
        rememberCheckoutAddress();
        window.location.href = data.url;
      } else {
        toast({ title: "Payment error", description: "No checkout URL received", variant: "destructive" });
        setPayStep("review");
      }
    } catch {
      toast({ title: "Network error", description: "Please try again", variant: "destructive" });
      setPayStep("review");
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
          deliveryMethod: isDominicanDelivery ? selectedCarrier ?? undefined : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: t("checkout.bnplError"), description: data?.error || t("checkout.bnplStart"), variant: "destructive" });
        return;
      }
      if (data.sessionUrl) {
        rememberCheckoutAddress();
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
    const referralFeeForWallet = (quote as any)?.referralFee ?? 0;
    const walletRequired = effectivePrice + effectiveDeliveryFee + effectiveTip + referralFeeForWallet;
    if (walletTotal < walletRequired - 0.001) {
      const desc = effectiveDeliveryFee > 0
        ? `Ou bezwen $${walletRequired.toFixed(2)} (atik + livrezon${effectiveTip > 0 ? ` + $${effectiveTip.toFixed(2)} tip` : ""}${referralFeeForWallet > 0 ? ` + $${referralFeeForWallet.toFixed(2)} referans` : ""}) men ou gen $${walletTotal.toFixed(2)}.`
        : `Ou bezwen $${walletRequired.toFixed(2)} men ou gen $${walletTotal.toFixed(2)} nan wallet ou.`;
      toast({ title: "Balans pa ase", description: desc, variant: "destructive" });
      return;
    }
    setWalletPayLoading(true);
    setLastPaidMethod("FM Card");
    await submitPurchase("wallet", `WALLET-${Date.now()}`);
    setWalletPayLoading(false);
  };

  const checkoutGrandTotal =
    effectiveListingPriceUsd - (promoValidation?.discountAmount ?? 0) + effectiveDeliveryFee + effectiveTip + ((quote as any)?.referralFee ?? 0);

  const confirmSelectedPayment = () => {
    if (selectedPayMethod === "stripe") { void handleStripeCheckout(); return; }
    if (selectedPayMethod === "wallet") { void handleWalletPayment(); return; }
    if (selectedPayMethod === "usdt") { setPayStep("usdt"); return; }
    if (selectedPayMethod === "friend") {
      setFriendQuery(""); setFriendResults([]); setFriendRequestSent(false); setPayStep("friend");
      return;
    }
    if (selectedPayMethod === "klarna" || selectedPayMethod === "afterpay_clearpay" || selectedPayMethod === "affirm") {
      void handleBnplCheckout(selectedPayMethod);
    }
  };

  const addressIsComplete =
    shipName.trim().length >= 2 &&
    shipPhone.replace(/\D/g, "").length >= 6 &&
    shipStreet.trim().length >= 3 &&
    shipCity.trim().length >= 2 &&
    shipRegion.trim().length >= 2;

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

  // null stock = single-item listing (purchase marks sold); otherwise cap at stock
  const rawStock = (listing as any).stockQuantity;
  const maxBuyQty =
    rawStock == null || Number.isNaN(Number(rawStock))
      ? 1
      : Math.max(0, Math.min(99, Math.floor(Number(rawStock))));
  const canPurchaseQty = maxBuyQty > 0 && listing.status === "available";

  const conditionLabels: Record<string, string> = {
    new: t("search.conditionNew"),
    like_new: t("search.conditionLikeNew"),
    good: t("search.conditionGood"),
    fair: t("search.conditionFair"),
    poor: t("search.conditionPoor"),
  };
  const conditionLabel = conditionLabels[listing.condition] ?? listing.condition.replace("_", " ");

  const inStock =
    listing.status === "available"
    && (rawStock == null || maxBuyQty > 0);

  const handleAddToCartClick = () => {
    if (!canPurchaseQty) {
      toast({ title: t("checkout.soldBadge"), variant: "destructive" });
      return;
    }
    const qty = Math.min(Math.max(1, buyQty), Math.max(1, maxBuyQty));
    if (!user) {
      if (!isLoading) {
        requireAuth({
          action: "addToCart",
          next: `/listings/${id}`,
          listingId: id,
          sellerId: listing.sellerId,
          title: listing.title,
          price: listing.price,
          currency: (listing as any).currency ?? "USD",
          image: (listing as any).images?.[0] ?? null,
          country: (listing as any).country ?? null,
          quantity: qty,
        });
      }
      return;
    }
    const inCart = isInCart(id);
    if (inCart) {
      const existingQty = cartItems.find((i) => i.listingId === id)?.quantity ?? 1;
      if (existingQty === qty) {
        removeItem(id);
        toast({ title: t("listing.removeFromCart") });
      } else {
        updateQuantity(id, qty);
        toast({ title: t("listing.inCart"), description: `×${qty}` });
      }
    } else {
      addItem({
        listingId: id,
        title: listing.title,
        price: listing.price,
        currency: (listing as any).currency ?? "USD",
        image: (listing as any).images?.[0] ?? null,
        country: (listing as any).country ?? null,
        sellerId: listing.sellerId,
        quantity: qty,
      });
      toast({ title: `✅ ${t("listing.addedToCart")}`, description: `${listing.title} ×${qty}` });
      if (listing.isBoosted || (listing as any).boostVideoUrl) {
        const source =
          new URLSearchParams(window.location.search).get("ref") ||
          (document.referrer.includes("/videos") ? "promo_feed" : "product_page");
        fetch("/api/boost-analytics/events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            listingId: id,
            type: "add_to_cart",
            source,
            device: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop",
          }),
        }).catch(() => {});
      }
    }
  };

  const handleBuyNowClick = () => {
    if (!canPurchaseQty) {
      toast({ title: t("checkout.soldBadge"), variant: "destructive" });
      return;
    }
    if (!user) {
      if (!isLoading) {
        requireAuth({
          action: "buyNow",
          next: `/listings/${id}`,
          listingId: id,
          sellerId: listing.sellerId,
          title: listing.title,
          price: listing.price,
          currency: (listing as any).currency ?? "USD",
          image: (listing as any).images?.[0] ?? null,
          country: (listing as any).country ?? null,
          quantity: Math.min(Math.max(1, buyQty), Math.max(1, maxBuyQty)),
        });
      }
      return;
    }
    setPayStep("promo"); setPayDone(false); setBuyNowOpen(true);
  };

  const renderThumb = (item: (typeof mediaItems)[number], i: number, sizeClass: string) => (
    <button
      key={i}
      type="button"
      onClick={() => setImgIndex(i)}
      className={cn(
        "relative flex-shrink-0 overflow-hidden border-2 bg-muted transition-all rounded-md",
        sizeClass,
        i === imgIndex ? "border-[#F97316] ring-1 ring-[#F97316]/30" : "border-transparent opacity-75 hover:opacity-100",
      )}
      aria-label={item.type === "video" ? `Video ${i + 1}` : `Image ${i + 1}`}
      aria-current={i === imgIndex}
    >
      {item.type === "video" ? (
        <>
          <video src={item.url} preload="metadata" playsInline muted className="w-full h-full object-cover pointer-events-none" />
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <Play className="h-3 w-3 text-white fill-white" />
          </div>
          {item.isPromo && (
            <div className="absolute bottom-0 inset-x-0 bg-orange-500 text-white text-[7px] font-bold text-center py-0.5">{t("tr.promoBadge")}</div>
          )}
        </>
      ) : failedMediaUrls.has(item.url) ? (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary/15 via-muted to-primary/5">
          <ImageIcon className="h-3.5 w-3.5 text-primary/40" aria-hidden="true" />
        </div>
      ) : (
        <img
          src={item.url}
          alt=""
          className="w-full h-full object-cover"
          onError={() => addFailedUrl(item.url)}
          {...listingImageProps({ variant: "detail" })}
        />
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-white text-foreground fm-pdp-amazon">

      {/* ═══ MOBILE: Amazon-style search + deliver strip (continues green header) ═══ */}
      <div className="md:hidden bg-[hsl(152,65%,18%)] text-white px-3 pb-2.5 pt-1 space-y-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const q = pdpSearchQ.trim();
            setLocation(q ? `/search?q=${encodeURIComponent(q)}` : "/search");
          }}
          className="flex gap-2 items-stretch"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={pdpSearchQ}
              onChange={(e) => setPdpSearchQ(e.target.value)}
              placeholder={t("home.searchPlaceholder", { defaultValue: "Search for products, brands, and more..." })}
              className="pl-9 pr-3 h-11 rounded-lg bg-white border-0 text-sm text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-[#F97316]"
              data-testid="input-search-pdp-mobile"
            />
          </div>
          <Button
            type="submit"
            size="icon"
            className="h-11 w-11 rounded-lg bg-[#F97316] hover:bg-[#ea6a0c] text-white shrink-0"
            data-testid="button-search-pdp-mobile"
            aria-label={t("buttons.search")}
          >
            <Search className="h-5 w-5" />
          </Button>
        </form>
        {((listing as any).city || listing.location || country) && (
          <div className="flex items-center gap-1.5 text-[12px] text-white/95" data-testid="pdp-deliver-to">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {t("home.deliverTo", { defaultValue: "Deliver to" })}{" "}
              <strong>{(listing as any).city ?? listing.location ?? country}</strong>
            </span>
            <ChevronRight className="h-3.5 w-3.5 ml-auto shrink-0 opacity-80" />
          </div>
        )}
      </div>

      {/* Breadcrumbs */}
      <nav
        className="px-3 py-2 text-[12px] text-[#0066c0] bg-white border-b border-border/40 overflow-x-auto scrollbar-none whitespace-nowrap"
        aria-label="Breadcrumb"
        data-testid="pdp-breadcrumbs"
      >
        <Link href="/" className="hover:underline text-[#0066c0]">{t("nav.home")}</Link>
        <span className="mx-1.5 text-muted-foreground">›</span>
        <Link
          href={`/search?category=${encodeURIComponent(listing.categorySlug || listing.category)}`}
          className="hover:underline text-[#0066c0]"
        >
          {listing.category}
        </Link>
        {listing.subcategory && (
          <>
            <span className="mx-1.5 text-muted-foreground">›</span>
            <Link
              href={`/search?category=${encodeURIComponent(listing.categorySlug || listing.category)}&subcategory=${encodeURIComponent(listing.subcategorySlug || listing.subcategory)}`}
              className="hover:underline text-[#0066c0]"
            >
              {listing.subcategory}
            </Link>
          </>
        )}
        <span className="mx-1.5 text-muted-foreground">›</span>
        <span className="text-foreground/80 truncate inline-block max-w-[40vw] lg:max-w-none align-bottom">{listing.title}</span>
      </nav>

      {/* Desktop three-column product stage */}
      <div
        className="lg:max-w-7xl lg:mx-auto lg:px-4 lg:pt-5 lg:pb-2 lg:grid lg:grid-cols-[minmax(280px,1fr)_minmax(300px,1.15fr)_minmax(260px,320px)] lg:gap-6 lg:items-start"
        data-testid="pdp-desktop-stage"
      >

      {/* ══════════ HERO GALLERY — vertical thumbs + main stage ══════════ */}
      <div className="relative bg-white lg:sticky lg:top-28 lg:self-start" data-testid="pdp-gallery">
        <div className="flex gap-2 px-2 pt-3 pb-1 md:px-4 md:pt-4 lg:px-0 lg:pt-0">
          {/* Vertical thumbnail rail */}
          {totalMedia > 1 && (
            <div
              className="flex flex-col gap-1.5 overflow-y-auto max-h-[min(52vh,380px)] md:max-h-[420px] lg:max-h-[480px] pr-0.5 scrollbar-none shrink-0"
              aria-label="Image thumbnails"
            >
              {mediaItems.map((item, i) => renderThumb(item, i, "w-11 h-11 md:w-14 md:h-14"))}
            </div>
          )}

          {/* Main media stage */}
          <div
            ref={heroRef}
            className="relative flex-1 min-w-0 bg-muted/20 overflow-hidden aspect-square sm:aspect-[5/4] md:aspect-[4/3] lg:aspect-square max-h-[min(52vh,380px)] md:max-h-[420px] lg:max-h-[480px] rounded-sm"
            style={{ touchAction: zoom > 1 ? "none" : "pan-y" }}
            onTouchStart={onHeroTouchStart}
            onTouchMove={onHeroTouchMove}
            onTouchEnd={onHeroTouchEnd}
          >
            {currentMedia?.type === "video" ? (
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
                  className="absolute bottom-12 left-3 bg-black/60 backdrop-blur-sm text-white rounded-full p-2 z-10"
                  aria-label={videoMuted ? "Unmute video" : "Mute video"}
                >
                  {videoMuted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            ) : currentMedia && !failedMediaUrls.has(currentMedia.url) ? (
              <img
                src={currentMedia.url}
                alt={listing.title}
                className="w-full h-full object-contain"
                draggable={false}
                onError={() => addFailedUrl(currentMedia.url)}
                {...listingImageProps({ priority: true, variant: "detail" })}
                style={{
                  transform: `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`,
                  transformOrigin: "center center",
                  transition: pinchRef.current || panStartRef.current ? "none" : "transform 0.22s ease",
                  willChange: "transform",
                  userSelect: "none",
                }}
              />
            ) : (
              <div
                className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/15 via-muted to-primary/5"
                role="img"
                aria-label={t("sell.images")}
              >
                <ImageIcon className="h-14 w-14 text-primary/45" aria-hidden="true" />
              </div>
            )}

            {/* Mobile Back — top left of media (does not replace header hamburger) */}
            <button
              type="button"
              onClick={handlePdpBack}
              aria-label={t("common.back", { defaultValue: "Back" })}
              data-testid="button-pdp-back"
              className="lg:hidden absolute top-2 left-2 z-20 w-9 h-9 rounded-full bg-white border border-border/70 shadow-sm flex items-center justify-center active:scale-90 transition-transform"
            >
              <ArrowLeft className="h-4 w-4 text-[hsl(152,65%,18%)]" strokeWidth={2.5} aria-hidden="true" />
            </button>

            {/* Share + Favorite — top right of media */}
            <div className="absolute top-2 right-2 z-20 flex flex-col gap-2">
              <button
                onClick={handleShare}
                aria-label="Share listing"
                data-testid="button-share-listing"
                className="w-9 h-9 rounded-full bg-white border border-border/70 shadow-sm flex items-center justify-center active:scale-90 transition-transform"
              >
                <Share2 className="h-4 w-4 text-foreground" aria-hidden="true" />
              </button>
              <button
                onClick={handleFav}
                aria-label={isFav ? "Remove favorite" : "Add to favorites"}
                data-testid="button-favorite"
                className={cn(
                  "w-9 h-9 rounded-full border shadow-sm flex items-center justify-center active:scale-90 transition-all",
                  isFav ? "bg-red-500 border-red-500" : "bg-white border-border/70",
                )}
              >
                <Heart className={cn("h-4 w-4", isFav ? "text-white fill-white" : "text-foreground")} aria-hidden="true" />
              </button>
            </div>

            {/* Desktop nav arrows */}
            {totalMedia > 1 && (
              <>
                <button
                  onClick={() => setImgIndex(i => (i - 1 + totalMedia) % totalMedia)}
                  aria-label="Previous image"
                  className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white border border-border shadow-sm text-foreground rounded-full p-2 z-10 transition-colors"
                  data-testid="button-img-prev"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                <button
                  onClick={() => setImgIndex(i => (i + 1) % totalMedia)}
                  aria-label="Next image"
                  className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white border border-border shadow-sm text-foreground rounded-full p-2 z-10 transition-colors"
                  data-testid="button-img-next"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </>
            )}

            {listing.isBoosted && (
              <div className="absolute top-2 left-2 z-10 bg-[hsl(152,65%,22%)] text-white text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-sm flex items-center gap-1 shadow-sm">
                <Zap className="h-3 w-3" aria-hidden="true" /> {t("listing.featured")}
              </div>
            )}

            {currentMedia?.isPromo && (
              <div className="absolute bottom-10 left-2 z-10 bg-orange-500 text-white text-[10px] uppercase tracking-wider font-bold px-2 py-1 rounded-sm flex items-center gap-1 shadow-sm">
                <Film className="h-3 w-3" aria-hidden="true" /> {t("tr.promoVideo")}
              </div>
            )}

            {/* Desktop hover-to-zoom */}
            {currentMedia?.type !== "video" && (
              <div
                className="hidden lg:block absolute inset-0 z-[5] cursor-zoom-in"
                onMouseMove={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const x = ((e.clientX - rect.left) / rect.width - 0.5) * -80;
                  const y = ((e.clientY - rect.top) / rect.height - 0.5) * -80;
                  setZoom(2.2);
                  setPanX(x);
                  setPanY(y);
                }}
                onMouseLeave={() => { setZoom(1); setPanX(0); setPanY(0); }}
                onDoubleClick={() => setGalleryFullscreen(true)}
                aria-hidden
              />
            )}
          </div>
        </div>

        {/* Dots + counter + zoom/expand hints */}
        <div className="flex items-center justify-between gap-3 px-3 py-2 lg:px-0">
          {totalMedia > 1 ? (
            <div className="flex items-center gap-3" aria-hidden="true">
              <div className="flex gap-1.5 items-center">
                {mediaItems.map((item, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setImgIndex(i)}
                    className={cn(
                      "rounded-full transition-all",
                      i === imgIndex
                        ? item.type === "video" ? "bg-[#F97316] w-2 h-2" : "bg-foreground w-2 h-2"
                        : "bg-muted-foreground/35 w-1.5 h-1.5",
                    )}
                    aria-label={`Go to media ${i + 1}`}
                  />
                ))}
              </div>
              <span className="text-[12px] text-muted-foreground tabular-nums font-medium">
                {imgIndex + 1} / {totalMedia}
              </span>
            </div>
          ) : <span />}
          <div className="hidden lg:flex items-center gap-3 text-[12px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Search className="h-3.5 w-3.5" />
              {t("listing.hoverToZoom", { defaultValue: "Hover to zoom" })}
            </span>
            <button
              type="button"
              onClick={() => setGalleryFullscreen(true)}
              className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
              data-testid="button-gallery-fullscreen"
              aria-label={t("listing.fullscreen", { defaultValue: "Fullscreen" })}
            >
              <Maximize2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* ══════════ CENTER: PRODUCT INFO ══════════ */}
      <div className="min-w-0">

        {/* ── TITLE + RATING + PRICE ── */}
        <div className="px-4 py-3 space-y-2.5 border-b border-border/60 lg:border-0 lg:px-0 lg:pt-0">
          <h1 className="text-[17px] md:text-[22px] lg:text-[24px] font-bold text-foreground leading-snug tracking-tight" data-testid="pdp-title">
            {listing.title}
          </h1>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px]">
            <button
              type="button"
              onClick={() => setLocation(`/profile/${listing.sellerId}`)}
              className="text-[#0066c0] hover:underline font-medium"
              data-testid="button-view-seller"
            >
              {t("listing.soldBy")} {listing.sellerName}
              {listing.sellerIsVerified && <BadgeCheck className="inline h-3.5 w-3.5 ml-1 fill-blue-500 text-white align-text-bottom" />}
            </button>
            <button
              type="button"
              onClick={() => handlePdpTabClick("reviews")}
              className="flex items-center gap-1 text-[#0066c0] hover:underline"
              data-testid="pdp-rating-link"
            >
              <span className="flex items-center gap-0.5" aria-hidden>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Star
                    key={n}
                    className={cn(
                      "h-3.5 w-3.5",
                      n <= Math.round(listing.sellerRating)
                        ? "fill-amber-400 text-amber-400"
                        : "fill-muted text-muted-foreground/40",
                    )}
                  />
                ))}
              </span>
              <span className="tabular-nums font-medium">{listing.sellerRating.toFixed(1)}</span>
            </button>
            {listing.isBoosted && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold bg-[#F97316] text-white px-2 py-0.5 rounded-sm">
                <Zap className="h-3 w-3" /> {t("listing.featured")}
              </span>
            )}
          </div>

          {/* Price — real promo savings only */}
          <div className="flex items-baseline gap-2.5 flex-wrap pt-0.5">
            <span
              className={cn(
                "text-[28px] font-bold tabular-nums leading-none",
                promoValidation?.valid ? "text-[hsl(152,65%,22%)]" : "text-foreground",
              )}
              data-testid="pdp-price"
            >
              {promoValidation?.valid
                ? `$${promoValidation.finalPrice.toFixed(2)}`
                : formatPrice(listing.price, country, (listing as any).currency)}
            </span>
            {promoValidation?.valid && promoValidation.discountAmount > 0 && (
              <>
                <span className="text-sm line-through text-muted-foreground tabular-nums">
                  ${effectiveListingPriceUsd.toFixed(2)}
                </span>
                <span className="text-[11px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full">
                  −${promoValidation.discountAmount.toFixed(2)} {t("checkout.discount")}
                </span>
              </>
            )}
          </div>

          {/* Availability — real stock / status only */}
          <div className="space-y-1.5 pt-1">
            {listing.status === "sold" || ((listing as any).stockQuantity != null && (listing as any).stockQuantity <= 0) ? (
              <p className="text-[14px] font-bold text-red-600">{t("checkout.soldBadge")}</p>
            ) : (listing as any).stockQuantity != null && (listing as any).stockQuantity <= 5 ? (
              <p className="text-[14px] font-bold text-red-600">
                {t("checkout.almostGoneWithCount", { count: (listing as any).stockQuantity })}
              </p>
            ) : inStock ? (
              <p className="text-[14px] font-bold text-[hsl(152,65%,28%)]" data-testid="pdp-in-stock">
                {t("listing.inStock", { defaultValue: "In Stock" })}
                <span className="font-semibold text-foreground/70"> · {conditionLabel}</span>
              </p>
            ) : null}

            <div className="flex items-start gap-2 text-[13px] text-foreground">
              <Truck className="h-4 w-4 mt-0.5 text-foreground shrink-0" aria-hidden />
              <div>
                <p
                  className="font-semibold leading-snug"
                  dangerouslySetInnerHTML={{
                    __html: t("listing.standardFreeShipping")
                      .replace("FREE", `<strong class="text-[hsl(152,65%,28%)]">FREE</strong>`)
                      .replace("GRATUIT", `<strong class="text-[hsl(152,65%,28%)]">GRATUIT</strong>`)
                      .replace("GRATIS", `<strong class="text-[hsl(152,65%,28%)]">GRATIS</strong>`),
                  }}
                />
                <p className="text-[12px] text-muted-foreground mt-0.5">
                  {t("listing.freeShippingQty", { count: buyQty })}
                </p>
              </div>
            </div>

            {/* Real product attributes only — no invented variants */}
            {((listing as any).itemSize || rawStock != null) && (
              <div className="flex flex-wrap gap-2 pt-1">
                {(listing as any).itemSize && (
                  <span className="inline-flex items-center px-3 py-1.5 rounded-lg border-2 border-[#F97316] text-[13px] font-semibold bg-orange-50/50">
                    {t("listing.size", { defaultValue: "Size" })}: {(listing as any).itemSize}
                  </span>
                )}
                {rawStock != null && (
                  <span className="inline-flex items-center px-3 py-1.5 rounded-lg border border-border text-[13px] font-medium text-muted-foreground">
                    {t("listing.stockCurrent", { count: maxBuyQty })}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* BNPL teaser */}
          {bnplSettings && (bnplSettings.affirmEnabled || bnplSettings.klarnaEnabled) && (
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={handleBuyNowClick}
            >
              <span>{t("tr.payToday")} <strong className="text-foreground">${(effectiveListingPriceUsd / 3).toFixed(2)}</strong> {t("tr.payTodayWith")}</span>
              {bnplSettings.affirmEnabled && <span className="font-black text-[#00d647]">Affirm</span>}
              {bnplSettings.klarnaEnabled && <><span>&</span><span className="font-black text-[#ff69a2]">Klarna</span></>}
              <ChevronRight className="h-3 w-3" />
            </button>
          )}

          {/* Promo code */}
          <div className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-dashed border-border bg-muted/30 text-xs">
            <Gift className="h-3.5 w-3.5 text-[#F97316] flex-shrink-0" />
            <input
              value={promoCode}
              onChange={e => setPromoCode(e.target.value.toUpperCase())}
              placeholder={t("cart.promoPlaceholder")}
              className="flex-1 bg-transparent outline-none text-foreground min-w-0 placeholder:text-muted-foreground"
            />
            {promoCode.length >= 3 && (
              <button onClick={validatePromoCode} disabled={promoValidating} className="text-[#F97316] font-black flex-shrink-0 disabled:opacity-50">
                {promoValidating ? "…" : "Aplike"}
              </button>
            )}
          </div>
          {promoValidation?.valid && (
            <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-green-50 border border-green-200 text-xs font-bold text-green-700">
              <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0" />
              ${promoValidation.discountAmount.toFixed(2)} reduksyon aplike · Total: ${promoValidation.finalPrice.toFixed(2)}
            </div>
          )}
          {promoError && <p className="text-xs text-red-500">{promoError}</p>}
        </div>

        {/* ── QUANTITY (mobile / tablet) — Add/Buy stay in the fixed bottom bar ── */}
        {!isOwner && listing.status === "available" && (
          <div className="px-4 py-3 space-y-3 border-b border-border/60 lg:hidden">
            <label className="block">
              <span className="sr-only">{t("listing.quantity", { defaultValue: "Quantity" })}</span>
              <div className="relative">
                <select
                  value={buyQty}
                  onChange={(e) => setBuyQty(Number(e.target.value))}
                  disabled={!canPurchaseQty}
                  className="w-full appearance-none h-11 rounded-lg bg-muted/60 border border-border px-3 pr-10 text-[14px] font-semibold text-foreground focus:outline-none focus:ring-2 focus:ring-[#F97316]/40 disabled:opacity-50"
                  data-testid="pdp-quantity-select"
                >
                  {Array.from({ length: Math.max(1, maxBuyQty) }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {t("listing.quantity", { defaultValue: "Quantity" })}: {n}
                    </option>
                  ))}
                </select>
                <ChevronRight className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 rotate-90 text-muted-foreground" />
              </div>
            </label>
            {rawStock != null && (
              <p className="text-[12px] text-muted-foreground tabular-nums">
                {t("listing.stockCurrent", { count: maxBuyQty })} · {conditionLabel}
                {(listing as any).weightLbs != null && <> · {(listing as any).weightLbs} lbs</>}
              </p>
            )}
          </div>
        )}
      </div>{/* end center column */}

      {/* ══════════ RIGHT: DESKTOP PURCHASE PANEL ══════════ */}
      <aside
        className="hidden lg:block sticky top-28 self-start"
        data-testid="pdp-purchase-panel"
      >
        <div className="rounded-xl border border-border bg-white shadow-sm p-5 space-y-3.5">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="text-[28px] font-bold tabular-nums tracking-tight">
              {promoValidation?.valid
                ? `$${promoValidation.finalPrice.toFixed(2)}`
                : formatPrice(listing.price, country, (listing as any).currency)}
            </span>
            {promoValidation?.valid && promoValidation.discountAmount > 0 && (
              <>
                <span className="text-sm line-through text-muted-foreground tabular-nums">
                  ${effectiveListingPriceUsd.toFixed(2)}
                </span>
                <span className="text-[11px] font-bold bg-red-600 text-white px-2 py-0.5 rounded-full">
                  −${promoValidation.discountAmount.toFixed(2)}
                </span>
              </>
            )}
          </div>

          <div className="flex items-start gap-2 text-[13px]">
            <Truck className="h-4 w-4 mt-0.5 shrink-0 text-[hsl(152,65%,28%)]" />
            <div>
              <p
                className="leading-snug font-semibold"
                dangerouslySetInnerHTML={{
                  __html: t("listing.standardFreeShipping")
                    .replace("FREE", `<strong class="text-[hsl(152,65%,28%)]">FREE</strong>`)
                    .replace("GRATUIT", `<strong class="text-[hsl(152,65%,28%)]">GRATUIT</strong>`)
                    .replace("GRATIS", `<strong class="text-[hsl(152,65%,28%)]">GRATIS</strong>`),
                }}
              />
              {(user?.location || user?.country) && (
                <p className="text-[12px] text-[#0066c0] mt-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {t("home.deliverTo", { defaultValue: "Deliver to" })} {user?.location || user?.country}
                </p>
              )}
            </div>
          </div>

          {inStock ? (
            <p className="text-[14px] font-bold text-[hsl(152,65%,28%)]">
              {t("listing.inStock", { defaultValue: "In Stock" })}
            </p>
          ) : (
            <p className="text-[14px] font-bold text-red-600">{t("checkout.soldBadge")}</p>
          )}

          {!isOwner && listing.status === "available" && (
            <>
              <label className="block">
                <select
                  value={buyQty}
                  onChange={(e) => setBuyQty(Number(e.target.value))}
                  disabled={!canPurchaseQty}
                  className="w-full appearance-none h-11 rounded-lg bg-muted/70 border border-border px-3 text-[14px] font-semibold focus:outline-none focus:ring-2 focus:ring-[#F97316]/40"
                  data-testid="pdp-quantity-select-desktop"
                >
                  {Array.from({ length: Math.max(1, maxBuyQty) }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {t("listing.quantity", { defaultValue: "Quantity" })}: {n}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={handleAddToCartClick}
                disabled={!canPurchaseQty}
                data-testid="button-add-to-cart-desktop"
                className={cn(
                  "w-full h-11 rounded-full font-bold text-[14px] flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-sm",
                  isInCart(id)
                    ? "bg-[hsl(152,65%,22%)] text-white"
                    : "bg-[#FFD814] hover:bg-[#F7CA00] text-foreground",
                )}
              >
                <ShoppingCart className="h-4 w-4" />
                {isInCart(id) ? t("listing.inCart") : t("listing.addToCart")}
              </button>
              <button
                type="button"
                onClick={handleBuyNowClick}
                disabled={!canPurchaseQty}
                data-testid="button-buy-now-desktop"
                className="w-full h-11 rounded-full font-bold text-[14px] text-white bg-[#F97316] hover:bg-[#ea6a0c] flex items-center justify-center transition-all disabled:opacity-50 shadow-sm"
              >
                {t("buttons.buyNow")}
              </button>
            </>
          )}

          {!isOwner && (
            <button
              type="button"
              onClick={handleChat}
              disabled={createConv.isPending}
              data-testid="button-chat-seller-desktop"
              className="w-full h-10 rounded-full border-2 border-[hsl(152,65%,28%)] text-[hsl(152,65%,28%)] text-[13px] font-bold flex items-center justify-center gap-2 hover:bg-emerald-50 transition-colors disabled:opacity-50"
            >
              <MessageCircle className="h-4 w-4" />
              {createConv.isPending ? t("buttons.openingChat") : t("buttons.messageSeller")}
            </button>
          )}

          <div className="pt-1 space-y-1.5 text-[12px] text-muted-foreground">
            <p>
              {t("listing.soldBy")}{" "}
              <button type="button" onClick={() => setLocation(`/profile/${listing.sellerId}`)} className="text-[#0066c0] font-semibold hover:underline">
                {listing.sellerName}
              </button>
            </p>
            {country && (
              <p className="flex items-center gap-1.5 text-foreground/80">
                <CheckCircle2 className="h-3.5 w-3.5 text-[hsl(152,65%,28%)] shrink-0" />
                {t("tr.returnDays", { count: getReturnDays(country) })}
              </p>
            )}
            <p className="flex items-center gap-1.5 text-foreground/80">
              <Shield className="h-3.5 w-3.5 text-[hsl(152,65%,28%)] shrink-0" />
              {t("tr.escrow")}
            </p>
          </div>

          <button
            type="button"
            onClick={handleFav}
            className="w-full h-10 rounded-lg border border-border text-[13px] font-semibold flex items-center justify-center gap-2 hover:bg-muted/40 transition-colors"
            data-testid="button-favorite-desktop"
          >
            <Heart className={cn("h-4 w-4", isFav && "fill-red-500 text-red-500")} />
            {isFav ? t("listing.inWishlist", { defaultValue: "Saved" }) : t("listing.addToWishlist", { defaultValue: "Add to Wishlist" })}
          </button>
        </div>
      </aside>

      </div>{/* end desktop three-column stage */}

      {/* Desktop trust bar — real policies only (no invented warranties) */}
      <div className="hidden lg:block max-w-7xl mx-auto px-4 py-4" data-testid="pdp-trust-bar">
        <div className="grid grid-cols-4 gap-4 rounded-xl border border-border bg-white px-4 py-3.5">
          {[
            { icon: Truck, label: t("listing.freeShipping", { defaultValue: "Free Shipping" }), sub: t("listing.standardFreeShipping").slice(0, 40) },
            { icon: CheckCircle2, label: t("tr.easyReturns", { defaultValue: "Easy Returns" }), sub: country ? t("tr.returnDays", { count: getReturnDays(country) }) : t("tr.returnDesc") },
            { icon: Shield, label: t("tr.escrow", { defaultValue: "Buyer Protection" }), sub: t("tr.escrowDesc") },
            { icon: Headphones, label: t("listing.support", { defaultValue: "Support" }), sub: t("nav.helpCenter", { defaultValue: "Help Center" }) },
          ].map((item) => (
            <div key={item.label} className="flex items-start gap-2.5 min-w-0">
              <item.icon className="h-5 w-5 text-[hsl(152,65%,28%)] shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-foreground leading-tight">{item.label}</p>
                <p className="text-[11px] text-muted-foreground truncate leading-snug mt-0.5">{item.sub}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Safety actions */}
      {user && user.id !== listing.sellerId && (
        <div className="flex items-center justify-end gap-3 px-4 py-1.5 text-[11px] border-b border-border/50 bg-muted/20 lg:max-w-7xl lg:mx-auto">
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive transition-colors"
            disabled={blockLoading}
            onClick={async () => {
              setBlockLoading(true);
              try {
                const r = await fetch(`/api/users/${listing.sellerId}/block`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
                if (!r.ok) throw new Error();
                queryClient.getQueryCache().getAll().forEach((q) => queryClient.setQueryData(q.queryKey, (d: any) => {
                  if (Array.isArray(d)) return d.filter((x: any) => x?.sellerId !== listing.sellerId);
                  if (d?.listings && Array.isArray(d.listings)) return { ...d, listings: d.listings.filter((x: any) => x?.sellerId !== listing.sellerId) };
                  return d;
                }));
                setLocation("/");
                await queryClient.invalidateQueries({ predicate: (q) => q.queryKey.some((x) => typeof x === "string" && x.toLowerCase().includes("listing")) });
              } finally { setBlockLoading(false); }
            }}
          >
            {blockLoading
              ? t("listing.blocking", { defaultValue: "Blocking…" })
              : t("listing.blockUser", { defaultValue: "Block user" })}
          </button>
          <span className="text-border" aria-hidden>·</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive transition-colors"
            onClick={() => fetch("/api/reports", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ targetType: "listing", targetId: listing.id, reason: "Inappropriate or abusive content" }) })}
          >
            {t("listing.reportListing", { defaultValue: "Report listing" })}
          </button>
          <span className="text-border" aria-hidden>·</span>
          <button
            type="button"
            className="text-muted-foreground hover:text-destructive transition-colors"
            data-testid="button-report-seller"
            onClick={() => fetch("/api/reports", {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                targetType: "user",
                targetId: listing.sellerId,
                reason: "Seller reported for policy or safety concerns",
              }),
            })}
          >
            {t("listing.reportSeller", { defaultValue: "Report seller" })}
          </button>
        </div>
      )}

      {/* Listing video (non-boost) */}
      {listingVideoUrl && (
        <div className="mx-4 mt-2 lg:max-w-7xl lg:mx-auto lg:px-4 rounded-xl overflow-hidden border border-border bg-black relative" data-testid="listing-video">
          <video src={listingVideoUrl} controls playsInline className="w-full max-h-56 lg:max-h-80 object-contain" preload="metadata" />
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

      {/* ══════════ BELOW-FOLD SECTIONS ══════════ */}
      <div className="pb-8 lg:max-w-7xl lg:mx-auto lg:px-4">

        {/* Sticky scope ends before Related Products so the tab bar unsticks
            and never floats over the related grid. */}
        <div data-testid="pdp-details-sticky-scope">

        {/* ── PDP TABS ──
            Sticky under the green header while inside Product Details.
            --pdp-tabs-sticky-top is measured (0 on mobile scroller; header height on desktop). */}
        <div
          ref={pdpTabsRef}
          className="sticky z-30 bg-white border-b border-border"
          style={{ top: "var(--pdp-tabs-sticky-top, 0px)" }}
          data-testid="pdp-tabs"
        >
          <div className="flex overflow-x-auto scrollbar-none" role="tablist">
            {([
              { id: "details" as const, label: t("listing.description", { defaultValue: "Product Details" }) },
              { id: "specs" as const, label: t("listing.specifications", { defaultValue: "Specifications" }) },
              { id: "reviews" as const, label: t("listing.reviews", { defaultValue: "Reviews" }) },
              { id: "qa" as const, label: t("listing.qa", { defaultValue: "Q&A" }) },
            ]).map((tab) => (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={pdpTab === tab.id}
                onClick={() => handlePdpTabClick(tab.id)}
                className={cn(
                  "flex-shrink-0 px-4 py-3 text-[13px] font-semibold border-b-2 transition-colors whitespace-nowrap",
                  pdpTab === tab.id
                    ? "border-[#F97316] text-[#F97316]"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
                data-testid={`pdp-tab-${tab.id}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── SELLER CONTACT (always visible) ── */}
        <div className="px-4 py-3 space-y-2.5 border-b border-border/60">
          <button
            onClick={() => setLocation(`/profile/${listing.sellerId}`)}
            className="flex items-center gap-2.5 w-full text-left"
          >
            <Avatar className="h-10 w-10 flex-shrink-0">
              <AvatarImage src={listing.sellerAvatar ?? undefined} />
              <AvatarFallback className="bg-[hsl(152,65%,22%)] text-white font-bold text-sm">{listing.sellerName[0]}</AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[13px] text-foreground">{listing.sellerName}</span>
                {listing.sellerIsVerified && <BadgeCheck className="h-3.5 w-3.5 fill-blue-500 text-white" />}
              </div>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
                <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                <span>{listing.sellerRating.toFixed(1)}</span>
                <span>· {t("listing.viewProfile")}</span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          </button>

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
              className="w-full text-green-700 border-green-300"
              onClick={handleWhatsApp}
              data-testid="button-whatsapp"
            >
              <svg className="h-3.5 w-3.5 mr-2 fill-current" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              {t("buttons.whatsapp")}
            </Button>
          )}
        </div>

        {/* ── TAB PANELS ── */}
        <div
          ref={pdpTabPanelRef}
          className="scroll-mt-[3.25rem] md:scroll-mt-[7.5rem]"
          data-testid="pdp-tab-panel"
        >

        {/* ── TAB: DETAILS ── */}
        {pdpTab === "details" && (
          <>
            <div className="px-4 py-3 space-y-2">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{t("listing.description")}</h2>
              <p className="text-[13px] text-foreground/85 leading-relaxed whitespace-pre-wrap">{listing.description}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="outline" className="text-xs">{listing.category}</Badge>
                <Badge variant="secondary" className="text-xs">{conditionLabel}</Badge>
                {(listing as any).weightLbs != null && (
                  <Badge variant="outline" className="text-xs gap-1">{(listing as any).weightLbs} lbs</Badge>
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

            {country && (
              <div className="px-4 py-3">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2">{t("tr.deliveryReturns")}</h2>
                <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                  <div className="flex items-start gap-2.5 px-3 py-2.5 bg-green-50/70">
                    <span className="text-base leading-none mt-0.5" aria-hidden>↩️</span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-green-800 leading-tight">
                        {t("tr.returnDays", { count: getReturnDays(country) })}
                      </p>
                      <p className="text-[11px] text-green-700/80 mt-0.5 leading-snug">{t("tr.returnDesc")}</p>
                    </div>
                  </div>
                  {isHaitiListingCountry ? (
                    <div className="flex items-start gap-2.5 px-3 py-2.5 bg-blue-50/70">
                      <span className="text-base leading-none mt-0.5" aria-hidden>🚗</span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-blue-800 leading-tight">{t("tr.deliveryDriver")}</p>
                        <p className="text-[11px] text-blue-700/80 mt-0.5 leading-snug">{t("tr.deliveryDriverDesc")}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2.5 px-3 py-2.5 bg-blue-50/70">
                      <span className="text-base leading-none mt-0.5" aria-hidden>📦</span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-blue-800 leading-tight">{t("tr.localDelivery")}</p>
                        <p className="text-[11px] text-blue-700/80 mt-0.5 leading-snug">{t("tr.localDeliveryDesc")}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-2.5 px-3 py-2.5 bg-emerald-50/70">
                    <span className="text-base leading-none mt-0.5" aria-hidden>🔒</span>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-emerald-800 leading-tight">{t("tr.escrow")}</p>
                      <p className="text-[11px] text-emerald-700/80 mt-0.5 leading-snug">{t("tr.escrowDesc")}</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── TAB: SPECS ── */}
        {pdpTab === "specs" && (
          <div className="px-4 py-3">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3">
              {t("listing.specifications", { defaultValue: "Specifications" })}
            </h2>
            <dl className="rounded-xl border border-border divide-y divide-border overflow-hidden text-[13px]">
              {[
                { label: t("search.condition"), value: conditionLabel },
                { label: t("sell.category", { defaultValue: "Category" }), value: listing.category },
                listing.subcategory ? { label: t("sell.subcategory", { defaultValue: "Subcategory" }), value: listing.subcategory } : null,
                country ? { label: t("listing.location", { defaultValue: "Location" }), value: [(listing as any).city, country].filter(Boolean).join(", ") } : null,
                (listing as any).weightLbs != null ? { label: t("listing.weight", { defaultValue: "Weight" }), value: `${(listing as any).weightLbs} lbs` } : null,
                rawStock != null ? { label: t("listing.stock", { defaultValue: "Stock" }), value: String(maxBuyQty) } : null,
              ].filter(Boolean).map((row) => (
                <div key={row!.label} className="grid grid-cols-2 gap-2 px-3 py-2.5">
                  <dt className="text-muted-foreground font-medium">{row!.label}</dt>
                  <dd className="text-foreground font-semibold text-right">{row!.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}

        {/* ── TAB: REVIEWS ── */}
        {pdpTab === "reviews" && (
          <div className="px-4 py-3 space-y-3">
            <div className="flex items-center gap-2">
              <Star className="h-5 w-5 fill-amber-400 text-amber-400" />
              <span className="text-lg font-bold tabular-nums">{listing.sellerRating.toFixed(1)}</span>
              <span className="text-sm text-muted-foreground">{t("listing.sellerRating", { defaultValue: "Seller rating" })}</span>
            </div>
            {user && !isOwner && (
              <button
                onClick={() => setReviewOpen(true)}
                className="flex items-center gap-2 text-sm text-[#F97316] font-semibold hover:underline"
                data-testid="button-leave-review"
              >
                <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                {t("review.rateSeller", { defaultValue: "Rate this seller" })}
              </button>
            )}
            <p className="text-[12px] text-muted-foreground">
              {t("listing.reviewsHint", { defaultValue: "Ratings reflect this seller’s overall marketplace reputation." })}
            </p>
          </div>
        )}

        {/* ── TAB: Q&A (comments) ── */}
        {pdpTab === "qa" && (
          <div className="px-4 pt-2 pb-2">
            <CommentsSection listingId={id} />
          </div>
        )}

        {/* ── OWNER ACTIONS ── */}
        {isOwner && (
          <div className="px-4 py-3 space-y-2">
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1 h-10" onClick={() => setLocation(`/sell?edit=${id}`)} data-testid="button-edit-listing">
                <Pencil className="h-4 w-4 mr-1" /> {t("buttons.edit")}
              </Button>
              <Button variant="destructive" size="icon" className="h-10 w-10" onClick={() => setDeleteConfirmOpen(true)} data-testid="button-delete-listing">
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
                  {t("listing.stockCurrent", { count: (listing as any).stockQuantity })}
                </span>
                <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full font-bold">{t("buttons.addStock")}</span>
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
            {(!isAndroidApp() || listing.isBoosted) && <Button variant="ghost" size="sm" className="w-full text-muted-foreground" onClick={() => setLocation(`/boost/${id}`)} data-testid="button-boost-listing">
              <Zap className="h-4 w-4 mr-1" /> {t("buttons.boostListing")}
            </Button>}
          </div>
        )}

        {isAdminViewer && !isOwner && (
          <div className="px-4 py-2.5 border-y bg-amber-50/40 dark:bg-amber-950/10 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-800 dark:text-amber-300 min-w-0">
              <Shield className="h-3.5 w-3.5 flex-shrink-0" />
              <span className="truncate">{t("listing.adminControls")}</span>
              {isModeratorViewer && !canAdminBoost && (
                <span className="font-semibold normal-case tracking-normal text-amber-700/80 dark:text-amber-400/80">· Moderator</span>
              )}
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2.5 text-xs gap-1.5 border-amber-300/80 text-amber-900 dark:text-amber-200"
                  disabled={adminActioning !== null}
                  data-testid="button-admin-menu"
                >
                  <MoreHorizontal className="h-4 w-4" />
                  {adminActioning ? "..." : t("nav.more")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => setLocation(`/sell?edit=${id}`)}
                  data-testid="button-admin-edit-listing"
                >
                  <Pencil className="h-3.5 w-3.5 mr-2" />
                  {t("listing.adminEdit")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={adminActioning !== null}
                  onClick={() => void handleAdminListingAction("approve")}
                  data-testid="button-admin-approve-listing"
                  className="text-green-700 focus:text-green-700 dark:text-green-400"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-2" />
                  {t("listing.adminApprove")}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={adminActioning !== null}
                  onClick={() => { setAdminReason(""); setAdminConfirmAction("reject"); }}
                  data-testid="button-admin-reject-listing"
                  className="text-amber-700 focus:text-amber-700 dark:text-amber-400"
                >
                  <AlertTriangle className="h-3.5 w-3.5 mr-2" />
                  {t("listing.adminReject")}
                </DropdownMenuItem>
                {canAdminBoost && !isAndroidApp() && (
                  <DropdownMenuItem
                    onClick={() => setLocation(`/boost/${id}`)}
                    data-testid="button-admin-boost-listing"
                  >
                    <Zap className="h-3.5 w-3.5 mr-2" />
                    {t("listing.adminBoost")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={adminActioning !== null}
                  onClick={() => setAdminConfirmAction("delete")}
                  data-testid="button-admin-delete-listing"
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  {t("listing.adminDelete")}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}

        {(listing.status !== "available" || isOwner) && (
          <div className="px-4 py-2.5">
            <Button variant="outline" className="w-full h-10" onClick={handleShare} data-testid="button-share-listing-secondary">
              <Share2 className="h-4 w-4 mr-2" /> {t("buttons.share")}
            </Button>
          </div>
        )}

        {!isOwner && listing.status === "available" && (
          <div className="px-4 py-2.5">
            <Button variant="ghost" className="w-full h-10" onClick={() => setOfferOpen(true)} data-testid="button-make-offer">
              <Tag className="h-4 w-4 mr-2" /> {t("buttons.makeOffer")}
            </Button>
          </div>
        )}

        </div>{/* end pdp-tab-panel */}
        </div>{/* end pdp-details-sticky-scope — sticky tabs stop here */}

        {/* ── RELATED PRODUCTS (same category, real listings only) ──
            Outside sticky scope so the tab bar cannot cover this grid. */}
        {relatedListings.length > 0 && (
          <div className="px-4 pt-4 pb-2" data-testid="pdp-related">
            <h2 className="text-[15px] font-bold mb-3">
              {t("listing.relatedProducts", { defaultValue: "Related products" })}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
              {relatedListings.map((item: any) => (
                <ListingCard key={item.id} listing={item} showAddToCart />
              ))}
            </div>
          </div>
        )}

        {/* Spacer so scroll content clears the always-fixed mobile purchase bar. */}
        {!isOwner && listing.status === "available" && (
          <div className="h-[calc(4.75rem+env(safe-area-inset-bottom))] lg:hidden" aria-hidden="true" />
        )}

      </div>

      {/* Always-fixed mobile Add to Cart / Buy — stays at bottom while the page scrolls.
          Portal escapes app-main-scroll paint containment. */}
      {!isOwner && listing.status === "available" && !buyNowOpen && createPortal(
        <div data-testid="listing-purchase-bar" className="fixed bottom-0 left-0 right-0 z-[60] bg-white/95 backdrop-blur-sm border-t border-border/60 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] flex items-center gap-2 px-3 py-2.5 pb-[calc(0.55rem+env(safe-area-inset-bottom))] lg:hidden">

          {/* Add to Cart — Amazon yellow */}
          <button
            onClick={handleAddToCartClick}
            data-testid="button-add-to-cart"
            disabled={!canPurchaseQty}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 h-12 rounded-full font-bold text-sm transition-all active:scale-95 disabled:opacity-50",
              isInCart(id)
                ? "bg-[hsl(152,65%,22%)] text-white"
                : "bg-[#FFD814] hover:bg-[#F7CA00] text-foreground shadow-sm",
            )}
          >
            <ShoppingCart className="h-4 w-4 flex-shrink-0" />
            <span className="text-[13px]">{isInCart(id) ? t("listing.inCart") : t("listing.addToCart")}</span>
          </button>

          {/* Buy Now — Flexa orange */}
          <button
            onClick={handleBuyNowClick}
            data-testid="button-buy-now"
            disabled={!canPurchaseQty}
            className="flex-[1.4] h-12 flex items-center justify-center gap-1.5 rounded-full font-bold text-sm text-white bg-[#F97316] hover:bg-[#ea6a0c] shadow-sm active:scale-95 transition-all disabled:opacity-50"
          >
            <div className="flex flex-col items-start leading-tight">
              <span className="text-[13px] font-bold">{t("buttons.buyNow")}</span>
              <span className="text-[10px] font-semibold opacity-90">
                {promoValidation?.valid
                  ? `$${promoValidation.finalPrice.toFixed(2)}`
                  : formatPrice(listing.price, country, (listing as any).currency)}
                {buyQty > 1 ? ` ×${buyQty}` : ""}
              </span>
            </div>
          </button>
        </div>,
        document.body
      )}

      {/* Gallery fullscreen */}
      <Dialog open={galleryFullscreen} onOpenChange={setGalleryFullscreen}>
        <DialogContent className="max-w-5xl w-[95vw] p-2 bg-black border-0">
          <DialogHeader className="sr-only">
            <DialogTitle>{listing.title}</DialogTitle>
          </DialogHeader>
          <div className="relative w-full aspect-[4/3] max-h-[85vh] flex items-center justify-center">
            {currentMedia?.type === "video" ? (
              <video src={currentMedia.url} controls autoPlay playsInline className="max-w-full max-h-full object-contain" />
            ) : currentMedia ? (
              <img src={currentMedia.url} alt={listing.title} className="max-w-full max-h-full object-contain" {...listingImageProps({ variant: "detail" })} />
            ) : null}
            {totalMedia > 1 && (
              <>
                <button
                  type="button"
                  onClick={() => setImgIndex(i => (i - 1 + totalMedia) % totalMedia)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/90 rounded-full p-2"
                  aria-label="Previous"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  type="button"
                  onClick={() => setImgIndex(i => (i + 1) % totalMedia)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/90 rounded-full p-2"
                  aria-label="Next"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Offer Dialog */}
      {/* ── DELETE CONFIRM DIALOG ── */}
      {/* ── Restock Dialog ── */}
      <Dialog open={restockOpen} onOpenChange={setRestockOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {t("listing.restockTitle")}
            </DialogTitle>
          </DialogHeader>
          <div className="py-3 space-y-4">
            <p className="text-sm text-muted-foreground">
              {t("listing.stockCurrent", { count: (listing as any)?.stockQuantity ?? 0 })}
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
              {t("buttons.cancel")}
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
                  toast({ title: t("listing.stockUpdated", { count: data.stockQuantity }) });
                  queryClient.invalidateQueries({ queryKey: getGetListingQueryKey(id) });
                  queryClient.invalidateQueries({ queryKey: getGetListingsQueryKey() });
                  queryClient.invalidateQueries({ queryKey: getGetUserListingsQueryKey((listing as any).sellerId) });
                  setRestockOpen(false);
                } catch {
                  toast({ title: t("errors.restock"), variant: "destructive" });
                } finally {
                  setRestocking(false);
                }
              }}
              data-testid="button-restock-confirm"
            >
              {restocking ? t("buttons.saving") : t("listing.addToStock", { count: restockQty })}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={adminConfirmAction !== null}
        onOpenChange={(open) => {
          if (!open && adminActioning === null) {
            setAdminConfirmAction(null);
            setAdminReason("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className={cn("flex items-center gap-2", adminConfirmAction === "delete" && "text-destructive")}>
              {adminConfirmAction === "delete"
                ? <Trash2 className="h-5 w-5" />
                : <AlertTriangle className="h-5 w-5" />}
              {adminConfirmAction === "delete"
                ? t("listing.adminDeleteTitle")
                : t("listing.adminRejectTitle")}
            </DialogTitle>
          </DialogHeader>

          {adminConfirmAction === "reject" ? (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{t("listing.adminRejectPrompt")}</p>
              <Textarea
                value={adminReason}
                onChange={(event) => setAdminReason(event.target.value)}
                placeholder={t("listing.adminReasonPlaceholder")}
                rows={3}
                autoFocus
                data-testid="input-admin-reject-reason"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-2">
              {t("listing.adminDeleteMessage")}
            </p>
          )}

          <DialogFooter className="flex gap-2 pt-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => { setAdminConfirmAction(null); setAdminReason(""); }}
              disabled={adminActioning !== null}
            >
              {t("buttons.cancel")}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="flex-1"
              onClick={() => {
                if (adminConfirmAction === "reject") {
                  void handleAdminListingAction("reject", adminReason);
                } else if (adminConfirmAction === "delete") {
                  void handleAdminListingAction("delete");
                }
              }}
              disabled={adminActioning !== null || (adminConfirmAction === "reject" && !adminReason.trim())}
              data-testid="button-admin-confirm-action"
            >
              {adminActioning
                ? "..."
                : adminConfirmAction === "delete"
                  ? t("listing.adminConfirmDelete")
                  : t("listing.adminConfirmReject")}
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

      {/* Buy Now Dialog — dark glass checkout redesign */}
      <Dialog open={buyNowOpen} onOpenChange={v => { setBuyNowOpen(v); if (!v) { setPayDone(false); setPayStep("promo"); clearPromo(); setPurchaseResult(null); setTipUsd(0); setDeliverySpeedTier("rapid"); setSelectedPayMethod(null); setAddressEditMode(false); } }}>
        <DialogContent
          overlayClassName="bg-black/35 overflow-hidden"
          overlayContent={<CheckoutProductBackdrop items={checkoutBackdropItems} />}
          className={cn(
          "fm-checkout-dark max-w-md w-[calc(100%-1.25rem)] max-h-[90vh] overflow-y-auto p-4 rounded-[1.35rem] gap-3 text-[#F4F7FF] z-[51]",
          "[&>button]:text-[#8B9BB8] [&>button]:hover:text-white [&>button]:hover:bg-white/10",
        )}>
          {payDone ? (
            <PaymentSuccessPanel
              amount={checkoutGrandTotal.toFixed(2)}
              methodLabel={lastPaidMethod}
              transactionId={lastTransactionId || (purchaseResult?.transactionId ? `FM-${purchaseResult.transactionId}` : `FM-${String(Date.now()).slice(-7)}`)}
              discountAmount={purchaseResult?.discountAmount}
              bonusEarned={purchaseResult?.bonusEarned}
              promoCode={purchaseResult?.promoCodeApplied}
              onViewOrder={() => { setBuyNowOpen(false); setPayDone(false); setPayStep("promo"); clearPromo(); setPurchaseResult(null); setLocation(purchaseResult?.transactionId ? `/orders/${purchaseResult.transactionId}` : "/orders"); }}
              onContinue={() => { setBuyNowOpen(false); setPayDone(false); setPayStep("promo"); clearPromo(); setPurchaseResult(null); }}
            />
          ) : payStep === "processing" || walletPayLoading || stripeLoading || payLoading ? (
            <ProcessingPaymentPanel verifyingDone={payLoading || walletPayLoading || stripeLoading} confirmingActive={payLoading || walletPayLoading} />
          ) : (
            <>
              {(["promo","address","delivery","select","review"] as const).includes(payStep as any) && (
                <CheckoutStepper
                  current={payStep === "review" ? "select" : payStep}
                  steps={[
                    { key: "promo", num: 1, label: t("listing.checkoutStepPromo") },
                    { key: "address", num: 2, label: t("listing.checkoutStepAddress") },
                    { key: "delivery", num: 3, label: t("listing.checkoutStepDelivery") },
                    { key: "select", num: 4, label: t("listing.checkoutStepPayment") },
                  ]}
                />
              )}

              {/* ══ STEP 1: PROMO ══ */}
              {payStep === "promo" && (
                <div className="space-y-3">
                  <PromoHero />
                  <GlassCard className="p-3 space-y-2">
                    <p className="text-sm font-bold text-white">{t("listing.promoQuestion")}</p>
                    {promoValidation ? (
                      <div className="flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2.5">
                        <Ticket className="h-4 w-4 text-emerald-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-emerald-300">{promoValidation.code} — {t("listing.promoSaved", { amount: promoValidation.discountAmount.toFixed(2) })}</p>
                        </div>
                        <button type="button" onClick={clearPromo} className="text-xs text-[#8B9BB8] hover:text-white shrink-0 p-1">✕</button>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <div className="flex gap-2">
                          <div className="relative flex-1 min-w-0">
                            <Ticket className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#8B9BB8] pointer-events-none" />
                            <Input
                              placeholder="e.g. FLEXA10"
                              value={promoCode}
                              onChange={e => { setPromoCode(e.target.value.toUpperCase()); setPromoError(null); }}
                              onKeyDown={e => e.key === "Enter" && validatePromoCode()}
                              className="pl-8 text-sm font-mono h-10 rounded-xl bg-white/5 border-white/15 text-white placeholder:text-[#6B7C99]"
                              data-testid="input-promo-code"
                            />
                          </div>
                          <Button
                            size="sm"
                            onClick={validatePromoCode}
                            disabled={!promoCode.trim() || promoValidating}
                            className="shrink-0 h-10 px-4 rounded-xl bg-[#2F6BFF] hover:bg-[#4C8DFF] text-white font-bold"
                            data-testid="button-apply-promo"
                          >
                            {promoValidating ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t("listing.promoApply")}
                          </Button>
                        </div>
                        {promoError && <p className="text-xs text-red-400">{promoError}</p>}
                      </div>
                    )}
                  </GlassCard>

                  {!promoValidation && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[#8B9BB8]">{t("listing.promoAvailableTitle")}</p>
                      {[
                        { code: "FLEXA10", badge: t("listing.promoFlexa10Badge"), desc: t("listing.promoFlexa10Desc"), color: "gold" as const, popular: true },
                        { code: "LIVRES",  badge: t("listing.promoLivresBadge"),  desc: t("listing.promoLivresDesc"),  color: "green" as const, popular: false },
                        { code: "NEWUSER", badge: t("listing.promoNewuserBadge"), desc: t("listing.promoNewuserDesc"), color: "purple" as const, popular: false },
                      ].map(p => (
                        <GlassCard
                          key={p.code}
                          onClick={() => { setPromoCode(p.code); setPromoError(null); }}
                          className={cn("px-3 py-3 relative overflow-hidden", p.popular && "border-[#F5B942]/35")}
                        >
                          {p.popular && (
                            <span className="absolute top-2 right-2 text-[9px] font-black uppercase tracking-wide px-1.5 py-0.5 rounded-md bg-[#F5B942]/20 text-[#F5B942]">Popular</span>
                          )}
                          <div className="flex items-center gap-3">
                            <div className={cn(
                              "px-2 py-1 rounded-lg text-[10px] font-black shrink-0 whitespace-nowrap border",
                              p.color === "gold" && "bg-amber-500/15 text-amber-300 border-amber-400/25",
                              p.color === "green" && "bg-emerald-500/15 text-emerald-300 border-emerald-400/25",
                              p.color === "purple" && "bg-violet-500/15 text-violet-300 border-violet-400/25",
                            )}>{p.badge}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-bold text-white">{p.code}</p>
                              <p className="text-[11px] text-[#8B9BB8] truncate">{p.desc}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-[#8B9BB8] shrink-0" />
                          </div>
                        </GlassCard>
                      ))}
                      <p className="text-[10px] text-[#8B9BB8] px-0.5">{t("listing.promoOnceWarning")}</p>
                    </div>
                  )}

                  <div className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2.5 flex items-center gap-2">
                    <Truck className="h-4 w-4 text-amber-300 shrink-0" />
                    <p className="text-[11px] text-amber-200/90 flex-1 leading-snug">{t("tr.shippingFeePre")} <strong className="text-amber-100">{t("tr.shippingFeeBold")}</strong> {t("tr.shippingFeePost")}</p>
                  </div>

                  <div className="pt-1 space-y-2">
                    <div className="flex items-end justify-between px-0.5">
                      <div>
                        <p className="text-[10px] text-[#8B9BB8]">{t("listing.productPriceLabel")}</p>
                        <p className="text-xl font-black text-white tabular-nums">
                          ${(effectiveListingPriceUsd - (promoValidation?.discountAmount ?? 0)).toFixed(2)}
                          {promoValidation && <span className="text-sm font-normal text-emerald-400 ml-1.5">(-${promoValidation.discountAmount.toFixed(2)})</span>}
                        </p>
                      </div>
                    </div>
                    <CheckoutPrimaryButton onClick={() => { setPayStep("address"); if (!addressIsComplete) setAddressEditMode(true); }} testId="button-promo-continue">
                      {t("listing.continueBtn")}
                    </CheckoutPrimaryButton>
                    <button type="button" onClick={() => setBuyNowOpen(false)} className="w-full text-center text-xs text-[#8B9BB8] hover:text-white py-1">{t("buttons.cancel")}</button>
                  </div>
                </div>
              )}

              {/* ══ STEP 2: ADDRESS ══ */}
              {payStep === "address" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setPayStep("promo")} className="p-1.5 rounded-xl hover:bg-white/10 shrink-0 transition-colors"><ChevronLeft className="h-5 w-5" /></button>
                    <DialogTitle className="text-base font-bold text-white">{t("listing.checkoutStepAddress")}</DialogTitle>
                  </div>

                  {addressIsComplete && !addressEditMode ? (
                    <div className="space-y-2.5">
                      <GlassCard selected className="p-3.5">
                        <div className="flex items-start gap-3">
                          <RadioDot selected />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-bold text-white">Home</p>
                              <button type="button" onClick={() => setAddressEditMode(true)} className="text-xs font-semibold text-[#4C8DFF] hover:underline">{t("buttons.edit", { defaultValue: "Edit" })}</button>
                            </div>
                            <p className="text-sm text-white/90 mt-0.5">{shipName}</p>
                            <p className="text-xs text-[#8B9BB8] mt-0.5">{shipStreet}, {shipCity}, {shipRegion}</p>
                            <p className="text-xs text-[#8B9BB8]">{shipPhone}</p>
                          </div>
                        </div>
                      </GlassCard>
                      <CheckoutOutlineButton onClick={() => { setAddressEditMode(true); }} className="border-dashed">
                        <MapPin className="h-4 w-4" /> {t("listing.addNewAddress", { defaultValue: "Add New Address" })}
                      </CheckoutOutlineButton>
                      <CheckoutPrimaryButton onClick={() => setPayStep("delivery")} testId="button-shipping-continue">
                        {t("listing.continueBtn")}
                      </CheckoutPrimaryButton>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <GlassCard className="overflow-hidden divide-y divide-white/10 !p-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#8B9BB8] px-4 pt-3 pb-2">{t("listing.contactInfo")}</p>
                        <div className="px-4 py-3">
                          <label className="text-[11px] font-semibold text-[#8B9BB8] uppercase tracking-wide block mb-1">{t("listing.fullName")} <span className="text-red-400">*</span></label>
                          <input type="text" value={shipName} onChange={e => setShipName(e.target.value)} placeholder="ex: Jean Pierre" data-testid="input-ship-name" className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-[#6B7C99] text-white" />
                        </div>
                        <div className="px-4 py-3">
                          <label className="text-[11px] font-semibold text-[#8B9BB8] uppercase tracking-wide block mb-1">{t("listing.phoneLabel")} <span className="text-red-400">*</span></label>
                          <input type="tel" value={shipPhone} onChange={e => setShipPhone(e.target.value)} placeholder="ex: +509 1234-5678" data-testid="input-ship-phone" className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-[#6B7C99] text-white" />
                        </div>
                        <div className="px-4 py-3">
                          <label className="text-[11px] font-semibold text-[#8B9BB8] uppercase tracking-wide block mb-1">{t("listing.emailLabel")} <span className="text-[#8B9BB8] font-normal">{t("listing.optionalLabel")}</span></label>
                          <input type="email" value={shipEmail} onChange={e => setShipEmail(e.target.value)} placeholder="ex: jean@gmail.com" data-testid="input-ship-email" className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-[#6B7C99] text-white" />
                        </div>
                      </GlassCard>

                      <GlassCard className="overflow-hidden divide-y divide-white/10 !p-0">
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#8B9BB8] px-4 pt-3 pb-2">{t("listing.checkoutDeliveryAddress")}</p>
                        <div className="relative px-4 py-3">
                          <label className="text-[11px] font-semibold text-[#8B9BB8] uppercase tracking-wide block mb-1">
                            {t("listing.streetAddress")} <span className="text-red-400">*</span>
                            {suggestLoading && <span className="ml-2 text-[10px] text-[#4C8DFF] font-normal normal-case">Ap chèche…</span>}
                          </label>
                          <input type="text" value={shipStreet} onChange={e => handleStreetChange(e.target.value)} onFocus={() => streetSuggestions.length > 0 && setShowSuggestions(true)} onBlur={() => setTimeout(() => setShowSuggestions(false), 180)} placeholder="ex: 12 Rue des Miracles" data-testid="input-ship-street" className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-[#6B7C99] text-white" autoComplete="off" />
                          {showSuggestions && streetSuggestions.length > 0 && (
                            <div className="absolute left-0 right-0 top-full z-50 bg-[#0B1228] border border-white/15 rounded-xl shadow-xl overflow-hidden mt-1 mx-1">
                              {streetSuggestions.map((s, i) => {
                                const parts = s.display_name.split(",");
                                const main = parts.slice(0, 2).join(",").trim();
                                const sub  = parts.slice(2, 4).join(",").trim();
                                return (
                                  <button key={i} type="button" onMouseDown={() => applySuggestion(s)} className="w-full flex items-start gap-3 px-4 py-3 hover:bg-white/5 text-left transition-colors border-b border-white/10 last:border-0">
                                    <MapPin className="h-4 w-4 text-[#4C8DFF] mt-0.5 shrink-0" />
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium text-white truncate">{main}</p>
                                      {sub && <p className="text-xs text-[#8B9BB8] truncate">{sub}</p>}
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 divide-x divide-white/10">
                          <div className="px-4 py-3">
                            <label className="text-[11px] font-semibold text-[#8B9BB8] uppercase tracking-wide block mb-1">{t("listing.cityLabel")} <span className="text-red-400">*</span></label>
                            <input type="text" value={shipCity} onChange={e => setShipCity(e.target.value)} placeholder="ex: Pòtoprens" data-testid="input-ship-city" className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-[#6B7C99] text-white" />
                          </div>
                          <div className="px-4 py-3">
                            <label className="text-[11px] font-semibold text-[#8B9BB8] uppercase tracking-wide block mb-1">{t("listing.regionLabel")} <span className="text-red-400">*</span></label>
                            <input type="text" value={shipRegion} onChange={e => setShipRegion(e.target.value)} placeholder="ex: Ouest" data-testid="input-ship-region" className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-[#6B7C99] text-white" />
                          </div>
                        </div>
                        {!isLocalDelivery && (
                          <div className="px-4 py-3">
                            <label className="text-[11px] font-semibold text-[#8B9BB8] uppercase tracking-wide block mb-1">{t("listing.zipLabel")} <span className="text-[#8B9BB8] font-normal">{t("listing.optionalLabel")}</span></label>
                            <input type="text" value={shipZip} onChange={e => setShipZip(e.target.value)} placeholder="ex: 10001" data-testid="input-ship-zip" className="w-full text-sm bg-transparent border-0 outline-none placeholder:text-[#6B7C99] text-white" />
                          </div>
                        )}
                      </GlassCard>

                      <CheckoutPrimaryButton
                        testId="button-shipping-continue"
                        onClick={() => {
                          if (shipName.trim().length < 2) { toast({ title: t("checkout.enterFullName") }); return; }
                          if (shipPhone.replace(/\D/g, "").length < 6) { toast({ title: t("checkout.enterPhone") }); return; }
                          if (shipStreet.trim().length < 3) { toast({ title: t("checkout.enterStreet") }); return; }
                          if (shipCity.trim().length < 2) { toast({ title: t("checkout.enterCity"), description: t("checkout.deliveryRequired") }); return; }
                          if (shipRegion.trim().length < 2) { toast({ title: t("checkout.enterRegion") }); return; }
                          if (shipEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(shipEmail.trim())) { toast({ title: t("checkout.invalidEmail") }); return; }
                          setAddressEditMode(false);
                          setPayStep("delivery");
                        }}
                      >
                        {t("listing.continueBtn")}
                      </CheckoutPrimaryButton>
                      <button type="button" onClick={() => setBuyNowOpen(false)} className="w-full text-center text-sm text-[#8B9BB8] hover:text-white py-1">{t("buttons.cancel")}</button>
                    </div>
                  )}
                </div>
              )}

              {/* ══ STEP 3: DELIVERY ══ */}
              {payStep === "delivery" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setPayStep("address")} className="p-1.5 rounded-xl hover:bg-white/10 shrink-0"><ChevronLeft className="h-5 w-5" /></button>
                    <DialogTitle className="text-base font-bold text-white">{t("listing.deliveryHeader")}</DialogTitle>
                  </div>

                  {isLocalDelivery ? (
                    <div className="space-y-2">
                      {([
                        { key: "regular" as const, labelKey: "listing.deliveryStandard", subKey: "listing.deliveryStandardSub", emoji: "🚛", fixedFee: 10 },
                        { key: "rapid"   as const, labelKey: "listing.deliveryRapid",    subKey: "listing.deliveryRapidSub",    emoji: "⚡", fixedFee: 15, popular: true },
                        { key: "express" as const, labelKey: "listing.deliveryExpress",  subKey: "listing.deliveryExpressSub",  emoji: "🚀", fixedFee: 25 },
                        { key: "pickup"  as const, labelKey: "listing.deliveryPickup",   subKey: "listing.deliveryPickupSub",   emoji: "🏪", fixedFee: 0,  free: true },
                        { key: "custom"  as const, labelKey: "listing.deliveryCustom",   subKey: "listing.deliveryCustomSub",   emoji: "✏️", fixedFee: 0 },
                      ]).map((opt) => {
                        const finalFee = (opt.key === "pickup" || opt.key === "custom") ? 0 : opt.fixedFee;
                        const selected = deliverySpeedTier === opt.key;
                        return (
                          <GlassCard key={opt.key} selected={selected} onClick={() => setDeliverySpeedTier(opt.key)} className="px-3.5 py-3">
                            <div className="flex items-center gap-3">
                              <RadioDot selected={selected} />
                              <span className="text-base shrink-0">{opt.emoji}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className={cn("text-sm font-semibold", selected ? "text-white" : "text-white/90")}>
                                    {opt.key === "custom" ? t("listing.deliveryCustomLabel") : t(opt.labelKey)}
                                  </span>
                                  {(opt as any).popular && <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded-md bg-[#2F6BFF] text-white">Popular</span>}
                                </div>
                                <p className="text-xs text-[#8B9BB8]">{opt.key === "custom" ? t("listing.deliveryCustomHint") : t(opt.subKey)}</p>
                              </div>
                              <div className="text-right shrink-0">
                                {(opt as any).free ? (
                                  <span className="text-sm font-bold text-emerald-400">{t("listing.deliveryFree")}</span>
                                ) : opt.key === "custom" ? (
                                  <span className="text-xs text-[#8B9BB8]">✏️</span>
                                ) : (
                                  <span className={cn("text-sm font-bold", selected ? "text-[#4C8DFF]" : "text-white")}>${finalFee.toFixed(2)}</span>
                                )}
                              </div>
                            </div>
                          </GlassCard>
                        );
                      })}
                    </div>
                  ) : (
                    <GlassCard className="p-3 space-y-2">
                      <p className="text-xs font-semibold text-[#8B9BB8] uppercase tracking-wide">{t(isDominicanSellerDelivery ? "sell.deliverySelf" : "listing.shippingCarrier")}</p>
                      <div className="flex flex-wrap gap-2">
                        {(isDominicanSellerDelivery ? ["self_delivery"] : isDominicanDelivery ? dominicanCarriers : (listing as any)?.shippingCarriers?.length ? (listing as any).shippingCarriers : ["UPS", "FedEx", "DHL", "USPS", "Other"]).map((c: string) => (
                          <button key={c} type="button" onClick={() => setSelectedCarrier(c)}
                            className={cn("px-3 py-1.5 rounded-xl border-2 text-sm font-medium transition-all",
                              selectedCarrier === c ? "border-[#2F6BFF] bg-[#2F6BFF]/15 text-[#4C8DFF]" : "border-white/15 hover:border-white/30 text-white/80"
                            )} data-testid={`button-carrier-${c.toLowerCase()}`}>{c === "self_delivery" ? t("sell.deliverySelf") : c}</button>
                        ))}
                      </div>
                    </GlassCard>
                  )}

                  {isLocalDelivery && deliverySpeedTier === "custom" && (
                    <GlassCard className="p-3 space-y-2 border-[#2F6BFF]/40">
                      <p className="text-xs font-bold text-[#4C8DFF]">✏️ {t("listing.customDeliveryTitle")}</p>
                      <p className="text-[11px] text-[#8B9BB8]">{t("listing.customDeliveryDesc")}</p>
                      <div className="flex gap-2">
                        {[10, 15, 25].map(amt => (
                          <button key={amt} type="button" onClick={() => { setCustomDeliveryInput(String(amt)); setDeliveryFeeUsd(amt); }}
                            className={cn("flex-1 h-9 rounded-xl border-2 text-sm font-bold transition-all",
                              deliveryFeeUsd === amt ? "border-[#2F6BFF] bg-[#2F6BFF] text-white" : "border-[#2F6BFF]/30 text-[#4C8DFF] hover:bg-[#2F6BFF]/10")}>${amt}</button>
                        ))}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[#8B9BB8]">$</span>
                        <input type="number" inputMode="decimal" min="0" step="1" value={customDeliveryInput}
                          onChange={e => { setCustomDeliveryInput(e.target.value); const v = parseFloat(e.target.value); setDeliveryFeeUsd(!isNaN(v) && v >= 0 ? parseFloat(v.toFixed(2)) : 0); }}
                          className="w-full h-10 pl-7 pr-3 rounded-xl border-2 border-[#2F6BFF]/30 focus:border-[#2F6BFF] bg-white/5 text-sm font-mono focus:outline-none text-white"
                          placeholder={t("listing.customDeliveryPlaceholder")} />
                      </div>
                    </GlassCard>
                  )}

                  {deliveryFeeIsEstimate && effectiveDeliveryFee > 0 && (
                    <p className="text-[11px] text-amber-300 px-1">{t("listing.deliveryEstimate")}</p>
                  )}

                  {isLocalDelivery && deliverySpeedTier !== "pickup" && deliverySpeedTier !== "custom" && baseFeeUsd > 0 && (
                    <GlassCard className="p-3 space-y-2 border-rose-400/25 bg-rose-500/5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-bold flex items-center gap-1">💝 Ankouraje chofè a ak yon tip <span className="text-[10px] font-normal text-[#8B9BB8]">(opsyonèl)</span></p>
                          <p className="text-[10px] text-[#8B9BB8]">100% ale jwenn chofè ou dirèkteman</p>
                        </div>
                        {tipUsd > 0 && <span className="text-sm font-black text-rose-300">+${tipUsd.toFixed(2)}</span>}
                      </div>
                      <div className="flex gap-1.5">
                        {[1, 2, 5, 10].map(amt => (
                          <button key={amt} type="button" onClick={() => { setTipUsd(amt); setShowCustomTip(false); setCustomTipInput(""); }}
                            className={cn("flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all",
                              tipUsd === amt && !showCustomTip ? "border-rose-400 bg-rose-400/15 text-rose-200" : "border-white/15 bg-white/5 hover:border-rose-300/50")}>${amt}</button>
                        ))}
                        <button type="button" onClick={() => { setShowCustomTip(true); setTipUsd(0); }}
                          className={cn("flex-1 py-2 rounded-xl text-xs font-bold border-2 transition-all",
                            showCustomTip ? "border-rose-400 bg-rose-400/15 text-rose-200" : "border-white/15 bg-white/5")}>{t("listing.tipOther")}</button>
                      </div>
                      {showCustomTip && (
                        <div className="flex gap-2 items-center">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-[#8B9BB8]">$</span>
                            <input type="number" inputMode="decimal" min="0.5" max="50" step="0.5" placeholder="0.00" value={customTipInput} onChange={e => setCustomTipInput(e.target.value)}
                              className="w-full border-2 border-rose-400/40 focus:border-rose-400 rounded-xl pl-7 pr-3 py-2 text-sm font-bold bg-white/5 focus:outline-none text-white" autoFocus />
                          </div>
                          <button type="button" onClick={() => { const v = parseFloat(customTipInput); if (!isNaN(v) && v >= 0.5 && v <= 50) setTipUsd(parseFloat(v.toFixed(2))); }}
                            className="px-3 py-2 rounded-xl text-xs font-bold bg-rose-500 text-white">OK</button>
                        </div>
                      )}
                    </GlassCard>
                  )}

                  <GlassCard className="p-3.5 space-y-2">
                    <p className="text-[11px] font-black uppercase tracking-wide text-[#8B9BB8]">{t("listing.priceSummary")}</p>
                    <div className="space-y-1.5 text-sm">
                      <div className="flex items-center justify-between"><span className="text-[#8B9BB8]">🛍 {t("listing.productPrice")}</span><span className="font-semibold text-white">${effectiveListingPriceUsd.toFixed(2)}</span></div>
                      {(promoValidation?.discountAmount ?? 0) > 0 && (
                        <div className="flex items-center justify-between"><span className="text-[#8B9BB8]">🎟 {t("listing.deliveryDiscountLabel")} ({promoValidation!.code})</span><span className="font-semibold text-emerald-400">−${promoValidation!.discountAmount.toFixed(2)}</span></div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-[#8B9BB8]">🚚 {t("listing.checkoutDelivery")}</span>
                        {deliverySpeedTier === "pickup" ? <span className="font-semibold text-emerald-400">{t("listing.deliveryFree")}</span>
                          : deliveryFeeLoading ? <span className="text-[#8B9BB8] text-xs italic">{t("listing.calculating")}</span>
                          : effectiveDeliveryFee > 0 ? <span className="font-semibold text-[#4C8DFF]">+${effectiveDeliveryFee.toFixed(2)}</span>
                          : <span className="text-amber-300 text-xs">⚠️ {t("listing.checkoutCityUnknown")}</span>}
                      </div>
                      {effectiveTip > 0 && <div className="flex items-center justify-between"><span className="text-[#8B9BB8]">{t("listing.tipLabel")}</span><span className="font-semibold text-rose-300">+${effectiveTip.toFixed(2)}</span></div>}
                      {((quote as any)?.referralFee ?? 0) > 0 && <div className="flex items-center justify-between"><span className="text-[#8B9BB8]">🔗 {t("listing.referralFeeLabel", "Frè referans")}</span><span className="font-semibold text-orange-300">+${((quote as any).referralFee as number).toFixed(2)}</span></div>}
                    </div>
                    <div className="border-t border-white/10 pt-2 flex items-center justify-between">
                      <span className="font-black text-sm text-white">💰 {t("listing.checkoutCurrentTotal")}</span>
                      <span className="text-xl font-black text-[#4C8DFF]">${checkoutGrandTotal.toFixed(2)}</span>
                    </div>
                  </GlassCard>

                  <CheckoutPrimaryButton
                    disabled={deliveryFeeLoading || (isLocalDelivery && deliverySpeedTier !== "pickup" && deliverySpeedTier !== "custom" && deliveryFeeUsd === 0) || (isLocalDelivery && deliverySpeedTier === "custom" && deliveryFeeUsd === 0) || (!isLocalDelivery && !selectedCarrier)}
                    onClick={() => setPayStep("select")}
                  >
                    {deliveryFeeLoading ? t("listing.calcDeliveryFee") : t("listing.continueBtn")}
                  </CheckoutPrimaryButton>
                  <button type="button" onClick={() => setBuyNowOpen(false)} className="w-full text-center text-sm text-[#8B9BB8] hover:text-white">{t("buttons.cancel")}</button>
                </div>
              )}

              {/* ══ STEP 4: PAYMENT METHOD ══ */}
              {payStep === "select" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setPayStep("delivery")} className="p-1.5 rounded-xl hover:bg-white/10" data-testid="button-back-shipping"><ChevronLeft className="h-4 w-4" /></button>
                    <DialogTitle className="text-base font-bold text-white">{t("payment.title")}</DialogTitle>
                  </div>
                  <p className="text-sm text-[#8B9BB8]">{listing.title}</p>

                  <div className="space-y-2.5">
                    <GlassCard selected={selectedPayMethod === "stripe"} onClick={() => setSelectedPayMethod("stripe")} className="p-4" testId="button-pay-card">
                      <div className="flex items-center gap-3">
                        <RadioDot selected={selectedPayMethod === "stripe"} />
                        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center shrink-0">
                          <CreditCard className="h-5 w-5 text-[#4C8DFF]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white">{t("payment.cardPayment")}</p>
                          <p className="text-xs text-[#8B9BB8]">{t("payment.cardSubtitle")}</p>
                        </div>
                      </div>
                    </GlassCard>

                    {user && (
                      <GlassCard
                        selected={selectedPayMethod === "wallet"}
                        onClick={() => setSelectedPayMethod("wallet")}
                        className="p-4"
                        testId="button-pay-wallet"
                      >
                        <div className="flex items-center gap-3">
                          <RadioDot selected={selectedPayMethod === "wallet"} />
                          <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center shrink-0"><span className="text-lg">💳</span></div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="font-semibold text-white">{t("listing.fmCard")}</p>
                              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300">
                                Balance: ${walletTotal.toFixed(2)}
                              </span>
                            </div>
                            <p className="text-xs text-[#8B9BB8]">
                              {walletData ? `${t("listing.checkoutBalance")}: $${walletReal.toFixed(2)}${walletPromo > 0 ? ` + $${walletPromo.toFixed(2)} ${t("listing.checkoutPromo")}` : ""}` : t("listing.loadingBalance")}
                            </p>
                            {walletTotal < checkoutGrandTotal - 0.001 && walletData && (
                              <p className="text-xs text-red-400 mt-0.5">{t("listing.insufficientBalance", { amount: checkoutGrandTotal.toFixed(2) })}</p>
                            )}
                          </div>
                        </div>
                      </GlassCard>
                    )}

                    {(() => {
                      const totalAmt = quote?.buyerTotal ?? effectiveListingPriceUsd;
                      const inst4 = (totalAmt / 4).toFixed(2);
                      const anyBnplEnabled = bnplSettings && (bnplSettings.klarnaEnabled || bnplSettings.affirmEnabled || bnplSettings.afterpayEnabled);
                      if (!anyBnplEnabled) return null;
                      return (
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center gap-2"><div className="flex-1 h-px bg-white/10" /><span className="text-[10px] font-black text-[#8B9BB8] uppercase tracking-widest px-1">{t("listing.checkoutInstallments")}</span><div className="flex-1 h-px bg-white/10" /></div>
                          {bnplSettings?.klarnaEnabled && (
                            <GlassCard selected={selectedPayMethod === "klarna"} onClick={() => setSelectedPayMethod("klarna")} className="p-3.5" testId="button-pay-klarna">
                              <div className="flex items-center gap-3">
                                <RadioDot selected={selectedPayMethod === "klarna"} />
                                <div className="w-9 h-9 rounded-lg bg-pink-500/20 flex items-center justify-center font-black text-pink-300">K</div>
                                <div className="flex-1"><p className="font-semibold text-pink-200">Klarna</p><p className="text-xs text-[#8B9BB8]">{t("tr.payInFourPlan", { amount: `$${inst4}` })}</p></div>
                              </div>
                            </GlassCard>
                          )}
                          {bnplSettings?.afterpayEnabled && (
                            <GlassCard selected={selectedPayMethod === "afterpay_clearpay"} onClick={() => setSelectedPayMethod("afterpay_clearpay")} className="p-3.5" testId="button-pay-afterpay">
                              <div className="flex items-center gap-3">
                                <RadioDot selected={selectedPayMethod === "afterpay_clearpay"} />
                                <div className="w-9 h-9 rounded-lg bg-teal-500/20 flex items-center justify-center font-black text-teal-300">A</div>
                                <div className="flex-1"><p className="font-semibold text-teal-200">Afterpay</p><p className="text-xs text-[#8B9BB8]">{t("tr.payInFourPlan", { amount: `$${inst4}` })}</p></div>
                              </div>
                            </GlassCard>
                          )}
                          {bnplSettings?.affirmEnabled && (
                            <GlassCard selected={selectedPayMethod === "affirm"} onClick={() => setSelectedPayMethod("affirm")} className="p-3.5" testId="button-pay-affirm">
                              <div className="flex items-center gap-3">
                                <RadioDot selected={selectedPayMethod === "affirm"} />
                                <div className="w-9 h-9 rounded-lg bg-indigo-500/20 flex items-center justify-center font-black text-indigo-300 text-xs">Aff</div>
                                <div className="flex-1"><p className="font-semibold text-indigo-200">Affirm</p><p className="text-xs text-[#8B9BB8]">{t("listing.checkoutAffirmDescription", { total: totalAmt.toFixed(2) })}</p></div>
                              </div>
                            </GlassCard>
                          )}
                        </div>
                      );
                    })()}

                    <GlassCard
                      selected={selectedPayMethod === "usdt"}
                      onClick={() => usdtWalletAddress.trim() && setSelectedPayMethod("usdt")}
                      className={cn("p-4", !usdtWalletAddress.trim() && "opacity-45 pointer-events-none")}
                      testId="button-pay-usdt"
                    >
                      <div className="flex items-center gap-3">
                        <RadioDot selected={selectedPayMethod === "usdt"} />
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0"><span className="text-emerald-400 font-black text-sm">₮</span></div>
                        <div><p className="font-semibold text-white">{t("payment.usdtPayment")}</p><p className="text-xs text-[#8B9BB8]">{usdtWalletAddress.trim() ? t("payment.usdtSubtitle") : t("listing.checkoutUnavailableMethod")}</p></div>
                      </div>
                    </GlassCard>

                    {user && (
                      <GlassCard selected={selectedPayMethod === "friend"} onClick={() => setSelectedPayMethod("friend")} className="p-4" testId="button-pay-friend">
                        <div className="flex items-center gap-3">
                          <RadioDot selected={selectedPayMethod === "friend"} />
                          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0"><Users className="h-5 w-5 text-emerald-400" /></div>
                          <div><p className="font-semibold text-white">{t("friendPay.title")}</p><p className="text-xs text-[#8B9BB8]">{t("friendPay.subtitle")}</p></div>
                        </div>
                      </GlassCard>
                    )}
                  </div>

                  <div className="pt-1 space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-sm text-[#8B9BB8]">Total to Pay</span>
                      <span className="text-lg font-black text-white tabular-nums">${checkoutGrandTotal.toFixed(2)}</span>
                    </div>
                    <CheckoutPrimaryButton
                      disabled={!selectedPayMethod || (selectedPayMethod === "wallet" && walletTotal < checkoutGrandTotal - 0.001)}
                      onClick={() => setPayStep("review")}
                      testId="button-continue-review"
                    >
                      Continue to Review
                    </CheckoutPrimaryButton>
                    <button type="button" onClick={() => setBuyNowOpen(false)} className="w-full text-center text-sm text-[#8B9BB8] hover:text-white mt-1">{t("buttons.cancel")}</button>
                  </div>
                </div>
              )}

              {/* ══ REVIEW & CONFIRM ══ */}
              {payStep === "review" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setPayStep("select")} className="p-1.5 rounded-xl hover:bg-white/10"><ChevronLeft className="h-5 w-5" /></button>
                    <DialogTitle className="text-base font-bold text-white">Review & Confirm</DialogTitle>
                  </div>

                  <GlassCard className="p-3 flex items-center gap-3">
                    {((listing as any).images?.[0]) ? (
                      <img src={(listing as any).images[0]} alt="" className="w-14 h-14 rounded-xl object-cover bg-white/5" />
                    ) : (
                      <div className="w-14 h-14 rounded-xl bg-white/10 flex items-center justify-center"><ImageIcon className="h-5 w-5 text-[#8B9BB8]" /></div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-white text-sm truncate">{listing.title}</p>
                      <p className="text-xs text-[#8B9BB8] mt-0.5">Qty: 1</p>
                    </div>
                    <p className="font-bold text-white tabular-nums">${effectiveListingPriceUsd.toFixed(2)}</p>
                  </GlassCard>

                  {[
                    { label: "Address", value: `${shipName} · ${shipStreet}, ${shipCity}`, edit: () => setPayStep("address") },
                    { label: "Delivery", value: isLocalDelivery ? t(`listing.delivery${deliverySpeedTier === "rapid" ? "Rapid" : deliverySpeedTier === "express" ? "Express" : deliverySpeedTier === "pickup" ? "Pickup" : deliverySpeedTier === "custom" ? "Custom" : "Standard"}`) : (selectedCarrier ?? "—"), edit: () => setPayStep("delivery") },
                    { label: "Payment", value: selectedPayMethod === "wallet" ? t("listing.fmCard") : selectedPayMethod === "stripe" ? "Stripe" : selectedPayMethod === "usdt" ? "USDT" : selectedPayMethod === "friend" ? t("friendPay.title") : selectedPayMethod ?? "—", edit: () => setPayStep("select") },
                  ].map(row => (
                    <GlassCard key={row.label} className="px-3.5 py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-wide text-[#8B9BB8]">{row.label}</p>
                        <p className="text-sm text-white truncate mt-0.5">{row.value}</p>
                      </div>
                      <button type="button" onClick={row.edit} className="text-xs font-bold text-[#4C8DFF] shrink-0">Edit</button>
                    </GlassCard>
                  ))}

                  <GlassCard className="p-3.5 space-y-2">
                    <div className="flex justify-between text-sm"><span className="text-[#8B9BB8]">Subtotal</span><span className="text-white">${(effectiveListingPriceUsd - (promoValidation?.discountAmount ?? 0)).toFixed(2)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-[#8B9BB8]">Delivery</span><span className="text-white">${effectiveDeliveryFee.toFixed(2)}</span></div>
                    {effectiveTip > 0 && <div className="flex justify-between text-sm"><span className="text-[#8B9BB8]">Tip</span><span className="text-white">${effectiveTip.toFixed(2)}</span></div>}
                    <div className="border-t border-white/10 pt-2 flex justify-between"><span className="font-bold text-white">Total to Pay</span><span className="text-xl font-black text-[#4C8DFF]">${checkoutGrandTotal.toFixed(2)}</span></div>
                  </GlassCard>

                  <CheckoutPrimaryButton lock onClick={confirmSelectedPayment} testId="button-pay-confirm" disabled={!selectedPayMethod}>
                    Pay ${checkoutGrandTotal.toFixed(2)}
                  </CheckoutPrimaryButton>
                </div>
              )}

              {/* ══ USDT ══ */}
              {payStep === "usdt" && (
                <>
                  <DialogHeader>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setPayStep("review")} className="p-1 rounded hover:bg-white/10"><ChevronLeft className="h-4 w-4" /></button>
                      <DialogTitle className="text-white">{t("payment.usdtPayment")}</DialogTitle>
                    </div>
                  </DialogHeader>
                  <div className="space-y-4 mt-1">
                    <div className="text-center">
                      <p className="text-3xl font-black text-[#4C8DFF]">{effectiveListingPriceUsd.toFixed(2)} USDT</p>
                      <p className="text-xs text-[#8B9BB8] mt-1">TRC-20 Network (TRON)</p>
                    </div>
                    {quote && <CommissionBreakdown quote={quote} audience="buyer" />}
                    {usdtWalletAddress.trim() ? (
                      <GlassCard className="p-4 space-y-2">
                        <p className="text-xs text-[#8B9BB8] font-medium uppercase tracking-wide">{t("payment.walletAddress")}</p>
                        <p className="font-mono text-xs break-all select-all bg-white/5 border border-white/10 rounded-lg px-3 py-2">{usdtWalletAddress}</p>
                        <button type="button" onClick={() => { navigator.clipboard.writeText(usdtWalletAddress); toast({ title: t("payment.walletCopied") }); }} className="text-xs text-[#4C8DFF] hover:underline" data-testid="button-copy-wallet">{t("payment.copyAddress")}</button>
                      </GlassCard>
                    ) : (
                      <div className="bg-red-500/10 border border-red-400/30 rounded-xl p-3 flex items-center gap-2">
                        <span className="text-red-400 text-lg">⚠</span>
                        <p className="text-sm text-red-300">USDT payments are currently unavailable. Please choose another payment method.</p>
                      </div>
                    )}
                    <div className="bg-amber-500/10 border border-amber-400/25 rounded-xl p-3">
                      <p className="text-xs text-amber-200">⚠️ {t("payment.usdtWarning", { amount: effectiveListingPriceUsd.toFixed(2) })}</p>
                    </div>
                    <Input placeholder="Paste your USDT transaction hash (TRC-20)" value={usdtTxHash} onChange={e => setUsdtTxHash(e.target.value)} data-testid="input-usdt-hash" className="bg-white/5 border-white/15 text-white" />
                    <CheckoutPrimaryButton onClick={handleConfirmUsdt} disabled={payLoading || !usdtWalletAddress.trim()} testId="button-confirm-usdt">
                      {payLoading ? "Verifying…" : t("payment.iSentPayment")}
                    </CheckoutPrimaryButton>
                  </div>
                </>
              )}

              {/* ══ MONCASH / NATCASH ══ */}
              {(payStep === "moncash" || payStep === "natcash") && (
                <>
                  <DialogHeader>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setPayStep("select")} className="p-1 rounded hover:bg-white/10" data-testid="button-back-mobile-money"><ChevronLeft className="h-4 w-4" /></button>
                      <DialogTitle className="text-white">{payStep === "moncash" ? t("payment.moncashPayment") : t("payment.natcashPayment")}</DialogTitle>
                    </div>
                  </DialogHeader>
                  <div className="space-y-4 mt-1">
                    <div className="text-center">
                      <p className="text-3xl font-black text-[#4C8DFF]">{formatPrice(effectiveListingPrice, country, (listing as any).currency)}</p>
                      <p className="text-xs text-[#8B9BB8] mt-1">{payStep === "moncash" ? t("payment.moncashSubtitle") : t("payment.natcashSubtitle")}</p>
                    </div>
                    {quote && <CommissionBreakdown quote={quote} audience="buyer" />}
                    <GlassCard className="p-4 space-y-2">
                      <div className="flex items-center justify-between flex-wrap gap-1">
                        <p className="text-xs text-[#8B9BB8] font-medium uppercase tracking-wide">{t("payment.sendToNumber")}</p>
                        {payStep === "moncash" && moncashIsDirectToSeller && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                            <BadgeCheck className="h-3 w-3" /> Dirèk nan men vendè
                          </span>
                        )}
                      </div>
                      <p className="font-mono text-base font-bold text-white select-all bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-center">
                        {payStep === "moncash" ? MONCASH_NUMBER : NATCASH_NUMBER}
                      </p>
                      {payStep === "moncash" && moncashIsDirectToSeller && (
                        <p className="text-[11px] text-emerald-300 text-center">📱 Nimewo MonCash vendè a verifye — voye lajan dirèkteman ba li</p>
                      )}
                      <button type="button" onClick={() => { const num = payStep === "moncash" ? MONCASH_NUMBER : NATCASH_NUMBER; navigator.clipboard.writeText(num); toast({ title: t("payment.numberCopied") }); }}
                        className="text-xs text-[#4C8DFF] hover:underline inline-flex items-center gap-1" data-testid="button-copy-mobile-number">
                        <Copy className="h-3 w-3" /> {t("payment.copyNumber")}
                      </button>
                    </GlassCard>
                    <div className="bg-amber-500/10 border border-amber-400/25 rounded-xl p-3">
                      <p className="text-xs text-amber-200">💡 {t("payment.mobileMoneyHint")}</p>
                    </div>
                    <Input placeholder={t("payment.transactionId")} value={mobileMoneyTxId} onChange={e => setMobileMoneyTxId(e.target.value)} data-testid="input-mobile-money-txid" className="bg-white/5 border-white/15 text-white" />
                    <CheckoutPrimaryButton
                      onClick={() => handleConfirmMobileMoney(payStep === "moncash" ? "moncash" : "natcash")}
                      disabled={payLoading}
                      testId={payStep === "moncash" ? "button-confirm-moncash" : "button-confirm-natcash"}
                    >
                      {payLoading ? t("payment.processing") : t("payment.iSentMobileMoney")}
                    </CheckoutPrimaryButton>
                  </div>
                </>
              )}

              {/* ══ ZANMI PEYE ══ */}
              {payStep === "friend" && (
                <>
                  <DialogHeader>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setPayStep("review")} className="p-1 rounded hover:bg-white/10">
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <DialogTitle className="text-white">{t("friendPay.title")}</DialogTitle>
                    </div>
                  </DialogHeader>
                  <div className="space-y-4 mt-2">
                    {!friendRequestSent ? (
                      <>
                        <p className="text-sm text-[#8B9BB8]">{t("friendPay.subtitle")}</p>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#8B9BB8]" />
                            <Input
                              value={friendQuery}
                              onChange={e => setFriendQuery(e.target.value)}
                              onKeyDown={e => e.key === "Enter" && searchFriendUsers()}
                              placeholder={t("friendPay.searchPlaceholder")}
                              className="pl-9 rounded-xl bg-white/5 border-white/15 text-white"
                            />
                          </div>
                          <Button onClick={searchFriendUsers} disabled={friendSearching} className="rounded-xl bg-[#2F6BFF]">
                            {friendSearching ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : t("walletTransfer.search")}
                          </Button>
                        </div>
                        {friendResults.length > 0 && (
                          <div className="space-y-2 max-h-64 overflow-y-auto">
                            {friendResults.map(u => (
                              <GlassCard
                                key={u.id}
                                onClick={() => { setFriendRecipient(u); setFriendConfirmOpen(true); }}
                                className="p-3"
                              >
                                <div className="flex items-center gap-3">
                                  <Avatar className="h-10 w-10">
                                    <AvatarImage src={u.avatar ?? undefined} />
                                    <AvatarFallback className="bg-[#2F6BFF]/20 text-[#4C8DFF] font-bold">{u.name?.[0]}</AvatarFallback>
                                  </Avatar>
                                  <div className="flex-1">
                                    <p className="font-semibold text-sm text-white">{u.name}</p>
                                    {u.country && <p className="text-xs text-[#8B9BB8]">{u.country}</p>}
                                  </div>
                                  <ChevronRight className="h-4 w-4 text-[#8B9BB8]" />
                                </div>
                              </GlassCard>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-6">
                        <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                          <CheckCircle2 className="h-8 w-8 text-emerald-400" />
                        </div>
                        <h3 className="font-black text-lg mb-1 text-white">{t("friendPay.requestSent")}</h3>
                        <p className="text-sm text-[#8B9BB8]">{friendRecipient?.name}</p>
                        <CheckoutOutlineButton className="mt-4" onClick={() => setBuyNowOpen(false)}>
                          {t("buttons.close", { defaultValue: "Fèmen" })}
                        </CheckoutOutlineButton>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Friend Pay Confirmation Dialog ── */}
      <Dialog open={friendConfirmOpen} onOpenChange={v => { if (!friendSending) setFriendConfirmOpen(v); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              {t("friendPay.warningTitle")}
            </DialogTitle>
          </DialogHeader>
          {friendRecipient && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 bg-muted/40 rounded-2xl">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={friendRecipient.avatar ?? undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary font-bold text-lg">{friendRecipient.name?.[0]}</AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-bold">{friendRecipient.name}</p>
                </div>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                <p className="text-sm text-amber-800 dark:text-amber-300">⚠️ {t("friendPay.warningText")}</p>
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2 flex-col sm:flex-row pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setFriendConfirmOpen(false)} disabled={friendSending}>
              {t("friendPay.cancelBtn")}
            </Button>
            <Button className="flex-1" onClick={handleFriendPayRequest} disabled={friendSending}>
              {friendSending ? <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : (
                <><Send className="h-4 w-4 mr-1.5" /> {t("friendPay.confirmBtn")}</>
              )}
            </Button>
          </DialogFooter>
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
