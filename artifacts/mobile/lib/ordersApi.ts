/**
 * Orders — same DigitalOcean APIs as marketplace Orders / OrderDetail.
 */
import { getApiBase } from "./api";

export type PurchaseOrder = {
  id: number;
  amount: number;
  currency: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  orderStatus: string;
  trackingNumber: string | null;
  carrier: string | null;
  trackingStatus: string | null;
  shipmentId: number | null;
  estimatedDelivery: string | null;
  escrowReleased: boolean;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  listingCountry: string | null;
  listingId: number;
  listingTitle: string;
  listingImages: string[] | null;
  sellerId: number;
  sellerName: string | null;
  deliveryStatus: string | null;
  cardRefundStatus?: string | null;
};

export type OrderDetail = {
  orderId: number;
  orderRef: string;
  createdAt: string;
  amount: number;
  currency: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  orderStatus: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  buyerConfirmedAt?: string | null;
  trackingNumber: string | null;
  carrier: string | null;
  trackingStatus: string | null;
  trackingLastUpdated?: string | null;
  deliveryDescription?: string | null;
  driverName?: string | null;
  driverPhone?: string | null;
  deliveryNote?: string | null;
  fmDelivery: {
    id: number;
    status: string | null;
    deliveryMethod?: string | null;
    pickupCity?: string | null;
    deliveryCity?: string | null;
    driverUserId?: number | null;
    acceptedAt?: string | null;
    /** Present only when the authenticated user is the buyer. */
    verificationCode?: string | null;
    pickupPhotoUrl?: string | null;
    dropoffPhotoUrl?: string | null;
    driverInfo?: {
      name?: string | null;
      phone?: string | null;
      avatar?: string | null;
      rating?: number | null;
      vehicleType?: string | null;
      vehicleBrand?: string | null;
      vehicleModel?: string | null;
      vehicleColor?: string | null;
      licensePlateNumber?: string | null;
    } | null;
  } | null;
  escrowReleased: boolean;
  escrowReleasedAt?: string | null;
  autoReleaseAt?: string | null;
  deliveryType?: string | null;
  listingCountry: string | null;
  deliveryMethod?: string | null;
  isHaiti: boolean;
  destinationCountry?: string | null;
  confirmationMode?: string | null;
  carrierPodEligible?: boolean;
  haitiPinConfirmation?: boolean;
  isSeller: boolean;
  isBuyer: boolean;
  isAdminView?: boolean;
  listingCity?: string | null;
  listing: {
    id: number;
    title: string;
    images: string[] | null;
    country?: string | null;
  };
  merchant: {
    id: number;
    name: string;
    phone?: string | null;
    avatar?: string | null;
  };
  buyer: { id: number; name: string | null };
  shipTo: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    street?: string | null;
    city?: string | null;
    region?: string | null;
    zip?: string | null;
    country?: string | null;
  };
};

type AuthOpts = { token: string; signal?: AbortSignal };

async function authed(
  path: string,
  opts: AuthOpts & { method?: string; body?: unknown },
): Promise<Response> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${opts.token}`,
  };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  return fetch(`${getApiBase()}${path}`, {
    method: opts.method ?? (opts.body !== undefined ? "POST" : "GET"),
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });
}

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export async function fetchPurchases(opts: AuthOpts): Promise<PurchaseOrder[]> {
  const res = await authed("/orders/purchases", opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Orders failed (${res.status})`);
  return Array.isArray(data) ? data : [];
}

export async function fetchOrderDetail(
  orderId: number | string,
  opts: AuthOpts,
): Promise<OrderDetail> {
  const res = await authed(`/orders/${orderId}`, opts);
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Order ${orderId} failed (${res.status})`);
  return data as OrderDetail;
}

export type CarrierTracking = {
  trackingNumber?: string | null;
  carrier?: string | null;
  status?: string | null;
  checkpoints?: Array<{
    message?: string;
    status?: string;
    location?: string;
    time?: string;
  }>;
  estimatedDelivery?: string | null;
  error?: string;
};

export async function fetchOrderTracking(
  orderId: number | string,
  opts: AuthOpts,
): Promise<CarrierTracking | null> {
  const res = await authed(`/orders/${orderId}/tracking`, opts);
  if (res.status === 404) return null;
  const data = await readJson(res);
  if (!res.ok) return { error: data.error || `Tracking failed (${res.status})` };
  return data as CarrierTracking;
}

export async function confirmDelivery(
  orderId: number | string,
  opts: AuthOpts,
): Promise<{ ok: boolean; error?: string }> {
  const res = await authed(`/orders/${orderId}/confirm-delivery`, {
    ...opts,
    method: "POST",
    body: {},
  });
  const data = await readJson(res);
  if (!res.ok) return { ok: false, error: data.error || `Confirm failed (${res.status})` };
  return { ok: true };
}
