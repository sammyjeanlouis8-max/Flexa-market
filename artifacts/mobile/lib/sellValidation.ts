export const CONDITIONS = ["new", "like_new", "good", "fair", "poor"] as const;
export type SellCondition = (typeof CONDITIONS)[number];

export const CURRENCIES = ["USD", "HTG", "DOP"] as const;
export type SellCurrency = (typeof CURRENCIES)[number];

export const MIN_IMAGES = 1;
export const MAX_IMAGES = 5;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type SellFormValues = {
  title: string;
  description: string;
  price: string;
  currency: SellCurrency;
  categoryId: number | null;
  subcategoryId: number | null;
  condition: SellCondition;
  location: string;
  city: string;
  stockQuantity: string;
  shippingCost: string;
  shippingCarriers: string[];
  deliveryMethod: "motorcycle" | "car" | "bus" | "self_delivery" | null;
  weightLbs: string;
  packageLengthIn: string;
  packageWidthIn: string;
  packageHeightIn: string;
  itemSize: string;
};

export type SellValidationErrors = Partial<Record<keyof SellFormValues | "images" | "country", string>>;

export function defaultSellForm(): SellFormValues {
  return {
    title: "",
    description: "",
    price: "",
    currency: "USD",
    categoryId: null,
    subcategoryId: null,
    condition: "good",
    location: "",
    city: "",
    stockQuantity: "",
    shippingCost: "",
    shippingCarriers: [],
    deliveryMethod: null,
    weightLbs: "",
    packageLengthIn: "",
    packageWidthIn: "",
    packageHeightIn: "",
    itemSize: "",
  };
}

export function validateSellForm(
  values: SellFormValues,
  opts: { imageCount: number; country?: string | null; isEdit?: boolean },
): SellValidationErrors {
  const errors: SellValidationErrors = {};
  const title = values.title.trim();
  const description = values.description.trim();
  const location = values.location.trim();
  const priceNum = Number(values.price);

  if (title.length < 3) errors.title = "Title must be at least 3 characters.";
  if (description.length < 10) errors.description = "Description must be at least 10 characters.";
  if (!Number.isFinite(priceNum) || priceNum <= 0) errors.price = "Enter a valid price greater than 0.";
  if (!values.categoryId) errors.categoryId = "Choose a category.";
  if (!CONDITIONS.includes(values.condition)) errors.condition = "Choose a condition.";
  if (!location) errors.location = "Location is required.";
  if (!opts.country) errors.country = "Set your marketplace country in Profile before selling.";

  const minPhotos = opts.isEdit ? 1 : MIN_IMAGES;
  if (opts.imageCount < minPhotos) {
    errors.images = `Add at least ${minPhotos} product photo${minPhotos === 1 ? "" : "s"}.`;
  }
  if (opts.imageCount > MAX_IMAGES) {
    errors.images = `Maximum ${MAX_IMAGES} photos.`;
  }

  if (values.stockQuantity.trim()) {
    const stock = Number(values.stockQuantity);
    if (!Number.isInteger(stock) || stock < 0) {
      errors.stockQuantity = "Stock must be a whole number (or leave blank).";
    }
  }

  if (values.shippingCost.trim()) {
    const ship = Number(values.shippingCost);
    if (!Number.isFinite(ship) || ship < 0) {
      errors.shippingCost = "Shipping cost must be 0 or greater.";
    }
  }

  return errors;
}

export function carriersForCountry(country: string | null | undefined): string[] {
  if (country === "Dominican Republic") {
    return ["Domex / Enviamex", "Vimenpaq", "Caribe Pack"];
  }
  return ["UPS", "FedEx", "DHL", "USPS", "Other"];
}

export function defaultDeliveryForCountry(country: string | null | undefined): SellFormValues["deliveryMethod"] {
  if (country === "Haiti") return "motorcycle";
  if (country === "Dominican Republic") return null; // carrier or self_delivery chosen in UI
  return null;
}
