/**
 * Haiti driver apply + dashboard APIs.
 */
import { getApiBase } from "./api";

type AuthOpts = { token: string; signal?: AbortSignal };

async function readJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

export type DriverApplication = {
  id: number;
  status: string;
  firstName?: string | null;
  lastName?: string | null;
  city?: string | null;
  vehicleType?: string | null;
  adminNote?: string | null;
  callPhone?: string | null;
  whatsappNumber?: string | null;
  address?: string | null;
  dateOfBirth?: string | null;
  vehicleBrand?: string | null;
  vehicleModel?: string | null;
  licensePlateNumber?: string | null;
  workZones?: string | string[] | null;
  photoIdSelfie?: string | null;
  facePhotoHoldingId?: string | null;
  photoLicenseFront?: string | null;
  photoVehicleRegistration?: string | null;
  internetProvider?: string | null;
  createdAt?: string;
  updatedAt?: string;
  reviewedAt?: string | null;
};

export type DriverRecord = {
  id: number;
  userId?: number;
  status: string;
  country?: string | null;
  city?: string | null;
  commune?: string | null;
  department?: string | null;
  workZones?: string[] | string | null;
  vehicleType?: string | null;
  rating?: number;
  deliveryCount?: number;
  earningsTotal?: number;
  isOnline?: boolean;
  facePhotoFront?: string | null;
  photoFront?: string | null;
};

export type DriverStatsResponse = {
  driver: DriverRecord | null;
  stats?: {
    deliveriesToday: number;
    earningsTodayHtg: number;
    earningsWeekHtg: number;
    earningsMonthHtg: number;
    availableCount: number;
    activeCount: number;
    currency: string;
  };
};

export type ZonesPayload = {
  communesByDepartment?: Record<string, string[]>;
  departments?: Record<string, string[]> | string[];
};

export type ApplyPayload = Record<string, unknown>;

export async function fetchMyDriverApplication(opts: AuthOpts): Promise<{
  application: DriverApplication | null;
  driver: DriverRecord | null;
}> {
  const res = await fetch(`${getApiBase()}/delivery/application`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${opts.token}` },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Application failed (${res.status})`);
  return {
    application: data.application ?? null,
    driver: data.driver ?? null,
  };
}

export async function saveDriverDraft(payload: ApplyPayload, opts: AuthOpts) {
  const res = await fetch(`${getApiBase()}/delivery/application/draft`, {
    method: "PUT",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: JSON.stringify(payload),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Draft save failed (${res.status})`);
  return data;
}

export async function submitDriverApplication(payload: ApplyPayload, opts: AuthOpts) {
  const res = await fetch(`${getApiBase()}/delivery/apply`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: JSON.stringify(payload),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Submit failed (${res.status})`);
  return data as {
    application?: DriverApplication;
    applicationId?: string;
  };
}

export async function fetchDriverStats(opts: AuthOpts): Promise<DriverStatsResponse> {
  const res = await fetch(`${getApiBase()}/delivery/driver/stats`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${opts.token}` },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Driver stats failed (${res.status})`);
  return data;
}

export async function fetchDriverZones(opts: AuthOpts): Promise<ZonesPayload> {
  const res = await fetch(`${getApiBase()}/delivery/driver/zones`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${opts.token}` },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Zones failed (${res.status})`);
  return data;
}

export async function patchDriverLocation(
  body: Record<string, unknown>,
  opts: AuthOpts,
) {
  const res = await fetch(`${getApiBase()}/delivery/driver/location`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Update failed (${res.status})`);
  return data;
}

export type BrowseDeliveryJob = {
  id: number;
  deliveryMethod?: string | null;
  pickupAddress?: string | null;
  pickupCity?: string | null;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  country?: string | null;
  status?: string | null;
  feeUsd?: number | null;
  feeLocal?: number | null;
  driverEarnings?: number | null;
  currency?: string | null;
  distanceKm?: number | null;
  listingTitle?: string | null;
  createdAt?: string | null;
};

export type BrowseDeliveriesResponse = {
  deliveries: BrowseDeliveryJob[];
  driverCta?: string;
  driverHasGps?: boolean;
  driverCommune?: string | null;
};

function mapBrowseJob(raw: any): BrowseDeliveryJob {
  return {
    id: Number(raw.id),
    deliveryMethod: raw.deliveryMethod ?? null,
    pickupAddress: raw.pickupAddress ?? null,
    pickupCity: raw.pickupCity ?? null,
    deliveryAddress: raw.deliveryAddress ?? null,
    deliveryCity: raw.deliveryCity ?? null,
    country: raw.country ?? null,
    status: raw.status ?? null,
    feeUsd: raw.feeUsd != null ? Number(raw.feeUsd) : null,
    feeLocal: raw.feeLocal != null ? Number(raw.feeLocal) : null,
    driverEarnings: raw.driverEarnings != null ? Number(raw.driverEarnings) : null,
    currency: raw.currency ?? null,
    distanceKm: raw.distanceKm != null ? Number(raw.distanceKm) : null,
    listingTitle: raw.listingTitle ?? null,
    createdAt: raw.createdAt ?? null,
  };
}

export async function fetchBrowseDeliveries(
  opts: AuthOpts & { country?: string },
): Promise<BrowseDeliveriesResponse> {
  const qs = opts.country ? `?country=${encodeURIComponent(opts.country)}` : "";
  const res = await fetch(`${getApiBase()}/delivery/browse${qs}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${opts.token}` },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Browse failed (${res.status})`);
  const rows = Array.isArray(data.deliveries) ? data.deliveries : [];
  return {
    deliveries: rows.map(mapBrowseJob),
    driverCta: data.driverCta,
    driverHasGps: data.driverHasGps,
    driverCommune: data.driverCommune ?? null,
  };
}

export async function acceptDeliveryJob(deliveryId: number, opts: AuthOpts) {
  const res = await fetch(`${getApiBase()}/delivery/${deliveryId}/accept`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Accept failed (${res.status})`);
  return data;
}

export type DriverJobDetail = {
  id: number;
  orderRef: string;
  status: string;
  listingTitle: string | null;
  listingImage: string | null;
  orderAmount: number | null;
  pickupCity: string | null;
  pickupAddress: string | null;
  deliveryCity: string | null;
  deliveryAddress: string | null;
  distanceKm: number | null;
  driverEarnings: number | null;
  driverEarningsHtg: number | null;
  feeLocal: number | null;
  feeUsd: number | null;
  sellerName: string | null;
  sellerPhone: string | null;
  buyerName: string | null;
  buyerPhone: string | null;
  sellerNote: string | null;
  pinRequired: boolean;
  country: string | null;
  currency?: string | null;
};

export type MyDeliveryJob = {
  id: number;
  status: string | null;
  pickupAddress?: string | null;
  pickupCity?: string | null;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  driverEarnings?: number | null;
  feeLocal?: number | null;
  feeUsd?: number | null;
  currency?: string | null;
  listingTitle?: string | null;
  distanceKm?: number | null;
  createdAt?: string | null;
};

/** Canonical next status for driver-controlled advances (matches server state machine). */
export const DRIVER_NEXT_STATUS: Record<string, string> = {
  driver_assigned: "arrived_pickup",
  arrived_pickup: "picked_up",
  picked_up: "on_the_way",
  on_the_way: "arrived",
};

const ACTIVE_DRIVER_STATUSES = new Set([
  "driver_assigned",
  "arrived_pickup",
  "picked_up",
  "on_the_way",
  "arrived",
]);

export function isActiveDriverJobStatus(status: string | null | undefined): boolean {
  return Boolean(status && ACTIVE_DRIVER_STATUSES.has(status));
}

export async function fetchMyDeliveries(opts: AuthOpts): Promise<MyDeliveryJob[]> {
  const res = await fetch(`${getApiBase()}/delivery/my`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${opts.token}` },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `My deliveries failed (${res.status})`);
  const rows = Array.isArray(data.deliveries) ? data.deliveries : [];
  return rows.map((raw: any): MyDeliveryJob => ({
    id: Number(raw.id),
    status: raw.status ?? null,
    pickupAddress: raw.pickupAddress ?? null,
    pickupCity: raw.pickupCity ?? null,
    deliveryAddress: raw.deliveryAddress ?? null,
    deliveryCity: raw.deliveryCity ?? null,
    driverEarnings: raw.driverEarnings != null ? Number(raw.driverEarnings) : null,
    feeLocal: raw.feeLocal != null ? Number(raw.feeLocal) : null,
    feeUsd: raw.feeUsd != null ? Number(raw.feeUsd) : null,
    currency: raw.currency ?? null,
    listingTitle: raw.listingTitle ?? null,
    distanceKm: raw.distanceKm != null ? Number(raw.distanceKm) : null,
    createdAt: raw.createdAt ?? null,
  }));
}

export async function fetchDriverJobView(
  deliveryId: number,
  opts: AuthOpts,
): Promise<DriverJobDetail> {
  const res = await fetch(`${getApiBase()}/delivery/${deliveryId}/driver-view`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${opts.token}` },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Driver view failed (${res.status})`);
  const d = data.delivery ?? data;
  return {
    id: Number(d.id),
    orderRef: String(d.orderRef ?? `#FL-${d.id}`),
    status: String(d.status ?? ""),
    listingTitle: d.listingTitle ?? null,
    listingImage: d.listingImage ?? null,
    orderAmount: d.orderAmount != null ? Number(d.orderAmount) : null,
    pickupCity: d.pickupCity ?? null,
    pickupAddress: d.pickupAddress ?? null,
    deliveryCity: d.deliveryCity ?? null,
    deliveryAddress: d.deliveryAddress ?? null,
    distanceKm: d.distanceKm != null ? Number(d.distanceKm) : null,
    driverEarnings: d.driverEarnings != null ? Number(d.driverEarnings) : null,
    driverEarningsHtg: d.driverEarningsHtg != null ? Number(d.driverEarningsHtg) : null,
    feeLocal: d.feeLocal != null ? Number(d.feeLocal) : null,
    feeUsd: d.feeUsd != null ? Number(d.feeUsd) : null,
    sellerName: d.sellerName ?? null,
    sellerPhone: d.sellerPhone ?? null,
    buyerName: d.buyerName ?? null,
    buyerPhone: d.buyerPhone ?? null,
    sellerNote: d.sellerNote ?? null,
    pinRequired: Boolean(d.pinRequired),
    country: d.country ?? null,
    currency: d.currency ?? null,
  };
}

export async function patchDeliveryStatus(
  deliveryId: number,
  status: string,
  opts: AuthOpts,
) {
  const res = await fetch(`${getApiBase()}/delivery/${deliveryId}/status`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: JSON.stringify({ status }),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) {
    const detail =
      data.allowedNext != null
        ? `${data.error || "Status update failed"} (${Array.isArray(data.allowedNext) ? data.allowedNext.join(", ") : data.allowedNext})`
        : data.error || `Status update failed (${res.status})`;
    throw new Error(detail);
  }
  return data;
}

export async function verifyDeliveryCode(
  deliveryId: number,
  code: string,
  opts: AuthOpts,
): Promise<{ success: boolean; driverEarnings?: number }> {
  const res = await fetch(`${getApiBase()}/delivery/${deliveryId}/verify-code`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    body: JSON.stringify({ code }),
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Verify failed (${res.status})`);
  return {
    success: Boolean(data.success ?? true),
    driverEarnings: data.driverEarnings != null ? Number(data.driverEarnings) : undefined,
  };
}

export async function cancelDriverDelivery(deliveryId: number, opts: AuthOpts) {
  const res = await fetch(`${getApiBase()}/delivery/${deliveryId}/driver-cancel`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${opts.token}`,
    },
    signal: opts.signal,
  });
  const data = await readJson(res);
  if (!res.ok) throw new Error(data.error || `Cancel failed (${res.status})`);
  return data;
}

export function parseWorkZones(raw: string[] | string | null | undefined): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string" && raw.trim().startsWith("[")) {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}
