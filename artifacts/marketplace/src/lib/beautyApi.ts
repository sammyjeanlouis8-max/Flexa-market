/** Séduire Beauty client API — mirrors restaurantApi auth / parse patterns. */

export type BeautyBusinessType =
  | "beauty_studio"
  | "barbershop"
  | "independent_beauty"
  | "mobile_beauty"
  | "all";

export type BeautyHour = {
  weekday: number;
  isClosed: boolean;
  openTime: string | null;
  closeTime: string | null;
  breakStart?: string | null;
  breakEnd?: string | null;
  professionalId?: number | null;
};

export type BeautyCategory = {
  id: number;
  kind: string;
  slug: string;
  nameEn: string;
  nameFr?: string | null;
  nameHt?: string | null;
  nameEs?: string | null;
  descriptionEn?: string;
  imageUrl?: string | null;
  parentId?: number | null;
  sortOrder?: number;
  isActive?: boolean;
};

export type BeautyService = {
  id: number;
  businessId: number;
  categoryId?: number | null;
  name: string;
  description: string;
  imageUrl: string | null;
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
  photoUrl: string | null;
  biography: string;
  yearsExperience?: number | null;
  specializations?: string[];
  certifications?: string[];
  role: string;
  isActive: boolean;
  avgRating: number;
  ratingCount: number;
  userId?: number | null;
  inviteStatus?: string;
};

export type BeautyBusiness = {
  id: number;
  ownerId: number;
  businessType: string;
  name: string;
  slug: string | null;
  description: string;
  logoUrl: string | null;
  coverUrl: string | null;
  phone: string | null;
  email?: string | null;
  whatsapp: string | null;
  country: string;
  region: string | null;
  city: string;
  streetAddress: string | null;
  postalCode?: string | null;
  publicAddress?: string | null;
  showPublicAddress?: boolean;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  serviceLocationMode?: string;
  homeServiceAvailable?: boolean;
  serviceRadiusKm?: number;
  travelFeeMinor?: number;
  travelFee?: number;
  currency: string;
  status: string;
  identityStatus: string;
  identityVerifiedBadge?: boolean;
  featured?: boolean;
  vacationMode?: boolean;
  temporarilyClosed?: boolean;
  bookingLeadMinutes?: number;
  avgRating: number;
  ratingCount: number;
  profileViews?: number;
  subscriptionPlan?: string;
  openNow?: boolean;
  distanceKm?: number | null;
  hours?: BeautyHour[];
  services?: BeautyService[];
  professionals?: BeautyProfessional[];
  categories?: Array<{ id: number; slug: string; nameEn: string; kind: string }>;
  reviewsSummary?: { avgRating: number; ratingCount: number };
  onboardingStep?: number;
  privateResidentialAddress?: string | null;
  adminNotes?: string | null;
  termsAcceptedAt?: string | null;
  identityRejectionReason?: string | null;
  suspensionReason?: string | null;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BeautyPortfolioItem = {
  id: number;
  businessId: number;
  professionalId?: number | null;
  serviceId?: number | null;
  mediaUrl?: string;
  imageUrl?: string;
  thumbnailUrl?: string | null;
  title?: string;
  caption?: string;
  description?: string;
  status: string;
  createdAt: string;
};

export type BeautyReview = {
  id: number;
  overallRating: number;
  serviceQuality?: number | null;
  professionalism?: number | null;
  punctuality?: number | null;
  cleanliness?: number | null;
  comment: string;
  photos?: string[];
  ownerReply?: string | null;
  ownerRepliedAt?: string | null;
  professionalId?: number | null;
  createdAt: string;
};

export type BeautyAppointment = {
  id: number;
  businessId: number;
  customerId: number;
  professionalId: number | null;
  serviceId: number;
  status: string;
  paymentStatus: string;
  serviceLocation: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  serviceNameSnapshot: string;
  durationMinutesSnapshot: number;
  priceMinorSnapshot: number;
  travelFeeMinorSnapshot: number;
  depositMinorSnapshot: number;
  currency: string;
  totalMinor: number;
  total: number;
  customerName: string | null;
  customerPhone: string | null;
  customerNotes: string;
  customerAddress?: string | null;
  customerAddressInstructions?: string | null;
  customerLatitude?: number | null;
  customerLongitude?: number | null;
  estimatedTravelMinutes?: number | null;
  reservationExpiresAt?: string | null;
  cancelledAt?: string | null;
  cancellationReason?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BeautySlot = {
  startsAt: string;
  endsAt?: string;
  professionalId?: number | null;
  available?: boolean;
};

export type BeautyLaunchInfo = {
  native: boolean;
  publicLaunch: boolean;
  access: string;
  privacyNotice: string;
  platformFees: { commission: number; registrationFee?: number; monthlySubscription?: number };
};

export type BeautyCenterOverview = {
  business: BeautyBusiness;
  stats: {
    todayAppointments: number;
    pendingConfirmation: number;
    completedAllTime: number;
    revenueMinor: number;
    revenue: number;
    activeServices: number;
    activeProfessionals: number;
    avgRating: number;
    ratingCount: number;
    profileViews: number;
  };
};

export type BeautyAdminOverview = {
  businesses: { total: number; approved: number; submitted: number; suspended: number };
  appointments: { total: number; completed: number; pending: number };
  openReports: number;
  publicLaunch: boolean;
};

export const BEAUTY_CATEGORY_TILES = [
  {
    id: "beauty_studio",
    labelKey: "beauty.catBeautyStudio",
    href: "/beauty/studio",
    photo: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&q=80",
  },
  {
    id: "barbershop",
    labelKey: "beauty.catBarbershop",
    href: "/beauty/barbershop",
    photo: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&q=80",
  },
] as const;

function authHeaders(): HeadersInit {
  const token = localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function parseJson<T>(res: Response, fallbackMsg: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || fallbackMsg);
  return data as T;
}

export function businessTypeLabelKey(type: string): string {
  const map: Record<string, string> = {
    beauty_studio: "catBeautyStudio",
    studio: "catBeautyStudio",
    barbershop: "catBarbershop",
    barber: "catBarbershop",
    independent_beauty: "catIndependent",
    mobile_beauty: "catMobile",
  };
  return map[type] || "catBeautyStudio";
}

export function formatBeautyPrice(amount: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/* ─── Launch / meta ─────────────────────────────────────────────────────── */

export async function fetchBeautyLaunch(): Promise<BeautyLaunchInfo> {
  const res = await fetch("/api/beauty/launch", { headers: authHeaders() });
  return parseJson(res, "Failed to load beauty launch info");
}

export async function fetchBeautyCategories(): Promise<BeautyCategory[]> {
  const res = await fetch("/api/beauty/categories", { headers: authHeaders() });
  const data = await parseJson<{ categories?: BeautyCategory[] }>(res, "Failed to load categories");
  return data.categories ?? [];
}

export async function fetchBeautyCountries(): Promise<
  Array<{ countryCode: string; enabled: boolean; status: string; publiclyActive: boolean; notes?: string }>
> {
  const res = await fetch("/api/beauty/countries", { headers: authHeaders() });
  const data = await parseJson<{ countries?: Array<{
    countryCode: string;
    enabled: boolean;
    status: string;
    publiclyActive: boolean;
    notes?: string;
  }> }>(res, "Failed to load countries");
  return data.countries ?? [];
}

/* ─── Discover ──────────────────────────────────────────────────────────── */

export async function fetchBeautyBusinesses(params?: {
  q?: string;
  country?: string;
  city?: string;
  region?: string;
  businessType?: string;
  categorySlug?: string;
  openNow?: boolean;
  homeService?: boolean;
  featured?: boolean;
  availableToday?: boolean;
  minRating?: number;
  maxPriceMinor?: number;
  nearby?: boolean;
  radiusKm?: number;
  lat?: number;
  lng?: number;
  sortBy?: "rating" | "distance" | "name" | "price" | "newest";
  limit?: number;
  offset?: number;
}): Promise<{ businesses: BeautyBusiness[]; total: number }> {
  const qs = new URLSearchParams();
  if (params?.q) qs.set("q", params.q);
  if (params?.country) qs.set("country", params.country);
  if (params?.city) qs.set("city", params.city);
  if (params?.region) qs.set("region", params.region);
  if (params?.businessType && params.businessType !== "all") qs.set("businessType", params.businessType);
  if (params?.categorySlug) qs.set("categorySlug", params.categorySlug);
  if (params?.openNow) qs.set("openNow", "1");
  if (params?.homeService) qs.set("homeService", "1");
  if (params?.featured) qs.set("featured", "1");
  if (params?.availableToday) qs.set("availableToday", "1");
  if (params?.minRating != null) qs.set("minRating", String(params.minRating));
  if (params?.maxPriceMinor != null) qs.set("maxPriceMinor", String(params.maxPriceMinor));
  if (params?.nearby) qs.set("nearby", "1");
  if (params?.radiusKm != null) qs.set("radiusKm", String(params.radiusKm));
  if (params?.lat != null) qs.set("lat", String(params.lat));
  if (params?.lng != null) qs.set("lng", String(params.lng));
  if (params?.sortBy) qs.set("sortBy", params.sortBy);
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const res = await fetch(`/api/beauty/businesses?${qs.toString()}`, { headers: authHeaders() });
  const data = await parseJson<{ businesses?: BeautyBusiness[]; total?: number }>(
    res,
    "Failed to load beauty businesses",
  );
  return { businesses: data.businesses ?? [], total: data.total ?? 0 };
}

export async function fetchBeautyBusiness(id: number): Promise<BeautyBusiness> {
  const res = await fetch(`/api/beauty/businesses/${id}`, { headers: authHeaders() });
  const data = await parseJson<{ business: BeautyBusiness }>(res, "Business not found");
  return data.business;
}

export async function fetchBeautyPortfolio(businessId: number): Promise<BeautyPortfolioItem[]> {
  const res = await fetch(`/api/beauty/businesses/${businessId}/portfolio`, { headers: authHeaders() });
  const data = await parseJson<{ items?: BeautyPortfolioItem[] }>(res, "Failed to load portfolio");
  return data.items ?? [];
}

export async function fetchBeautyReviews(
  businessId: number,
  params?: { limit?: number; offset?: number },
): Promise<{ reviews: BeautyReview[]; avgRating: number; ratingCount: number }> {
  const qs = new URLSearchParams();
  if (params?.limit != null) qs.set("limit", String(params.limit));
  if (params?.offset != null) qs.set("offset", String(params.offset));
  const res = await fetch(`/api/beauty/businesses/${businessId}/reviews?${qs}`, { headers: authHeaders() });
  return parseJson(res, "Failed to load reviews");
}

export async function fetchBeautyProfessional(id: number): Promise<{
  professional: BeautyProfessional;
  business: BeautyBusiness;
  services: BeautyService[];
}> {
  const res = await fetch(`/api/beauty/professionals/${id}`, { headers: authHeaders() });
  return parseJson(res, "Professional not found");
}

export async function fetchBeautyService(id: number): Promise<{
  service: BeautyService;
  business: BeautyBusiness;
  professionals: BeautyProfessional[];
}> {
  const res = await fetch(`/api/beauty/services/${id}`, { headers: authHeaders() });
  return parseJson(res, "Service not found");
}

export async function fetchBeautyAvailability(params: {
  businessId: number;
  serviceId: number;
  date: string;
  professionalId?: number | null;
  serviceLocation?: string;
  travelMinutes?: number;
}): Promise<{
  slots: BeautySlot[];
  date: string;
  timezone?: string;
  reason?: string;
  byProfessional?: Array<{ professionalId: number | null; slots: string[] }>;
}> {
  const qs = new URLSearchParams();
  qs.set("businessId", String(params.businessId));
  qs.set("serviceId", String(params.serviceId));
  qs.set("date", params.date);
  if (params.professionalId != null) qs.set("professionalId", String(params.professionalId));
  if (params.serviceLocation) qs.set("serviceLocation", params.serviceLocation);
  if (params.travelMinutes != null) qs.set("travelMinutes", String(params.travelMinutes));
  const res = await fetch(`/api/beauty/availability?${qs}`, { headers: authHeaders() });
  const data = await parseJson<{
    slots?: string[] | BeautySlot[];
    date: string;
    timezone?: string;
    reason?: string;
    byProfessional?: Array<{ professionalId: number | null; slots: string[] }>;
  }>(res, "Failed to load availability");
  const raw = data.slots ?? [];
  const slots: BeautySlot[] = raw.map((s) =>
    typeof s === "string" ? { startsAt: s } : s,
  );
  return { ...data, slots };
}

/* ─── Owner / my businesses ─────────────────────────────────────────────── */

export async function createBeautyBusiness(body: Record<string, unknown>): Promise<BeautyBusiness> {
  const res = await fetch("/api/beauty/businesses", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ business: BeautyBusiness }>(res, "Could not create business");
  return data.business;
}

export async function fetchMyBeautyBusinesses(): Promise<BeautyBusiness[]> {
  const res = await fetch("/api/beauty/my-businesses", { headers: authHeaders() });
  const data = await parseJson<{ businesses?: BeautyBusiness[] }>(res, "Failed to load your businesses");
  return data.businesses ?? [];
}

export async function fetchMyBeautyBusiness(id: number): Promise<{
  business: BeautyBusiness;
  hours: BeautyHour[];
  services: BeautyService[];
  professionals: BeautyProfessional[];
  portfolio: BeautyPortfolioItem[];
}> {
  const res = await fetch(`/api/beauty/my-businesses/${id}`, { headers: authHeaders() });
  return parseJson(res, "Business not found");
}

export async function updateMyBeautyBusiness(
  id: number,
  body: Record<string, unknown>,
): Promise<BeautyBusiness> {
  const res = await fetch(`/api/beauty/my-businesses/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ business: BeautyBusiness }>(res, "Could not save business");
  return data.business;
}

export async function updateBeautyHours(
  businessId: number,
  hours: Array<Partial<BeautyHour> & { weekday: number }>,
): Promise<BeautyHour[]> {
  const res = await fetch(`/api/beauty/my-businesses/${businessId}/hours`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ hours }),
  });
  const data = await parseJson<{ hours?: BeautyHour[] }>(res, "Could not save hours");
  return data.hours ?? [];
}

export async function createBeautyService(
  businessId: number,
  body: Record<string, unknown>,
): Promise<BeautyService> {
  const res = await fetch(`/api/beauty/my-businesses/${businessId}/services`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ service: BeautyService }>(res, "Could not create service");
  return data.service;
}

export async function updateBeautyService(
  businessId: number,
  serviceId: number,
  body: Record<string, unknown>,
): Promise<BeautyService> {
  const res = await fetch(`/api/beauty/my-businesses/${businessId}/services/${serviceId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ service: BeautyService }>(res, "Could not save service");
  return data.service;
}

export async function createBeautyProfessional(
  businessId: number,
  body: Record<string, unknown>,
): Promise<BeautyProfessional> {
  const res = await fetch(`/api/beauty/my-businesses/${businessId}/professionals`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ professional: BeautyProfessional }>(res, "Could not create professional");
  return data.professional;
}

export async function updateBeautyProfessional(
  businessId: number,
  proId: number,
  body: Record<string, unknown>,
): Promise<BeautyProfessional> {
  const res = await fetch(`/api/beauty/my-businesses/${businessId}/professionals/${proId}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ professional: BeautyProfessional }>(res, "Could not save professional");
  return data.professional;
}

export async function createBeautyPortfolioItem(
  businessId: number,
  body: Record<string, unknown>,
): Promise<BeautyPortfolioItem> {
  const res = await fetch(`/api/beauty/my-businesses/${businessId}/portfolio`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ item: BeautyPortfolioItem }>(res, "Could not add portfolio item");
  return data.item;
}

export async function deleteBeautyPortfolioItem(businessId: number, itemId: number): Promise<void> {
  const res = await fetch(`/api/beauty/my-businesses/${businessId}/portfolio/${itemId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await parseJson(res, "Could not delete portfolio item");
}

/* ─── Appointments ──────────────────────────────────────────────────────── */

export async function createBeautyAppointment(body: Record<string, unknown>): Promise<{
  appointment: BeautyAppointment;
  payment: unknown;
  deduped?: boolean;
}> {
  const res = await fetch("/api/beauty/appointments", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson(res, "Could not create appointment");
}

export async function fetchMyBeautyAppointments(): Promise<BeautyAppointment[]> {
  const res = await fetch("/api/beauty/my-appointments", { headers: authHeaders() });
  const data = await parseJson<{ appointments?: BeautyAppointment[] }>(res, "Failed to load appointments");
  return data.appointments ?? [];
}

export async function fetchBeautyAppointment(id: number): Promise<BeautyAppointment> {
  const res = await fetch(`/api/beauty/appointments/${id}`, { headers: authHeaders() });
  const data = await parseJson<{ appointment: BeautyAppointment }>(res, "Appointment not found");
  return data.appointment;
}

export async function updateBeautyAppointmentStatus(
  id: number,
  body: { status: string; note?: string },
): Promise<BeautyAppointment> {
  const res = await fetch(`/api/beauty/appointments/${id}/status`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ appointment: BeautyAppointment }>(res, "Could not update status");
  return data.appointment;
}

export async function rescheduleBeautyAppointment(
  id: number,
  body: { startsAt: string; professionalId?: number | null },
): Promise<BeautyAppointment> {
  const res = await fetch(`/api/beauty/appointments/${id}/reschedule`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ appointment: BeautyAppointment }>(res, "Could not reschedule");
  return data.appointment;
}

export async function cancelBeautyAppointment(
  id: number,
  body?: { reason?: string },
): Promise<BeautyAppointment> {
  const res = await fetch(`/api/beauty/appointments/${id}/cancel`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body ?? {}),
  });
  const data = await parseJson<{ appointment: BeautyAppointment }>(res, "Could not cancel");
  return data.appointment;
}

export async function payBeautyAppointment(
  id: number,
  body?: { mode?: string; idempotencyKey?: string },
): Promise<{ payment: unknown }> {
  const res = await fetch(`/api/beauty/appointments/${id}/pay`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body ?? {}),
  });
  return parseJson(res, "Payment failed");
}

/* ─── Beauty Center ─────────────────────────────────────────────────────── */

export async function fetchBeautyCenterOverview(businessId: number): Promise<BeautyCenterOverview> {
  const res = await fetch(`/api/beauty/center/${businessId}/overview`, { headers: authHeaders() });
  return parseJson(res, "Failed to load center overview");
}

export async function fetchBeautyCenterAppointments(
  businessId: number,
  params?: { status?: string; professionalId?: number; limit?: number },
): Promise<BeautyAppointment[]> {
  const qs = new URLSearchParams();
  if (params?.status) qs.set("status", params.status);
  if (params?.professionalId != null) qs.set("professionalId", String(params.professionalId));
  if (params?.limit != null) qs.set("limit", String(params.limit));
  const res = await fetch(`/api/beauty/center/${businessId}/appointments?${qs}`, { headers: authHeaders() });
  const data = await parseJson<{ appointments?: BeautyAppointment[] }>(res, "Failed to load appointments");
  return data.appointments ?? [];
}

export async function fetchBeautyCenterRevenue(
  businessId: number,
  params?: { from?: string; to?: string },
): Promise<{
  currency: string;
  from: string;
  to: string;
  totalMinor: number;
  total: number;
  series: Array<{ day: string; totalMinor: number; total: number; count: number }>;
}> {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  const res = await fetch(`/api/beauty/center/${businessId}/revenue?${qs}`, { headers: authHeaders() });
  return parseJson(res, "Failed to load revenue");
}

export async function fetchBeautyCenterCalendar(
  businessId: number,
  params: { from: string; to: string; professionalId?: number },
): Promise<{ appointments: BeautyAppointment[]; blocks: unknown[] }> {
  const qs = new URLSearchParams();
  qs.set("from", params.from);
  qs.set("to", params.to);
  if (params.professionalId != null) qs.set("professionalId", String(params.professionalId));
  const res = await fetch(`/api/beauty/center/${businessId}/calendar?${qs}`, { headers: authHeaders() });
  return parseJson(res, "Failed to load calendar");
}

export async function createManualBeautyAppointment(
  businessId: number,
  body: Record<string, unknown>,
): Promise<{ appointment: BeautyAppointment }> {
  const res = await fetch(`/api/beauty/center/${businessId}/appointments/manual`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson(res, "Could not create manual appointment");
}

export async function createBeautyBlock(
  businessId: number,
  body: Record<string, unknown>,
): Promise<unknown> {
  const res = await fetch(`/api/beauty/center/${businessId}/blocks`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson(res, "Could not create block");
}

/* ─── Favorites / recently viewed ───────────────────────────────────────── */

export async function addBeautyFavorite(businessId: number): Promise<void> {
  const res = await fetch(`/api/beauty/favorites/businesses/${businessId}`, {
    method: "POST",
    headers: authHeaders(),
  });
  await parseJson(res, "Could not save favorite");
}

export async function removeBeautyFavorite(businessId: number): Promise<void> {
  const res = await fetch(`/api/beauty/favorites/businesses/${businessId}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  await parseJson(res, "Could not remove favorite");
}

export async function fetchBeautyFavorites(): Promise<BeautyBusiness[]> {
  const res = await fetch("/api/beauty/favorites", { headers: authHeaders() });
  const data = await parseJson<{ businesses?: BeautyBusiness[] }>(res, "Failed to load favorites");
  return data.businesses ?? [];
}

export async function trackBeautyRecentlyViewed(businessId: number): Promise<void> {
  const res = await fetch(`/api/beauty/recently-viewed/${businessId}`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) return;
}

export async function fetchBeautyRecentlyViewed(): Promise<BeautyBusiness[]> {
  const res = await fetch("/api/beauty/recently-viewed", { headers: authHeaders() });
  const data = await parseJson<{ recentlyViewed?: BeautyBusiness[]; businesses?: BeautyBusiness[] }>(
    res,
    "Failed to load recently viewed",
  );
  return data.recentlyViewed ?? data.businesses ?? [];
}

/* ─── Reviews / messaging / reports ─────────────────────────────────────── */

export async function submitBeautyReview(
  appointmentId: number,
  body: Record<string, unknown>,
): Promise<BeautyReview> {
  const res = await fetch(`/api/beauty/appointments/${appointmentId}/review`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ review: BeautyReview }>(res, "Could not submit review");
  return data.review;
}

export async function replyToBeautyReview(
  reviewId: number,
  body: { reply: string },
): Promise<BeautyReview> {
  const res = await fetch(`/api/beauty/reviews/${reviewId}/reply`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ review: BeautyReview }>(res, "Could not reply");
  return data.review;
}

export async function startBeautyConversation(body: {
  businessId: number;
  message?: string;
}): Promise<{ id: number }> {
  const res = await fetch("/api/beauty/conversations", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson(res, "Could not start conversation");
}

export async function reportBeautyEntity(body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch("/api/beauty/reports", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  return parseJson(res, "Could not submit report");
}

/* ─── Admin ─────────────────────────────────────────────────────────────── */

export async function fetchBeautyAdminOverview(): Promise<BeautyAdminOverview> {
  const res = await fetch("/api/beauty/admin/overview", { headers: authHeaders() });
  return parseJson(res, "Failed to load admin overview");
}

export async function fetchBeautyAdminBusinesses(status?: string): Promise<BeautyBusiness[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await fetch(`/api/beauty/admin/businesses${qs}`, { headers: authHeaders() });
  const data = await parseJson<{ businesses?: BeautyBusiness[] }>(res, "Failed to load businesses");
  return data.businesses ?? [];
}

export async function decideBeautyBusiness(
  id: number,
  body: { decision: string; notes?: string },
): Promise<BeautyBusiness> {
  const res = await fetch(`/api/beauty/admin/businesses/${id}/decide`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await parseJson<{ business: BeautyBusiness }>(res, "Decision failed");
  return data.business;
}

export async function fetchBeautyAdminCategories(): Promise<BeautyCategory[]> {
  const res = await fetch("/api/beauty/admin/categories", { headers: authHeaders() });
  const data = await parseJson<{ categories?: BeautyCategory[] }>(res, "Failed to load categories");
  return data.categories ?? [];
}

export async function saveBeautyAdminCategories(
  categories: Array<Partial<BeautyCategory>>,
): Promise<BeautyCategory[]> {
  const res = await fetch("/api/beauty/admin/categories", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ categories }),
  });
  const data = await parseJson<{ categories?: BeautyCategory[] }>(res, "Could not save categories");
  return data.categories ?? [];
}

export async function fetchBeautyAdminCountries(): Promise<
  Array<{ id?: number; countryCode: string; enabled: boolean; status: string; notes?: string }>
> {
  const res = await fetch("/api/beauty/admin/countries", { headers: authHeaders() });
  const data = await parseJson<{ countries?: Array<{
    id?: number;
    countryCode: string;
    enabled: boolean;
    status: string;
    notes?: string;
  }> }>(res, "Failed to load countries");
  return data.countries ?? [];
}

export async function saveBeautyAdminCountries(
  countries: Array<{ countryCode: string; enabled?: boolean; status?: string; notes?: string }>,
): Promise<unknown[]> {
  const res = await fetch("/api/beauty/admin/countries", {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ countries }),
  });
  const data = await parseJson<{ countries?: unknown[] }>(res, "Could not save countries");
  return data.countries ?? [];
}

export async function fetchBeautyAdminReports(status?: string): Promise<unknown[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  const res = await fetch(`/api/beauty/admin/reports${qs}`, { headers: authHeaders() });
  const data = await parseJson<{ reports?: unknown[] }>(res, "Failed to load reports");
  return data.reports ?? [];
}

export async function fetchBeautyAdminAudit(businessId?: number): Promise<unknown[]> {
  const qs = businessId != null ? `?businessId=${businessId}` : "";
  const res = await fetch(`/api/beauty/admin/audit${qs}`, { headers: authHeaders() });
  const data = await parseJson<{ logs?: unknown[] }>(res, "Failed to load audit");
  return data.logs ?? [];
}
