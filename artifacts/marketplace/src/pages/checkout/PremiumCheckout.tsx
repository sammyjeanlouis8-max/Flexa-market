import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useRoute } from "wouter";
import {
  Ticket, MapPin, Truck, CreditCard, Lock, Check, Copy, Loader2,
  ShoppingBag, Package, Pencil, Plus, ChevronRight,
} from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useToast } from "@/hooks/use-toast";
import { apiFetch } from "@/lib/api";
import { readSavedCheckoutAddress, saveCheckoutAddress } from "@/lib/savedCheckoutAddress";
import { listingCarriersForCountry } from "@/lib/listingCarriers";
import CheckoutShell, { type CheckoutProgressStep } from "./CheckoutShell";
import {
  clearCheckoutSession,
  createIdempotencyKey,
  emptyCheckoutSession,
  isHaitiLocalDelivery,
  LOCAL_DELIVERY_TIERS,
  readCheckoutSession,
  writeCheckoutSession,
  type CheckoutDeliveryTier,
  type CheckoutPaymentMethod,
  type CheckoutSession,
} from "./checkoutSession";

type ListingLite = {
  id: number;
  title: string;
  price: number;
  currency?: string | null;
  country?: string | null;
  city?: string | null;
  images?: string[];
  status: string;
  sellerId: number;
  shippingCost?: number | null;
  shippingCarriers?: string[] | null;
  deliveryMethod?: string | null;
  weightLbs?: number | null;
};

type LoyaltyCampaign = {
  enabled: boolean;
  campaignActive: boolean;
  campaignLabel: string | null;
  effectiveBonus: number;
  threshold: number;
};

function money(n: number) {
  return `$${Math.max(0, n).toFixed(2)}`;
}

function useCheckoutParams() {
  const [, paramsWithStep] = useRoute("/checkout/:listingId/:step");
  const [, paramsRoot] = useRoute("/checkout/:listingId");
  const listingId = parseInt(String(paramsWithStep?.listingId ?? paramsRoot?.listingId ?? "0"), 10);
  const step = (paramsWithStep?.step ?? "promo") as CheckoutProgressStep;
  return { listingId, step };
}

export default function PremiumCheckout() {
  const { listingId, step } = useCheckoutParams();
  const [, setLocation] = useLocation();
  const { user, token, isLoading: authLoading } = useAuth();
  const { toast } = useToast();

  const [listing, setListing] = useState<ListingLite | null>(null);
  const [loadingListing, setLoadingListing] = useState(true);
  const [session, setSession] = useState<CheckoutSession | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [walletBal, setWalletBal] = useState<number | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [processPhase, setProcessPhase] = useState<0 | 1 | 2>(0);
  const [editingAddress, setEditingAddress] = useState(false);
  const [campaign, setCampaign] = useState<LoyaltyCampaign | null>(null);
  const [stripeVerifyError, setStripeVerifyError] = useState<string | null>(null);
  const [stripeVerifying, setStripeVerifying] = useState(false);
  const payLock = useRef(false);
  const stripeVerified = useRef(false);

  const viewerCountry = (user as { country?: string | null } | null)?.country ?? null;
  const isDominican = listing?.country === "Dominican Republic";
  const isDominicanSellerDelivery = isDominican && listing?.deliveryMethod === "self_delivery";
  const local = isHaitiLocalDelivery(listing?.country, viewerCountry);

  const go = useCallback((next: CheckoutProgressStep) => {
    setLocation(`/checkout/${listingId}/${next}`);
  }, [listingId, setLocation]);

  const patch = useCallback((partial: Partial<CheckoutSession>) => {
    setSession(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...partial, updatedAt: Date.now() };
      writeCheckoutSession(next);
      return next;
    });
  }, []);

  // Auth gate
  useEffect(() => {
    if (authLoading) return;
    if (!user || !token) {
      setLocation(`/auth/login?next=${encodeURIComponent(`/checkout/${listingId}/${step}`)}`);
    }
  }, [authLoading, user, token, listingId, step, setLocation]);

  // Load listing + seed session (offer query params supported)
  useEffect(() => {
    if (!listingId || !token) return;
    let cancelled = false;
    (async () => {
      setLoadingListing(true);
      try {
        const data = await apiFetch<ListingLite>(`/api/listings/${listingId}`);
        if (cancelled) return;
        setListing(data);

        const sp = new URLSearchParams(window.location.search);
        const offerIdParam = sp.get("offerId") ?? sp.get("offerPay");
        const offerAmtParam = sp.get("offerAmount");
        const parsedOfferId = offerIdParam ? parseInt(offerIdParam, 10) : NaN;
        const parsedOfferAmt = offerAmtParam ? parseFloat(offerAmtParam) : NaN;
        if (offerIdParam || offerAmtParam) {
          const clean = window.location.pathname;
          window.history.replaceState(null, "", clean);
        }

        const existing = readCheckoutSession(listingId);
        if (existing) {
          const merged = { ...existing };
          if (!isNaN(parsedOfferId) && parsedOfferId > 0) merged.offerId = parsedOfferId;
          if (!isNaN(parsedOfferAmt) && parsedOfferAmt > 0) merged.offerPriceUsd = parsedOfferAmt;
          writeCheckoutSession(merged);
          setSession(merged);
        } else {
          const saved = readSavedCheckoutAddress(user?.id);
          const haitiLocal = isHaitiLocalDelivery(data.country, viewerCountry);
          const seed = emptyCheckoutSession(listingId, {
            address: {
              name: saved.name || user?.name || "",
              phone: saved.phone || user?.phone || "",
              email: saved.email || user?.email || "",
              street: saved.street || "",
              city: saved.city || user?.location || "",
              region: saved.region || "",
              zip: saved.zip || "",
            },
            deliveryFeeUsd: haitiLocal ? 15 : Number(data.shippingCost ?? 0) || 0,
            deliveryTier: haitiLocal ? "rapid" : "regular",
            selectedCarrier: data.country === "Dominican Republic" && data.deliveryMethod === "self_delivery"
              ? "self_delivery"
              : null,
            ...(!isNaN(parsedOfferId) && parsedOfferId > 0 ? { offerId: parsedOfferId } : {}),
            ...(!isNaN(parsedOfferAmt) && parsedOfferAmt > 0 ? { offerPriceUsd: parsedOfferAmt } : {}),
          });
          writeCheckoutSession(seed);
          setSession(seed);
        }
      } catch {
        toast({ title: "Could not load product", variant: "destructive" });
        setLocation(`/listings/${listingId}`);
      } finally {
        if (!cancelled) setLoadingListing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [listingId, token, user?.id, user?.name, user?.phone, user?.email, user?.location, viewerCountry, setLocation, toast]);

  // Real loyalty campaign (no hardcoded promo codes)
  useEffect(() => {
    if (step !== "promo") return;
    fetch("/api/promo/campaign")
      .then(r => r.json())
      .then((d: LoyaltyCampaign) => setCampaign(d))
      .catch(() => setCampaign(null));
  }, [step]);

  // Wallet balance for FM Card
  useEffect(() => {
    if (!token || (step !== "payment" && step !== "review")) return;
    fetch("/api/wallet/balance", { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        const real = d.availableUsd ?? d.balanceUsd ?? 0;
        const promo = d.promoBalance ?? 0;
        setWalletBal(Number(real) + Number(promo));
      })
      .catch(() => setWalletBal(null));
  }, [token, step]);

  // Sync Haiti local delivery fee when tier changes
  useEffect(() => {
    if (!session || !listing) return;
    if (!isHaitiLocalDelivery(listing.country, viewerCountry)) return;
    if (session.deliveryTier === "pickup") {
      if (session.deliveryFeeUsd !== 0) patch({ deliveryFeeUsd: 0 });
      return;
    }
    const tier = LOCAL_DELIVERY_TIERS.find(t => t.id === session.deliveryTier);
    if (tier && session.deliveryFeeUsd !== tier.feeUsd) {
      patch({ deliveryFeeUsd: tier.feeUsd });
    }
  }, [session?.deliveryTier, listing?.country, viewerCountry]); // eslint-disable-line react-hooks/exhaustive-deps

  // Stripe return — verify session before showing success UI
  useEffect(() => {
    if (step !== "success" && step !== "processing") return;
    const sp = new URLSearchParams(window.location.search);
    const sessionId = sp.get("session_id");
    if (!sessionId || stripeVerified.current) return;
    let cancelled = false;
    setStripeVerifying(true);
    setStripeVerifyError(null);
    (async () => {
      try {
        const res = await fetch(`/api/stripe/checkout/session?session_id=${encodeURIComponent(sessionId)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || data.error || data.status !== "paid") {
          setStripeVerifyError(data?.error || "Payment not confirmed");
          setStripeVerifying(false);
          return;
        }
        stripeVerified.current = true;
        const txId = typeof data.transaction?.id === "number" ? data.transaction.id : null;
        const amount = typeof data.amount === "number" ? data.amount : undefined;
        patch({
          result: {
            txId,
            amountPaid: amount ?? (session?.result?.amountPaid ?? 0),
            paymentMethod: "stripe",
            paymentRef: sessionId,
          },
        });
        setStripeVerifying(false);
        if (step !== "success") go("success");
        // Clean query string
        window.history.replaceState(null, "", `/checkout/${listingId}/success`);
      } catch {
        if (!cancelled) {
          setStripeVerifyError("Could not verify payment. Check My Orders before trying again.");
          setStripeVerifying(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [step, token, listingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const priceUsd = useMemo(() => {
    if (!listing) return 0;
    if (session?.offerPriceUsd != null && session.offerPriceUsd > 0) return session.offerPriceUsd;
    return Number(listing.price) || 0;
  }, [listing, session?.offerPriceUsd]);

  const discount = session?.promoDiscountUsd ?? 0;
  const deliveryFee = session?.deliveryFeeUsd ?? 0;
  const subtotal = Math.max(0, priceUsd - discount);
  const total = subtotal + deliveryFee + (session?.tipUsd ?? 0);
  const img = listing?.images?.find(Boolean) ?? null;

  const applyPromo = async () => {
    if (!session || !token) return;
    const code = session.promoCode.trim();
    if (!code) return;
    setPromoBusy(true);
    setPromoError(null);
    try {
      const res = await fetch("/api/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code, orderValue: priceUsd }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPromoError(data?.error || "Invalid promo code");
        patch({ promoDiscountUsd: 0, promoValidatedCode: null });
        return;
      }
      patch({
        promoDiscountUsd: Number(data.discountAmount) || 0,
        promoValidatedCode: data.code ?? code,
        promoCode: data.code ?? code,
      });
      toast({ title: "Promo applied", description: `You save ${money(Number(data.discountAmount) || 0)}` });
    } catch {
      setPromoError("Network error — try again");
    } finally {
      setPromoBusy(false);
    }
  };

  const clearPromo = () => {
    patch({ promoCode: "", promoDiscountUsd: 0, promoValidatedCode: null });
    setPromoError(null);
  };

  const addressValid = !!(
    session?.address.name.trim().length && session.address.name.trim().length >= 2 &&
    session?.address.phone.replace(/\D/g, "").length >= 6 &&
    session?.address.street.trim().length >= 3 &&
    session?.address.city.trim().length >= 2 &&
    session?.address.region.trim().length >= 2
  );

  const rememberAddress = () => {
    if (!session || !user?.id) return;
    saveCheckoutAddress(user.id, session.address);
  };

  const backFrom = () => {
    if (step === "promo") setLocation(`/listings/${listingId}`);
    else if (step === "address") go("promo");
    else if (step === "delivery") go("address");
    else if (step === "payment") go("delivery");
    else if (step === "review") go("payment");
    else if (step === "success" || step === "confirmed") setLocation("/");
    else setLocation(`/listings/${listingId}`);
  };

  const stripeBody = () => {
    if (!session || !listing) return {};
    return {
      listingId,
      shippingName: session.address.name.trim(),
      shippingPhone: session.address.phone.trim(),
      shippingEmail: session.address.email?.trim() || undefined,
      shippingStreet: session.address.street.trim(),
      shippingCity: session.address.city.trim(),
      shippingRegion: session.address.region.trim(),
      shippingZip: session.address.zip?.trim() || undefined,
      deliveryType: session.deliveryTier === "pickup" ? "pickup" : "delivery",
      deliveryFeeUsd: session.deliveryTier === "pickup" ? undefined : (session.deliveryFeeUsd > 0 ? session.deliveryFeeUsd : undefined),
      deliveryMethod: isDominican
        ? (session.selectedCarrier ?? undefined)
        : local
          ? session.deliveryMethod
          : (session.selectedCarrier ?? undefined),
      deliveryPickupCity: local && session.deliveryTier !== "pickup" ? listing.city ?? undefined : undefined,
      deliveryTipUsd: local && session.tipUsd > 0 ? session.tipUsd : undefined,
      ...(session.offerId ? { offerId: session.offerId } : {}),
    };
  };

  const payWithWallet = async () => {
    if (!session || !token || !listing || payLock.current) return;
    if (walletBal != null && walletBal < total - 0.001) {
      toast({
        title: "Insufficient FM Card balance",
        description: `You need ${money(total)} but have ${money(walletBal)}.`,
        variant: "destructive",
      });
      return;
    }
    payLock.current = true;
    setPayBusy(true);
    go("processing");
    setProcessPhase(0);
    try {
      await new Promise(r => setTimeout(r, 450));
      setProcessPhase(1);
      const res = await fetch(`/api/listings/${listingId}/purchase`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": session.idempotencyKey,
        },
        body: JSON.stringify({
          paymentMethod: "wallet",
          paymentRef: `WALLET-${session.idempotencyKey}`,
          promoCode: session.promoValidatedCode ?? undefined,
          ...(session.offerId ? { offerId: session.offerId } : {}),
          deliveryType: session.deliveryTier === "pickup" ? "pickup" : "delivery",
          deliveryFeeUsd: session.deliveryTier === "pickup" ? undefined : (session.deliveryFeeUsd > 0 ? session.deliveryFeeUsd : undefined),
          deliveryMethod: isDominican
            ? (session.selectedCarrier ?? undefined)
            : local
              ? session.deliveryMethod
              : (session.selectedCarrier ?? undefined),
          deliveryPickupCity: local && session.deliveryTier !== "pickup" ? listing.city ?? undefined : undefined,
          deliveryTipUsd: local && session.tipUsd > 0 ? session.tipUsd : undefined,
          shipping: {
            name: session.address.name.trim(),
            phone: session.address.phone.trim(),
            email: session.address.email?.trim() || undefined,
            street: session.address.street.trim(),
            city: session.address.city.trim(),
            region: session.address.region.trim(),
            zip: session.address.zip?.trim() || undefined,
          },
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast({ title: "Payment failed", description: data?.error || "Please try again", variant: "destructive" });
        go("review");
        patch({ idempotencyKey: createIdempotencyKey() });
        return;
      }
      setProcessPhase(2);
      rememberAddress();
      const txId = typeof data.txId === "number" ? data.txId : null;
      patch({
        result: {
          txId,
          amountPaid: total,
          paymentMethod: "wallet",
          paymentRef: `WALLET-${session.idempotencyKey}`,
          discountAmount: Number(data.discountAmount) || discount,
        },
      });
      await new Promise(r => setTimeout(r, 500));
      go("success");
    } catch {
      toast({ title: "Network error", description: "Please try again", variant: "destructive" });
      go("review");
      patch({ idempotencyKey: createIdempotencyKey() });
    } finally {
      payLock.current = false;
      setPayBusy(false);
    }
  };

  const payWithStripe = async () => {
    if (!session || !token || payLock.current) return;
    payLock.current = true;
    setPayBusy(true);
    go("processing");
    setProcessPhase(0);
    try {
      setProcessPhase(1);
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "Idempotency-Key": session.idempotencyKey,
        },
        body: JSON.stringify(stripeBody()),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        toast({ title: "Payment error", description: data?.error || "Could not start Stripe checkout", variant: "destructive" });
        go("review");
        patch({ idempotencyKey: createIdempotencyKey() });
        return;
      }
      rememberAddress();
      setProcessPhase(2);
      window.location.href = data.url;
    } catch {
      toast({ title: "Network error", description: "Please try again", variant: "destructive" });
      go("review");
      patch({ idempotencyKey: createIdempotencyKey() });
    } finally {
      payLock.current = false;
      setPayBusy(false);
    }
  };

  const confirmPay = async () => {
    if (!session || payBusy || payLock.current) return;
    if (session.paymentMethod === "wallet") await payWithWallet();
    else await payWithStripe();
  };

  const carrierOptions = useMemo(() => {
    if (!listing) return [] as string[];
    if (isDominicanSellerDelivery) return ["self_delivery"];
    if (isDominican) {
      const fromListing = (listing.shippingCarriers ?? []).filter(c =>
        listingCarriersForCountry("Dominican Republic").includes(c),
      );
      return fromListing.length ? fromListing : [...listingCarriersForCountry("Dominican Republic")];
    }
    if (listing.shippingCarriers?.length) return [...listing.shippingCarriers];
    return [...listingCarriersForCountry(listing.country ?? "")];
  }, [listing, isDominican, isDominicanSellerDelivery]);

  if (authLoading || loadingListing || !session || !listing) {
    return (
      <div className="fm-checkout">
        <div className="fm-checkout-shell" style={{ alignItems: "center", justifyContent: "center" }}>
          <div className="fm-spin" />
          <p style={{ marginTop: 12, color: "var(--ck-muted)" }}>Preparing checkout…</p>
        </div>
      </div>
    );
  }

  if (listing.status !== "available") {
    return (
      <CheckoutShell step="promo" onBack={() => setLocation(`/listings/${listingId}`)} hideProgress>
        <h1 className="fm-checkout-title">Unavailable</h1>
        <p className="fm-checkout-subtitle">This product is no longer available for purchase.</p>
        <button type="button" className="fm-btn-primary" style={{ marginTop: 16 }} onClick={() => setLocation("/")}>
          Continue Shopping
        </button>
      </CheckoutShell>
    );
  }

  // ── PROMO ──────────────────────────────────────────────────────────────
  if (step === "promo") {
    return (
      <CheckoutShell
        step="promo"
        onBack={backFrom}
        footer={
          <button type="button" className="fm-btn-primary w-full" style={{ width: "100%" }} onClick={() => go("address")} data-testid="checkout-continue-promo">
            Continue <ChevronRight className="h-4 w-4" />
          </button>
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="fm-checkout-title">Apply Promo Code</h1>
            <p className="fm-checkout-subtitle">Save more on your order. Optional.</p>
          </div>
          <div className="text-4xl" aria-hidden>🎁</div>
        </div>

        <div className="fm-glass" style={{ padding: 14 }}>
          {session.promoValidatedCode ? (
            <div className="flex items-center gap-2">
              <Ticket className="h-4 w-4 text-green-400" />
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm">{session.promoValidatedCode}</p>
                <p className="text-xs" style={{ color: "#86efac" }}>Saved {money(session.promoDiscountUsd)}</p>
              </div>
              <button type="button" onClick={clearPromo} className="text-xs" style={{ color: "var(--ck-muted)" }}>Remove</button>
            </div>
          ) : (
            <>
              <div className="fm-checkout-input-row">
                <div className="fm-checkout-field">
                  <Ticket className="fm-checkout-field-icon h-4 w-4" />
                  <input
                    className="fm-checkout-input"
                    placeholder="Enter promo code"
                    value={session.promoCode}
                    onChange={e => patch({ promoCode: e.target.value.toUpperCase() })}
                    onKeyDown={e => e.key === "Enter" && applyPromo()}
                    data-testid="checkout-promo-input"
                  />
                </div>
                <button type="button" className="fm-btn-apply" onClick={applyPromo} disabled={!session.promoCode.trim() || promoBusy} data-testid="checkout-promo-apply">
                  {promoBusy ? <span className="fm-spin" /> : "Apply"}
                </button>
              </div>
              {promoError && <p className="text-xs mt-2" style={{ color: "var(--ck-danger)" }}>{promoError}</p>}
            </>
          )}
        </div>

        {campaign?.campaignActive && (
          <div className="fm-option is-selected" style={{ cursor: "default" }}>
            <div className="fm-radio" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">{campaign.campaignLabel || "Loyalty bonus"}</span>
                <span className="fm-badge fm-badge-popular">Live</span>
              </div>
              <p className="text-xs mt-0.5" style={{ color: "var(--ck-muted)" }}>
                Earn ${campaign.effectiveBonus.toFixed(2)} promo credit after spending ${campaign.threshold.toFixed(2)}
              </p>
            </div>
          </div>
        )}

        <div className="fm-glass" style={{ padding: 14 }}>
          <div className="fm-checkout-summary-row">
            <span>Product price (delivery not included)</span>
            <strong>{money(priceUsd)}</strong>
          </div>
          {discount > 0 && (
            <div className="fm-checkout-summary-row mt-2">
              <span>Discount</span>
              <strong style={{ color: "#86efac" }}>−{money(discount)}</strong>
            </div>
          )}
          {discount > 0 && (
            <div className="fm-checkout-summary-row mt-2">
              <span>Subtotal after promo</span>
              <strong>{money(subtotal)}</strong>
            </div>
          )}
        </div>
      </CheckoutShell>
    );
  }

  // ── ADDRESS ────────────────────────────────────────────────────────────
  if (step === "address") {
    const saved = readSavedCheckoutAddress(user?.id);
    const hasSaved = !!(saved.name && saved.phone && saved.city && saved.street && saved.region);
    return (
      <CheckoutShell
        step="address"
        onBack={backFrom}
        footer={
          <button
            type="button"
            className="fm-btn-primary"
            style={{ width: "100%" }}
            disabled={!addressValid}
            onClick={() => { rememberAddress(); go("delivery"); }}
            data-testid="checkout-continue-address"
          >
            Continue <ChevronRight className="h-4 w-4" />
          </button>
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="fm-checkout-title">Delivery Address</h1>
            <p className="fm-checkout-subtitle">Where should we deliver this order?</p>
          </div>
          <MapPin className="h-7 w-7" style={{ color: "var(--ck-blue-2)" }} />
        </div>

        {hasSaved && !editingAddress && (
          <button
            type="button"
            className={`fm-option ${session.addressLabel === "home" || session.addressLabel === "work" ? "is-selected" : ""}`}
            onClick={() => patch({
              addressLabel: "home",
              address: {
                name: saved.name || "",
                phone: saved.phone || "",
                email: saved.email || "",
                street: saved.street || "",
                city: saved.city || "",
                region: saved.region || "",
                zip: saved.zip || "",
              },
            })}
          >
            <div className="fm-radio" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-bold text-sm">{session.addressLabel === "work" ? "Work" : "Home"}</p>
                <button type="button" className="text-xs font-semibold" style={{ color: "var(--ck-blue-2)" }} onClick={e => { e.stopPropagation(); setEditingAddress(true); }}>
                  Edit
                </button>
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--ck-muted)" }}>
                {[saved.name, saved.street, saved.city, saved.region].filter(Boolean).join(" · ")}
              </p>
              <p className="text-xs" style={{ color: "var(--ck-muted)" }}>{saved.phone}</p>
            </div>
          </button>
        )}

        <button
          type="button"
          className="fm-option"
          onClick={() => setEditingAddress(true)}
        >
          <Plus className="h-5 w-5 mt-0.5" style={{ color: "var(--ck-blue-2)" }} />
          <span className="font-bold text-sm">Add New Address</span>
        </button>

        {(editingAddress || !hasSaved) && (
          <div className="fm-glass space-y-3" style={{ padding: 14 }}>
            {(
              [
                ["name", "Full name", "name"],
                ["phone", "Phone", "tel"],
                ["street", "Street address", "street-address"],
                ["city", "City", "address-level2"],
                ["region", "Region / State", "address-level1"],
                ["zip", "ZIP (optional)", "postal-code"],
                ["email", "Email (optional)", "email"],
              ] as const
            ).map(([key, label, auto]) => (
              <div key={key}>
                <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--ck-muted)" }}>{label}</label>
                <input
                  className="fm-checkout-input"
                  style={{ paddingLeft: 14, width: "100%", marginTop: 6 }}
                  value={(session.address as Record<string, string>)[key] ?? ""}
                  autoComplete={auto}
                  onChange={e => patch({ address: { ...session.address, [key]: e.target.value }, addressLabel: "other" })}
                />
              </div>
            ))}
            {!addressValid && (
              <p className="text-xs" style={{ color: "var(--ck-muted)" }}>
                Name, phone, street, city, and region are required.
              </p>
            )}
          </div>
        )}
      </CheckoutShell>
    );
  }

  // ── DELIVERY ───────────────────────────────────────────────────────────
  if (step === "delivery") {
    const canContinue = local
      ? true
      : !!(session.selectedCarrier);
    return (
      <CheckoutShell
        step="delivery"
        onBack={backFrom}
        footer={
          <button
            type="button"
            className="fm-btn-primary"
            style={{ width: "100%" }}
            disabled={!canContinue}
            onClick={() => go("payment")}
            data-testid="checkout-continue-delivery"
          >
            Continue <ChevronRight className="h-4 w-4" />
          </button>
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="fm-checkout-title">Delivery Method</h1>
            <p className="fm-checkout-subtitle">Choose how you want to receive your order.</p>
          </div>
          <Truck className="h-7 w-7" style={{ color: "var(--ck-blue-2)" }} />
        </div>

        {local ? (
          <div className="space-y-2">
            {LOCAL_DELIVERY_TIERS.map(tier => (
              <button
                key={tier.id}
                type="button"
                className={`fm-option ${session.deliveryTier === tier.id ? "is-selected" : ""}`}
                onClick={() => patch({ deliveryTier: tier.id as CheckoutDeliveryTier, deliveryFeeUsd: tier.feeUsd })}
              >
                <div className="fm-radio" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-sm">{tier.label}</p>
                    <p className="font-black text-sm">{money(tier.feeUsd)}</p>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: "var(--ck-muted)" }}>{tier.description}</p>
                </div>
              </button>
            ))}
            <button
              type="button"
              className={`fm-option ${session.deliveryTier === "pickup" ? "is-selected" : ""}`}
              onClick={() => patch({ deliveryTier: "pickup", deliveryFeeUsd: 0 })}
            >
              <div className="fm-radio" />
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-sm">Pickup</p>
                  <p className="font-black text-sm">{money(0)}</p>
                </div>
                <p className="text-xs mt-0.5" style={{ color: "var(--ck-muted)" }}>Collect from the seller — no delivery fee</p>
              </div>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {carrierOptions.map((carrier) => {
              const fee = Number(listing.shippingCost ?? 0) || 0;
              const label = carrier === "self_delivery" ? "Seller delivery" : carrier;
              return (
                <button
                  key={carrier}
                  type="button"
                  className={`fm-option ${session.selectedCarrier === carrier ? "is-selected" : ""}`}
                  onClick={() => patch({ selectedCarrier: carrier, deliveryFeeUsd: fee, deliveryTier: "regular" })}
                >
                  <div className="fm-radio" />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-sm">{label}</p>
                      <p className="font-black text-sm">{fee > 0 ? money(fee) : money(0)}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <div className="fm-glass space-y-2" style={{ padding: 14 }}>
          <div className="fm-checkout-summary-row"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
          <div className="fm-checkout-summary-row"><span>Delivery fee</span><strong>{money(deliveryFee)}</strong></div>
          <div className="fm-checkout-summary-row" style={{ paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <span className="fm-checkout-total">Total</span>
            <strong className="fm-checkout-total">{money(total)}</strong>
          </div>
        </div>
      </CheckoutShell>
    );
  }

  // ── PAYMENT ────────────────────────────────────────────────────────────
  if (step === "payment") {
    const fmOk = walletBal == null || walletBal >= total - 0.001;
    return (
      <CheckoutShell
        step="payment"
        onBack={backFrom}
        footer={
          <button type="button" className="fm-btn-primary" style={{ width: "100%" }} onClick={() => go("review")} data-testid="checkout-continue-payment">
            Continue to Review <ChevronRight className="h-4 w-4" />
          </button>
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="fm-checkout-title">Payment Method</h1>
            <p className="fm-checkout-subtitle">Select one payment method for this purchase.</p>
          </div>
          <CreditCard className="h-7 w-7" style={{ color: "var(--ck-blue-2)" }} />
        </div>

        <button
          type="button"
          className={`fm-option ${session.paymentMethod === "stripe" ? "is-selected" : ""}`}
          onClick={() => patch({ paymentMethod: "stripe" as CheckoutPaymentMethod })}
          data-testid="checkout-pay-stripe"
        >
          <div className="fm-radio" />
          <div className="flex-1">
            <p className="font-bold text-sm">Stripe</p>
            <p className="text-xs mt-1" style={{ color: "var(--ck-muted)" }}>
              Pay securely using a credit or debit card through Stripe.
            </p>
          </div>
        </button>

        <button
          type="button"
          className={`fm-option ${session.paymentMethod === "wallet" ? "is-selected" : ""}`}
          onClick={() => patch({ paymentMethod: "wallet" as CheckoutPaymentMethod })}
          data-testid="checkout-pay-fm-card"
        >
          <div className="fm-radio" />
          <div className="flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className="font-bold text-sm">FM Card</p>
              {walletBal != null && (
                <p className="text-xs font-bold" style={{ color: fmOk ? "#86efac" : "var(--ck-danger)" }}>
                  Balance {money(walletBal)}
                </p>
              )}
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--ck-muted)" }}>
              Pay using your available Flexa Market Card balance.
            </p>
            {walletBal != null && !fmOk && (
              <p className="text-xs mt-1" style={{ color: "var(--ck-danger)" }}>
                Insufficient balance for this order.
              </p>
            )}
          </div>
        </button>

        <div className="fm-glass" style={{ padding: 14 }}>
          <div className="fm-checkout-summary-row">
            <span>Total to Pay</span>
            <strong className="fm-checkout-total">{money(total)}</strong>
          </div>
        </div>
      </CheckoutShell>
    );
  }

  // ── REVIEW ─────────────────────────────────────────────────────────────
  if (step === "review") {
    const deliveryLabel = session.deliveryTier === "pickup"
      ? "Pickup"
      : LOCAL_DELIVERY_TIERS.find(t => t.id === session.deliveryTier)?.label
        ?? (session.selectedCarrier === "self_delivery" ? "Seller delivery" : session.selectedCarrier)
        ?? "Delivery";
    return (
      <CheckoutShell
        step="review"
        onBack={backFrom}
        footer={
          <button
            type="button"
            className="fm-btn-primary"
            style={{ width: "100%" }}
            disabled={payBusy}
            onClick={confirmPay}
            data-testid="checkout-pay-button"
          >
            <Lock className="h-4 w-4" /> Pay {money(total)}
          </button>
        }
      >
        <h1 className="fm-checkout-title">Review & Confirm</h1>
        <p className="fm-checkout-subtitle">Confirm your order before paying.</p>

        <div className="fm-glass flex gap-3" style={{ padding: 14 }}>
          <div className="w-16 h-16 rounded-xl overflow-hidden bg-black/30 shrink-0">
            {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <Package className="m-auto mt-4 h-7 w-7 opacity-40" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm line-clamp-2">{listing.title}</p>
            <p className="text-xs mt-1" style={{ color: "var(--ck-muted)" }}>Qty: {session.quantity}</p>
            <p className="font-black text-sm mt-1">{money(priceUsd)}</p>
          </div>
        </div>

        {([
          ["Delivery Address", [session.address.name, session.address.street, session.address.city].filter(Boolean).join(" · "), "address"],
          ["Delivery Method", `${deliveryLabel} · ${money(deliveryFee)}`, "delivery"],
          ["Payment Method", session.paymentMethod === "stripe" ? "Stripe" : "FM Card", "payment"],
        ] as const).map(([label, value, editStep]) => (
          <div key={label} className="fm-glass" style={{ padding: 14 }}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--ck-muted)" }}>{label}</p>
                <p className="text-sm mt-1 font-semibold">{value}</p>
              </div>
              <button type="button" className="text-xs font-bold inline-flex items-center gap-1" style={{ color: "var(--ck-blue-2)" }} onClick={() => go(editStep)}>
                <Pencil className="h-3 w-3" /> Edit
              </button>
            </div>
          </div>
        ))}

        <div className="fm-glass space-y-2" style={{ padding: 14 }}>
          <div className="fm-checkout-summary-row"><span>Subtotal</span><strong>{money(priceUsd)}</strong></div>
          {discount > 0 && <div className="fm-checkout-summary-row"><span>Discount ({session.promoValidatedCode})</span><strong style={{ color: "#86efac" }}>−{money(discount)}</strong></div>}
          <div className="fm-checkout-summary-row"><span>Delivery</span><strong>{money(deliveryFee)}</strong></div>
          <div className="fm-checkout-summary-row" style={{ paddingTop: 8, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            <span className="fm-checkout-total">Total to Pay</span>
            <strong className="fm-checkout-total">{money(total)}</strong>
          </div>
        </div>
      </CheckoutShell>
    );
  }

  // ── PROCESSING ─────────────────────────────────────────────────────────
  if (step === "processing") {
    const phases = ["Verifying payment", "Confirming order", "Finalizing purchase"];
    return (
      <CheckoutShell step="processing" hideProgress>
        <div className="fm-process-ring" aria-hidden>
          <div className="fm-process-ring-inner">
            <CreditCard className="h-9 w-9" style={{ color: "var(--ck-blue-2)" }} />
          </div>
        </div>
        <h1 className="fm-checkout-title text-center" style={{ textAlign: "center", marginTop: 20 }}>Processing Payment</h1>
        <p className="fm-checkout-subtitle text-center" style={{ textAlign: "center" }}>Please wait — do not close this page.</p>
        <div className="fm-glass space-y-3" style={{ padding: 16, marginTop: 8 }}>
          {phases.map((label, i) => (
            <div key={label} className="flex items-center gap-3 text-sm">
              {i < processPhase ? (
                <span className="w-5 h-5 rounded-full grid place-items-center" style={{ background: "rgba(34,197,94,0.25)", color: "#86efac" }}><Check className="h-3.5 w-3.5" /></span>
              ) : i === processPhase ? (
                <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--ck-blue-2)" }} />
              ) : (
                <span className="w-5 h-5 rounded-full border border-white/20" />
              )}
              <span style={{ color: i <= processPhase ? "var(--ck-text)" : "var(--ck-muted)" }}>{label}</span>
            </div>
          ))}
        </div>
      </CheckoutShell>
    );
  }

  // ── SUCCESS ────────────────────────────────────────────────────────────
  if (step === "success") {
    if (stripeVerifying) {
      return (
        <CheckoutShell step="success" hideProgress>
          <div className="fm-process-ring" aria-hidden>
            <div className="fm-process-ring-inner">
              <Loader2 className="h-9 w-9 animate-spin" style={{ color: "var(--ck-blue-2)" }} />
            </div>
          </div>
          <h1 className="fm-checkout-title" style={{ textAlign: "center", marginTop: 20 }}>Confirming Payment</h1>
          <p className="fm-checkout-subtitle" style={{ textAlign: "center" }}>Verifying with Stripe — please wait.</p>
        </CheckoutShell>
      );
    }
    if (stripeVerifyError) {
      return (
        <CheckoutShell step="success" hideProgress onBack={() => setLocation(`/checkout/${listingId}/review`)}>
          <h1 className="fm-checkout-title" style={{ textAlign: "center" }}>Payment Not Confirmed</h1>
          <p className="fm-checkout-subtitle" style={{ textAlign: "center" }}>{stripeVerifyError}</p>
          <div className="space-y-2" style={{ marginTop: 16 }}>
            <button type="button" className="fm-btn-primary" style={{ width: "100%" }} onClick={() => setLocation("/orders")}>
              My Orders
            </button>
            <button type="button" className="fm-btn-ghost" style={{ width: "100%" }} onClick={() => go("review")}>
              Try Again
            </button>
          </div>
        </CheckoutShell>
      );
    }
    if (!session.result) {
      return (
        <CheckoutShell step="success" hideProgress onBack={() => go("review")}>
          <h1 className="fm-checkout-title" style={{ textAlign: "center" }}>No confirmed payment</h1>
          <p className="fm-checkout-subtitle" style={{ textAlign: "center" }}>
            Complete checkout to see your confirmation here.
          </p>
          <button type="button" className="fm-btn-primary" style={{ width: "100%", marginTop: 16 }} onClick={() => go("review")}>
            Back to Review
          </button>
        </CheckoutShell>
      );
    }
    const result = session.result;
    const amount = result.amountPaid ?? total;
    const method = result.paymentMethod === "wallet" ? "FM Card" : "Stripe";
    const ref = result.paymentRef || (result.txId ? `TXN-${result.txId}` : "—");
    return (
      <CheckoutShell step="success" hideProgress>
        <div className="fm-success-burst"><Check className="h-10 w-10 text-white" strokeWidth={3} /></div>
        <h1 className="fm-checkout-title" style={{ textAlign: "center" }}>Payment Successful!</h1>
        <p className="fm-checkout-subtitle" style={{ textAlign: "center" }}>Your payment has been confirmed.</p>
        <div className="fm-glass space-y-3" style={{ padding: 16, marginTop: 8 }}>
          <div className="fm-checkout-summary-row"><span>Amount Paid</span><strong>{money(amount)}</strong></div>
          <div className="fm-checkout-summary-row"><span>Payment Method</span><strong>{method}</strong></div>
          <div className="fm-checkout-summary-row"><span>Transaction</span><strong className="truncate">{ref}</strong></div>
        </div>
        <div className="space-y-2" style={{ marginTop: 8 }}>
          <button
            type="button"
            className="fm-btn-primary"
            style={{ width: "100%" }}
            onClick={() => {
              if (result.txId) setLocation(`/orders/${result.txId}`);
              else go("confirmed");
            }}
          >
            View Order
          </button>
          <button type="button" className="fm-btn-ghost" style={{ width: "100%" }} onClick={() => go("confirmed")}>
            Continue
          </button>
        </div>
      </CheckoutShell>
    );
  }

  // ── CONFIRMED ──────────────────────────────────────────────────────────
  if (!session.result) {
    return (
      <CheckoutShell step="confirmed" hideProgress onBack={() => go("review")}>
        <h1 className="fm-checkout-title" style={{ textAlign: "center" }}>No order yet</h1>
        <p className="fm-checkout-subtitle" style={{ textAlign: "center" }}>
          Finish payment to see order confirmation and tracking.
        </p>
        <button type="button" className="fm-btn-primary" style={{ width: "100%", marginTop: 16 }} onClick={() => go("review")}>
          Back to Review
        </button>
      </CheckoutShell>
    );
  }

  const txId = session.result.txId;
  const orderLabel = txId ? `FM-${txId}` : "Pending confirmation";
  return (
    <CheckoutShell step="confirmed" hideProgress>
      <div style={{ textAlign: "center", fontSize: 56 }} aria-hidden>📦</div>
      <h1 className="fm-checkout-title" style={{ textAlign: "center" }}>Order Confirmed!</h1>
      <p className="fm-checkout-subtitle" style={{ textAlign: "center" }}>Thank you for shopping on Flexa Market.</p>

      <div className="fm-glass flex items-center justify-between gap-2" style={{ padding: 14 }}>
        <div>
          <p className="text-[11px] font-bold uppercase" style={{ color: "var(--ck-muted)" }}>Order Number</p>
          <p className="font-black text-lg tracking-wide">{orderLabel}</p>
        </div>
        {txId && (
          <button
            type="button"
            className="fm-checkout-back"
            aria-label="Copy order number"
            onClick={() => { navigator.clipboard.writeText(orderLabel); toast({ title: "Copied" }); }}
          >
            <Copy className="h-4 w-4" />
          </button>
        )}
      </div>

      <div className="fm-glass" style={{ padding: 16 }}>
        <ul className="fm-timeline">
          <li className="fm-timeline-item is-done">
            <span className="fm-timeline-dot" />
            <div>
              <p className="font-bold text-sm">Order Placed</p>
              <p className="text-xs" style={{ color: "var(--ck-muted)" }}>{new Date().toLocaleString()}</p>
            </div>
          </li>
          <li className="fm-timeline-item">
            <span className="fm-timeline-dot" />
            <div>
              <p className="font-bold text-sm">Preparing Your Order</p>
              <p className="text-xs" style={{ color: "var(--ck-muted)" }}>Seller will update status soon</p>
            </div>
          </li>
          <li className="fm-timeline-item">
            <span className="fm-timeline-dot" />
            <div>
              <p className="font-bold text-sm">Out for Delivery</p>
              <p className="text-xs" style={{ color: "var(--ck-muted)" }}>Tracking appears when shipping starts</p>
            </div>
          </li>
          <li className="fm-timeline-item">
            <span className="fm-timeline-dot" />
            <div>
              <p className="font-bold text-sm">Delivered</p>
            </div>
          </li>
        </ul>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          className="fm-btn-primary"
          style={{ width: "100%" }}
          onClick={() => {
            if (txId) setLocation(`/orders/${txId}`);
            else setLocation("/orders");
            clearCheckoutSession(listingId);
          }}
        >
          <MapPin className="h-4 w-4" /> Track Order
        </button>
        <button
          type="button"
          className="fm-btn-ghost"
          style={{ width: "100%" }}
          onClick={() => {
            clearCheckoutSession(listingId);
            setLocation("/");
          }}
        >
          <ShoppingBag className="h-4 w-4" /> Continue Shopping
        </button>
      </div>
    </CheckoutShell>
  );
}
