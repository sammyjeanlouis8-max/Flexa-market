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
