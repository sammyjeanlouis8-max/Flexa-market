import type { SavedCheckoutAddress } from "@/lib/savedCheckoutAddress";

export type CheckoutPaymentMethod = "stripe" | "wallet";
export type CheckoutDeliveryTier = "regular" | "rapid" | "express" | "pickup";

export type CheckoutSession = {
  listingId: number;
  quantity: number;
  offerId?: number | null;
  offerPriceUsd?: number | null;
  promoCode: string;
  promoDiscountUsd: number;
  promoValidatedCode: string | null;
  address: SavedCheckoutAddress;
  addressLabel: "home" | "work" | "other";
  deliveryTier: CheckoutDeliveryTier;
  deliveryMethod: "motorcycle" | "car";
  deliveryFeeUsd: number;
  selectedCarrier: string | null;
  tipUsd: number;
  paymentMethod: CheckoutPaymentMethod;
  idempotencyKey: string;
  result?: {
    txId: number | null;
    amountPaid: number;
    paymentMethod: CheckoutPaymentMethod;
    paymentRef?: string | null;
    discountAmount?: number;
  };
  updatedAt: number;
};

const keyFor = (listingId: number) => `flexamarket_premium_checkout_${listingId}`;

export function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `ck-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyCheckoutSession(listingId: number, seed?: Partial<CheckoutSession>): CheckoutSession {
  return {
    listingId,
    quantity: 1,
    offerId: null,
    offerPriceUsd: null,
    promoCode: "",
    promoDiscountUsd: 0,
    promoValidatedCode: null,
    address: {
      name: "",
      phone: "",
      email: "",
      street: "",
      city: "",
      region: "",
      zip: "",
    },
    addressLabel: "home",
    deliveryTier: "rapid",
    deliveryMethod: "motorcycle",
    deliveryFeeUsd: 0,
    selectedCarrier: null,
    tipUsd: 0,
    paymentMethod: "stripe",
    idempotencyKey: createIdempotencyKey(),
    updatedAt: Date.now(),
    ...seed,
  };
}

export function readCheckoutSession(listingId: number): CheckoutSession | null {
  try {
    const raw = sessionStorage.getItem(keyFor(listingId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CheckoutSession;
    if (!parsed || parsed.listingId !== listingId) return null;
    // Expire after 2 hours
    if (Date.now() - (parsed.updatedAt ?? 0) > 2 * 60 * 60 * 1000) {
      clearCheckoutSession(listingId);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCheckoutSession(session: CheckoutSession): void {
  try {
    sessionStorage.setItem(
      keyFor(session.listingId),
      JSON.stringify({ ...session, updatedAt: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export function clearCheckoutSession(listingId: number): void {
  try {
    sessionStorage.removeItem(keyFor(listingId));
  } catch {
    /* ignore */
  }
}

/** Haiti / DR geography helper (matches ListingDetail). */
export function isLocalDeliveryCountry(country: string | null | undefined): boolean {
  return country === "Haiti" || country === "Dominican Republic";
}

/**
 * Flexa local motorcycle/car tiers apply only when BOTH the listing and the
 * viewer are in Haiti (not Dominican Republic — DR uses seller carriers).
 */
export function isHaitiLocalDelivery(
  listingCountry: string | null | undefined,
  viewerCountry: string | null | undefined,
): boolean {
  return (
    listingCountry === "Haiti" &&
    isLocalDeliveryCountry(viewerCountry)
  );
}

export const LOCAL_DELIVERY_TIERS: {
  id: CheckoutDeliveryTier;
  label: string;
  description: string;
  feeUsd: number;
}[] = [
  { id: "regular", label: "Standard Delivery", description: "Economy delivery within the network", feeUsd: 10 },
  { id: "rapid", label: "Rapid Delivery", description: "Faster local delivery", feeUsd: 15 },
  { id: "express", label: "Express Delivery", description: "Priority local delivery", feeUsd: 25 },
];
