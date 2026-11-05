/**
 * Product publishing validation helpers for the Add New Product form.
 * English is the default; callers may pass translated strings via `messages`.
 */

export type SellSectionId = "info" | "media" | "pricing" | "delivery" | "review";

export const SELL_FIELD_SECTION: Record<string, SellSectionId> = {
  title: "info",
  description: "info",
  categoryId: "info",
  subcategoryId: "info",
  photos: "media",
  listingVideoUrl: "media",
  price: "pricing",
  stockQuantity: "pricing",
  condition: "pricing",
  itemSize: "pricing",
  country: "delivery",
  city: "delivery",
  state: "delivery",
  location: "delivery",
  deliveryMethod: "delivery",
  shippingCarriers: "delivery",
  intlShippingCost: "delivery",
};

/** Default English copy — also mirrored in i18n `sell.validation.*`. */
export const SELL_VALIDATION_EN = {
  bannerTitle: "Please complete the required information",
  bannerSubtitle: "Fix the highlighted fields below to publish your product.",
  titleRequired: "Product title is required.",
  titleTooShort: "Title must be at least 3 characters.",
  categoryRequired: "Please select a category.",
  descriptionRequired: "Product description is required.",
  photoRequired: "Please upload at least one product photo.",
  photoUnsupported: "Unsupported image format.",
  photoUploadFailed: "Image upload failed. Please try again.",
  videoUploadFailed: "Video upload failed. Please try again.",
  videoTooLong: "Video exceeds the maximum allowed duration.",
  priceInvalid: "Please enter a valid price.",
  pricePositive: "Price must be greater than zero.",
  quantityInvalid: "Please enter a valid quantity.",
  locationRequired: "Please select a valid location.",
  cityRequired: "Please select a valid location.",
  countryRequired: "Please select a valid location.",
  deliveryRequired: "Please select a delivery option.",
  networkError: "Unable to publish your product. Please check your connection and try again.",
  serverError: "Something went wrong. Please try again.",
  fieldsMissing: "{{count}} fields missing",
  fieldMissingOne: "1 field missing",
  completed: "Completed",
} as const;

export type SellValidationMessages = { [K in keyof typeof SELL_VALIDATION_EN]: string };

export function defaultSellValidationMessages(
  translate?: (key: string, opts?: { defaultValue?: string; count?: number }) => string,
): SellValidationMessages {
  if (!translate) return { ...SELL_VALIDATION_EN };
  const t = translate;
  return {
    bannerTitle: t("sell.validation.bannerTitle", { defaultValue: SELL_VALIDATION_EN.bannerTitle }),
    bannerSubtitle: t("sell.validation.bannerSubtitle", { defaultValue: SELL_VALIDATION_EN.bannerSubtitle }),
    titleRequired: t("sell.validation.titleRequired", { defaultValue: SELL_VALIDATION_EN.titleRequired }),
    titleTooShort: t("sell.validation.titleTooShort", { defaultValue: SELL_VALIDATION_EN.titleTooShort }),
    categoryRequired: t("sell.validation.categoryRequired", { defaultValue: SELL_VALIDATION_EN.categoryRequired }),
    descriptionRequired: t("sell.validation.descriptionRequired", { defaultValue: SELL_VALIDATION_EN.descriptionRequired }),
    photoRequired: t("sell.validation.photoRequired", { defaultValue: SELL_VALIDATION_EN.photoRequired }),
    photoUnsupported: t("sell.validation.photoUnsupported", { defaultValue: SELL_VALIDATION_EN.photoUnsupported }),
    photoUploadFailed: t("sell.validation.photoUploadFailed", { defaultValue: SELL_VALIDATION_EN.photoUploadFailed }),
    videoUploadFailed: t("sell.validation.videoUploadFailed", { defaultValue: SELL_VALIDATION_EN.videoUploadFailed }),
    videoTooLong: t("sell.validation.videoTooLong", { defaultValue: SELL_VALIDATION_EN.videoTooLong }),
    priceInvalid: t("sell.validation.priceInvalid", { defaultValue: SELL_VALIDATION_EN.priceInvalid }),
    pricePositive: t("sell.validation.pricePositive", { defaultValue: SELL_VALIDATION_EN.pricePositive }),
    quantityInvalid: t("sell.validation.quantityInvalid", { defaultValue: SELL_VALIDATION_EN.quantityInvalid }),
    locationRequired: t("sell.validation.locationRequired", { defaultValue: SELL_VALIDATION_EN.locationRequired }),
    cityRequired: t("sell.validation.cityRequired", { defaultValue: SELL_VALIDATION_EN.cityRequired }),
    countryRequired: t("sell.validation.countryRequired", { defaultValue: SELL_VALIDATION_EN.countryRequired }),
    deliveryRequired: t("sell.validation.deliveryRequired", { defaultValue: SELL_VALIDATION_EN.deliveryRequired }),
    networkError: t("sell.validation.networkError", { defaultValue: SELL_VALIDATION_EN.networkError }),
    serverError: t("sell.validation.serverError", { defaultValue: SELL_VALIDATION_EN.serverError }),
    fieldsMissing: t("sell.validation.fieldsMissing", { defaultValue: SELL_VALIDATION_EN.fieldsMissing, count: 0 }),
    fieldMissingOne: t("sell.validation.fieldMissingOne", { defaultValue: SELL_VALIDATION_EN.fieldMissingOne }),
    completed: t("sell.validation.completed", { defaultValue: SELL_VALIDATION_EN.completed }),
  };
}

export function sectionForField(field: string): SellSectionId {
  return SELL_FIELD_SECTION[field] ?? "info";
}

export function countErrorsBySection(
  errorFields: Iterable<string>,
): Record<SellSectionId, number> {
  const counts: Record<SellSectionId, number> = {
    info: 0,
    media: 0,
    pricing: 0,
    delivery: 0,
    review: 0,
  };
  for (const field of errorFields) {
    counts[sectionForField(field)] += 1;
  }
  return counts;
}

export function formatSectionMissingLabel(
  count: number,
  messages: Pick<SellValidationMessages, "fieldsMissing" | "fieldMissingOne"> = SELL_VALIDATION_EN,
): string {
  if (count <= 0) return "";
  if (count === 1) return messages.fieldMissingOne;
  return messages.fieldsMissing.replace("{{count}}", String(count));
}

export type PublishExtraInput = {
  photoCount: number;
  minPhotos: number;
  country: string;
  dominicanDeliveryChoice?: "carrier" | "self_delivery" | null;
  intlCarriers?: string[];
  sellerDeliveryMethod?: string | null;
  isLocalDeliveryCountry?: boolean;
};

/**
 * Extra publish checks that live outside the Zod schema (photos, delivery options).
 * Returns a map of field → English (or translated) error message.
 */
export function collectExtraPublishErrors(
  input: PublishExtraInput,
  messages: SellValidationMessages = SELL_VALIDATION_EN,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.photoCount < input.minPhotos) {
    errors.photos = messages.photoRequired;
  }

  const country = input.country ?? "";
  if (country === "Dominican Republic") {
    if (input.dominicanDeliveryChoice === "carrier" && !(input.intlCarriers?.length)) {
      errors.shippingCarriers = messages.deliveryRequired;
    }
    if (!input.dominicanDeliveryChoice) {
      errors.deliveryMethod = messages.deliveryRequired;
    }
  } else if (input.isLocalDeliveryCountry) {
    if (!input.sellerDeliveryMethod) {
      errors.deliveryMethod = messages.deliveryRequired;
    }
  }

  return errors;
}

export function firstSectionWithErrors(
  counts: Record<SellSectionId, number>,
  order: SellSectionId[] = ["info", "media", "pricing", "delivery", "review"],
): SellSectionId | null {
  for (const id of order) {
    if (counts[id] > 0) return id;
  }
  return null;
}
