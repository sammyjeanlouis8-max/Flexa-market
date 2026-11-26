/** Strict Flexa Restaurant domain types (mobile). */

export type IdentityVerificationStatus =
  | "unverified"
  | "pending_review"
  | "verified"
  | "rejected";

export type IdentityDocType = "passport" | "id_card" | "national_id" | "driving_license";

export type IdentityVerification = {
  status: IdentityVerificationStatus;
  documentType?: IdentityDocType | null;
  legalName?: string | null;
  documentNumber?: string | null;
  issuingCountry?: string | null;
  rejectionReason?: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
};

export type Weekday =
  | "monday"
  | "tuesday"
  | "wednesday"
  | "thursday"
  | "friday"
  | "saturday"
  | "sunday";

export type DailyScheduleItem = {
  day: Weekday;
  isOpen: boolean;
  openTime: string | null; // "HH:mm"
  closeTime: string | null;
};

export type DishCategory = "main" | "appetizer" | "drink" | "dessert" | "side" | "other";

export type Restaurant = {
  id: number;
  ownerUserId: number;
  name: string;
  bio: string | null;
  cuisineTags: string[];
  phone: string | null;
  coverPhotoUrl: string | null;
  logoUrl: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  commune?: string | null;
  state: string | null;
  postalCode: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  distanceKm?: number | null;
  sameCommune?: boolean;
  schedule: DailyScheduleItem[];
  offersDelivery: boolean;
  deliveryFeeUsd: number | null;
  deliveryEtaMinutes: number | null;
  deliveryNotes: string | null;
  isPublished: boolean;
  kitchenClosedDate?: string | null;
  kitchenClosedToday?: boolean;
  isOpenNow?: boolean;
  ownerVerified?: boolean;
  createdAt: string;
  updatedAt: string;
};

export type RestaurantOrderStatus =
  | "pending"
  | "accepted"
  | "preparing"
  | "ready"
  | "out_for_delivery"
  | "completed"
  | "cancelled"
  | "declined";

export type RestaurantOrderItem = {
  dailyMenuItemId: number | null;
  name: string;
  unitPrice: number;
  currency: string;
  qty: number;
};

export type RestaurantOrderRequest = {
  id: number;
  restaurantId: number;
  restaurantName?: string | null;
  buyerUserId: number;
  ownerUserId: number;
  status: RestaurantOrderStatus | string;
  fulfillment: "pickup" | "delivery" | string;
  items: RestaurantOrderItem[];
  note: string | null;
  subtotalUsd: number;
  deliveryFeeUsd: number | null;
  conversationId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type DishModel = {
  id: number;
  restaurantId: number;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  category: DishCategory;
  photoUrl: string | null;
  tags: string[];
  isAvailableByDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type DailyMenuItem = {
  id: number;
  restaurantId: number;
  menuDate: string; // YYYY-MM-DD
  dishModelId: number | null;
  name: string;
  description: string | null;
  price: number;
  currency: string;
  category: DishCategory;
  photoUrl: string | null;
  available: boolean;
  soldOut: boolean;
  portionLimit: number | null;
  createdAt: string;
  updatedAt: string;
};

export type RestaurantFilters = {
  q?: string;
  openNow?: boolean;
  offersDelivery?: boolean;
  cuisine?: string;
  commune?: string;
  nearby?: boolean;
  lat?: number;
  lng?: number;
  radiusKm?: number;
};

export type CreateRestaurantInput = {
  name: string;
  bio?: string | null;
  cuisineTags?: string[];
  phone?: string | null;
  coverPhotoUrl?: string | null;
  logoUrl?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  commune?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
  schedule: DailyScheduleItem[];
  offersDelivery: boolean;
  deliveryFeeUsd?: number | null;
  deliveryEtaMinutes?: number | null;
  deliveryNotes?: string | null;
  isPublished?: boolean;
};

export type UpsertDishModelInput = {
  name: string;
  description?: string | null;
  price: number;
  currency?: string;
  category: DishCategory;
  photoUrl?: string | null;
  tags?: string[];
  isAvailableByDefault?: boolean;
};

export type UpsertDailyMenuItemInput = {
  menuDate: string;
  dishModelId?: number | null;
  name: string;
  description?: string | null;
  price: number;
  currency?: string;
  category: DishCategory;
  photoUrl?: string | null;
  available?: boolean;
  soldOut?: boolean;
  portionLimit?: number | null;
};

export const WEEKDAYS: Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

export const DEFAULT_SCHEDULE: DailyScheduleItem[] = WEEKDAYS.map((day) => ({
  day,
  isOpen: day !== "sunday",
  openTime: day === "sunday" ? null : "08:00",
  closeTime: day === "sunday" ? null : "22:00",
}));
