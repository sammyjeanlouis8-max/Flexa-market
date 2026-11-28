/**
 * Mobile REST client for Séduire Beauty — DigitalOcean API (same as website).
 */
import { getApiBase } from "./api";

export type BeautyService = {
  id: number;
  businessId: number;
  categoryId?: number | null;
  name: string;
  description: string;
  imageUrl?: string | null;
  priceType: string;
  priceMinor: number;
  price: number;
  currency: string;
  durationMinutes: number;
  prepMinutes?: number;
  cleanupMinutes?: number;
  serviceLocation: string;
  travelFeeMinor?: number;
  travelFee?: number;
  depositRequired?: boolean;
  depositMinor?: number;
  depositType?: string;
  preparationInstructions?: string;
  cancellationPolicy?: string;
  status: string;
  sortOrder?: number;
};

export type BeautyProfessional = {
  id: number;
  businessId: number;
  fullName: string;
  photoUrl?: string | null;
  biography?: string;
  yearsExperience?: number;
  specializations?: string[];
  certifications?: string[];
  role?: string;
  isActive?: boolean;
  avgRating?: number;
  ratingCount?: number;
  userId?: number | null;
};

export type BeautyBusiness = {
  id: number;
  ownerId?: number;
  businessType: string;
  name: string;
  slug?: string;
  description: string;
  logoUrl?: string | null;
  coverUrl?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  country: string;
  region?: string | null;
  city: string;
  streetAddress?: string | null;
  publicAddress?: string | null;
  showPublicAddress?: boolean;
  latitude?: number | null;
  longitude?: number | null;
  timezone?: string;
  serviceLocationMode?: string;
  homeServiceAvailable?: boolean;
  serviceRadiusKm?: number;
  travelFee?: number;
  currency: string;
  status: string;
  identityStatus?: string;
  identityVerifiedBadge?: boolean;
  featured?: boolean;
  vacationMode?: boolean;
  temporarilyClosed?: boolean;
  bookingLeadMinutes?: number;
  avgRating?: number;
  ratingCount?: number;
  profileViews?: number;
  openNow?: boolean;
  distanceKm?: number | null;
  hours?: Array<{
    weekday: number;
    isClosed: boolean;
    openTime: string;
    closeTime: string;
    breakStart?: string | null;
    breakEnd?: string | null;
  }>;
  services?: BeautyService[];
  professionals?: BeautyProfessional[];
  categories?: Array<{ id: number; slug: string; nameEn: string; kind: string }>;
  onboardingStep?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type BeautyAppointment = {
  id: number;
  businessId: number;
  customerId: number;
  professionalId?: number | null;
  serviceId: number;
  status: string;
  paymentStatus?: string;
  serviceLocation?: string;
  startsAt: string;
  endsAt: string;
  timezone?: string;
  serviceNameSnapshot?: string;
  durationMinutesSnapshot?: number;
  priceMinorSnapshot?: number;
  currency: string;
  totalMinor?: number;
  total: number;
  customerName?: string | null;
  customerPhone?: string | null;
  customerNotes?: string;
  customerAddress?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
};

export type BeautyCenterStats = {
  todayAppointments?: number;
  pendingConfirmation?: number;
  completedAllTime?: number;
  revenueMinor?: number;
  revenue?: number;
  activeServices?: number;
  activeProfessionals?: number;
  avgRating?: number;
  ratingCount?: number;
  profileViews?: number;
};

type AuthOpts = { token?: string | null; signal?: AbortSignal };

function headers(token?: string | null): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseJson<T>(res: Response, fallback: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || fallback);
  return data as T;
}

export function formatBeautyMoney(amount: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `$${Number(amount).toFixed(2)}`;
  }
}

export function beautyStatusLabel(status: string): string {
  return String(status || "").replace(/_/g, " ");
}

export async function fetchBeautyLaunch(opts: AuthOpts = {}) {
  const res = await fetch(`${getApiBase()}/beauty/launch`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  return parseJson<{
    native: boolean;
    publicLaunch: boolean;
    access: string;
    privacyNotice?: string;
    platformFees?: { commission: number; registrationFee?: number; monthlySubscription?: number };
  }>(res, "Launch config failed");
}

export async function fetchBeautyCategories(opts: AuthOpts = {}) {
  const res = await fetch(`${getApiBase()}/beauty/categories`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await parseJson<{ categories?: Array<Record<string, unknown>> }>(res, "Failed to load categories");
  return data.categories ?? [];
}

export async function fetchBeautyBusinesses(
  params: {
    q?: string;
    country?: string;
    city?: string;
    businessType?: string;
    categorySlug?: string;
    openNow?: boolean;
    homeService?: boolean;
    featured?: boolean;
    nearby?: boolean;
    radiusKm?: number;
    lat?: number;
    lng?: number;
    sortBy?: "rating" | "distance" | "name" | "newest" | "price";
    limit?: number;
    offset?: number;
  },
  opts: AuthOpts,
): Promise<BeautyBusiness[]> {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.country) qs.set("country", params.country);
  if (params.city) qs.set("city", params.city);
  if (params.businessType) qs.set("businessType", params.businessType);
  if (params.categorySlug) qs.set("categorySlug", params.categorySlug);
  if (params.openNow) qs.set("openNow", "1");
  if (params.homeService) qs.set("homeService", "1");
  if (params.featured) qs.set("featured", "1");
  if (params.nearby) qs.set("nearby", "1");
  if (params.radiusKm != null) qs.set("radiusKm", String(params.radiusKm));
  if (params.lat != null) qs.set("lat", String(params.lat));
  if (params.lng != null) qs.set("lng", String(params.lng));
  if (params.sortBy) qs.set("sortBy", params.sortBy);
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.offset != null) qs.set("offset", String(params.offset));
  const res = await fetch(`${getApiBase()}/beauty/businesses?${qs.toString()}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await parseJson<{ businesses?: BeautyBusiness[] }>(res, "Failed to load beauty businesses");
  return data.businesses ?? [];
}

export async function fetchBeautyBusiness(id: number, opts: AuthOpts): Promise<BeautyBusiness> {
  const res = await fetch(`${getApiBase()}/beauty/businesses/${id}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await parseJson<{ business: BeautyBusiness }>(res, "Business not found");
  return data.business;
}

export async function fetchBeautyAvailability(
  params: {
    businessId: number;
    serviceId: number;
    date: string;
    professionalId?: number | null;
    serviceLocation?: string;
    travelMinutes?: number;
  },
  opts: AuthOpts,
) {
  const qs = new URLSearchParams();
  qs.set("businessId", String(params.businessId));
  qs.set("serviceId", String(params.serviceId));
  qs.set("date", params.date);
  if (params.professionalId != null) qs.set("professionalId", String(params.professionalId));
  if (params.serviceLocation) qs.set("serviceLocation", params.serviceLocation);
  if (params.travelMinutes != null) qs.set("travelMinutes", String(params.travelMinutes));
  const res = await fetch(`${getApiBase()}/beauty/availability?${qs.toString()}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  return parseJson<{
    date: string;
    timezone: string;
    slots: string[];
    byProfessional?: Array<{ professionalId: number | null; slots: string[] }>;
    service?: BeautyService;
    reason?: string;
  }>(res, "Failed to load availability");
}

export async function createBeautyBusiness(body: Record<string, unknown>, opts: AuthOpts): Promise<BeautyBusiness> {
  const res = await fetch(`${getApiBase()}/beauty/businesses`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await parseJson<{ business: BeautyBusiness }>(res, "Could not create business");
  return data.business;
}

export async function fetchMyBeautyBusinesses(opts: AuthOpts): Promise<BeautyBusiness[]> {
  const res = await fetch(`${getApiBase()}/beauty/my-businesses`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await parseJson<{ businesses?: BeautyBusiness[] }>(res, "Failed to load your businesses");
  return data.businesses ?? [];
}

export async function fetchMyBeautyBusiness(id: number, opts: AuthOpts) {
  const res = await fetch(`${getApiBase()}/beauty/my-businesses/${id}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  return parseJson<{
    business: BeautyBusiness;
    hours?: Array<Record<string, unknown>>;
    services?: BeautyService[];
    professionals?: BeautyProfessional[];
    portfolio?: Array<Record<string, unknown>>;
  }>(res, "Business not found");
}

export async function updateMyBeautyBusiness(
  id: number,
  body: Record<string, unknown>,
  opts: AuthOpts,
): Promise<BeautyBusiness> {
  const res = await fetch(`${getApiBase()}/beauty/my-businesses/${id}`, {
    method: "PATCH",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await parseJson<{ business: BeautyBusiness }>(res, "Could not update business");
  return data.business;
}

export async function createBeautyService(
  businessId: number,
  body: Record<string, unknown>,
  opts: AuthOpts,
): Promise<BeautyService> {
  const res = await fetch(`${getApiBase()}/beauty/my-businesses/${businessId}/services`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await parseJson<{ service: BeautyService }>(res, "Could not create service");
  return data.service;
}

export async function updateBeautyService(
  businessId: number,
  serviceId: number,
  body: Record<string, unknown>,
  opts: AuthOpts,
): Promise<BeautyService> {
  const res = await fetch(`${getApiBase()}/beauty/my-businesses/${businessId}/services/${serviceId}`, {
    method: "PATCH",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await parseJson<{ service: BeautyService }>(res, "Could not update service");
  return data.service;
}

export async function createBeautyProfessional(
  businessId: number,
  body: Record<string, unknown>,
  opts: AuthOpts,
): Promise<BeautyProfessional> {
  const res = await fetch(`${getApiBase()}/beauty/my-businesses/${businessId}/professionals`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await parseJson<{ professional: BeautyProfessional }>(res, "Could not add professional");
  return data.professional;
}

export async function updateBeautyProfessional(
  businessId: number,
  proId: number,
  body: Record<string, unknown>,
  opts: AuthOpts,
): Promise<BeautyProfessional> {
  const res = await fetch(`${getApiBase()}/beauty/my-businesses/${businessId}/professionals/${proId}`, {
    method: "PATCH",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  const data = await parseJson<{ professional: BeautyProfessional }>(res, "Could not update professional");
  return data.professional;
}

export async function createBeautyPortfolioItem(
  businessId: number,
  body: Record<string, unknown>,
  opts: AuthOpts,
) {
  const res = await fetch(`${getApiBase()}/beauty/my-businesses/${businessId}/portfolio`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  return parseJson<{ item: Record<string, unknown> }>(res, "Could not publish portfolio item");
}

export async function deleteBeautyPortfolioItem(
  businessId: number,
  itemId: number,
  opts: AuthOpts,
) {
  const res = await fetch(`${getApiBase()}/beauty/my-businesses/${businessId}/portfolio/${itemId}`, {
    method: "DELETE",
    headers: headers(opts.token),
    signal: opts.signal,
  });
  return parseJson<{ ok: boolean }>(res, "Could not delete portfolio item");
}

export async function createBeautyAppointment(
  body: {
    businessId: number;
    serviceId: number;
    startsAt: string;
    professionalId?: number | null;
    serviceLocation?: string;
    customerName?: string;
    customerPhone?: string;
    customerNotes?: string;
    customerAddress?: string;
    customerAddressInstructions?: string;
    paymentMode?: "full" | "deposit" | "pay_at_location";
    idempotencyKey?: string;
  },
  opts: AuthOpts,
) {
  const res = await fetch(`${getApiBase()}/beauty/appointments`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify(body),
    signal: opts.signal,
  });
  return parseJson<{
    appointment: BeautyAppointment;
    payment?: { clientSecret?: string | null; paymentIntentId?: string | null; message?: string };
    deduped?: boolean;
  }>(res, "Could not book appointment");
}

export async function fetchMyBeautyAppointments(opts: AuthOpts): Promise<BeautyAppointment[]> {
  const res = await fetch(`${getApiBase()}/beauty/my-appointments`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await parseJson<{ appointments?: BeautyAppointment[] }>(res, "Failed to load appointments");
  return data.appointments ?? [];
}

export async function cancelBeautyAppointment(
  id: number,
  opts: AuthOpts,
  reason?: string,
): Promise<BeautyAppointment> {
  const res = await fetch(`${getApiBase()}/beauty/appointments/${id}/cancel`, {
    method: "POST",
    headers: headers(opts.token),
    body: JSON.stringify({ reason }),
    signal: opts.signal,
  });
  const data = await parseJson<{ appointment: BeautyAppointment }>(res, "Could not cancel appointment");
  return data.appointment;
}

export async function fetchBeautyCenterOverview(businessId: number, opts: AuthOpts) {
  const res = await fetch(`${getApiBase()}/beauty/center/${businessId}/overview`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  return parseJson<{ business: BeautyBusiness; stats: BeautyCenterStats }>(res, "Center not found");
}

export async function fetchBeautyCenterAppointments(
  businessId: number,
  opts: AuthOpts,
  params?: { status?: string; professionalId?: number; limit?: number },
): Promise<BeautyAppointment[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.professionalId != null) qs.set("professionalId", String(params.professionalId));
  if (params?.limit != null) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  const res = await fetch(`${getApiBase()}/beauty/center/${businessId}/appointments${suffix}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  const data = await parseJson<{ appointments?: BeautyAppointment[] }>(res, "Failed to load appointments");
  return data.appointments ?? [];
}

export async function fetchBeautyCenterCalendar(
  businessId: number,
  from: string,
  to: string,
  opts: AuthOpts,
  professionalId?: number,
) {
  const qs = new URLSearchParams({ from, to });
  if (professionalId != null) qs.set("professionalId", String(professionalId));
  const res = await fetch(`${getApiBase()}/beauty/center/${businessId}/calendar?${qs.toString()}`, {
    headers: headers(opts.token),
    signal: opts.signal,
  });
  return parseJson<{
    appointments: BeautyAppointment[];
    blocks: Array<Record<string, unknown>>;
  }>(res, "Failed to load calendar");
}

export async function patchBeautyAppointmentStatus(
  id: number,
  status: string,
  opts: AuthOpts,
  extra?: { reason?: string; note?: string },
): Promise<BeautyAppointment> {
  const res = await fetch(`${getApiBase()}/beauty/appointments/${id}/status`, {
    method: "PATCH",
    headers: headers(opts.token),
    body: JSON.stringify({ status, ...extra }),
    signal: opts.signal,
  });
  const data = await parseJson<{ appointment: BeautyAppointment }>(res, "Could not update appointment");
  return data.appointment;
}
