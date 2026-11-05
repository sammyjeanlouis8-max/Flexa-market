/**
 * Delivery confirmation eligibility — destination country + shipping service type.
 *
 * NEVER use GPS, IP address, or the viewer's account country to decide:
 * - Haiti domestic PIN confirmation
 * - External carrier Proof-of-Delivery (POD) photos (UPS/USPS/FedEx/DHL/etc.)
 *
 * Domestic Haiti: preserve FM local delivery + customer PIN. Carrier POD is forbidden.
 * Eligible international / company-carrier shipments: POD photos only when returned by
 * authorized carrier integrations (never fabricated).
 */
import { dominicanOrderMode } from "./dominicanFulfillment";

export type DeliveryConfirmationMode =
  | "haiti_pin"
  | "dr_seller_pin"
  | "carrier_tracking"
  | "pickup"
  | "unknown";

export type DeliveryConfirmationInput = {
  /** Preferred: carrier/shipment destination when verified. */
  shipmentDestinationCountry?: string | null;
  /** Checkout ship-to country when stored separately. */
  shipToCountry?: string | null;
  /** Listing / order listingCountry snapshot (used when ship-to country is absent). */
  listingCountry?: string | null;
  /** Service type: motorcycle | car | bus | self_delivery | UPS | FedEx | … */
  deliveryMethod?: string | null;
  /** Order deliveryType: delivery | pickup | buyer_proposed */
  deliveryType?: string | null;
  /** Carrier label when already assigned (AfterShip slug / seller-entered). */
  carrier?: string | null;
};

const HAITI = "haiti";
const DR = "dominican republic";

const HAITI_LOCAL_METHODS = new Set(["motorcycle", "car", "bus"]);
const EXTERNAL_CARRIER_HINT =
  /\b(ups|usps|fedex|dhl|aftership|canada\s*post|purolator|royal\s*mail)\b/i;

function normalizeCountry(raw: string | null | undefined): string | null {
  const c = (raw ?? "").trim().toLowerCase();
  if (!c) return null;
  if (c === "ht" || c === "haiti") return "Haiti";
  if (c === "do" || c === "dom" || c === "dominican republic" || c === "republica dominicana" || c === "república dominicana") {
    return "Dominican Republic";
  }
  // Preserve other labels as Title-ish original trim
  return (raw ?? "").trim() || null;
}

/**
 * Verified destination for policy: shipment destination → ship-to → listing country.
 * Explicitly does NOT accept account country / GPS / IP.
 */
export function resolveDeliveryDestinationCountry(input: DeliveryConfirmationInput): string | null {
  return (
    normalizeCountry(input.shipmentDestinationCountry) ||
    normalizeCountry(input.shipToCountry) ||
    normalizeCountry(input.listingCountry) ||
    null
  );
}

function isHaitiCountry(country: string | null): boolean {
  return (country ?? "").toLowerCase() === HAITI;
}

function isDrCountry(country: string | null): boolean {
  return (country ?? "").toLowerCase() === DR;
}

function methodLooksExternalCarrier(method: string | null | undefined, carrier: string | null | undefined): boolean {
  const blob = `${method ?? ""} ${carrier ?? ""}`;
  return EXTERNAL_CARRIER_HINT.test(blob);
}

/**
 * Resolve how delivery must be confirmed for this shipment.
 */
export function resolveDeliveryConfirmationMode(input: DeliveryConfirmationInput): DeliveryConfirmationMode {
  if ((input.deliveryType ?? "delivery") === "pickup") return "pickup";

  const destination = resolveDeliveryDestinationCountry(input);
  const method = (input.deliveryMethod ?? "").trim();

  // Domestic Haiti local FM delivery → PIN workflow only.
  if (isHaitiCountry(destination)) {
    if (!method || HAITI_LOCAL_METHODS.has(method) || method === "self_delivery") {
      return "haiti_pin";
    }
    // Even if a carrier string was mistakenly attached, Haiti destination stays PIN.
    if (!methodLooksExternalCarrier(method, input.carrier)) {
      return "haiti_pin";
    }
    // Misconfigured Haiti + external carrier label: still force PIN / local — never carrier POD.
    return "haiti_pin";
  }

  if (isDrCountry(destination)) {
    const mode = dominicanOrderMode("Dominican Republic", method || null);
    if (mode === "seller") return "dr_seller_pin";
    if (mode === "company") return "carrier_tracking";
    // Unknown DR method → do not enable carrier POD by default
    return "unknown";
  }

  // Non-Haiti / non-local destinations use carrier tracking when a service is present.
  if (method || input.carrier) return "carrier_tracking";
  return "unknown";
}

/** True when destination is Haiti and confirmation is the local FM PIN flow. */
export function isDomesticHaitiPinDelivery(input: DeliveryConfirmationInput): boolean {
  return resolveDeliveryConfirmationMode(input) === "haiti_pin";
}

/**
 * External carrier Proof-of-Delivery photos (UPS/USPS/FedEx/DHL/…) may only be
 * requested or displayed for carrier_tracking shipments — never for Haiti domestic.
 */
export function isCarrierPodPhotoEligible(input: DeliveryConfirmationInput): boolean {
  return resolveDeliveryConfirmationMode(input) === "carrier_tracking";
}

/** Carrier shipment registration (AfterShip etc.) — blocked for PIN/local modes. */
export function isExternalCarrierRegistrationEligible(input: DeliveryConfirmationInput): boolean {
  return resolveDeliveryConfirmationMode(input) === "carrier_tracking";
}

/** Strip / refuse carrier POD payloads for ineligible shipments. */
export function filterCarrierPodPhotos<T extends { url?: string | null; photoUrl?: string | null }>(
  input: DeliveryConfirmationInput,
  photos: T[] | null | undefined,
): T[] {
  if (!isCarrierPodPhotoEligible(input)) return [];
  if (!Array.isArray(photos)) return [];
  // Only keep entries that already have a real URL from an authorized integration.
  return photos.filter((p) => Boolean(p?.url || p?.photoUrl));
}

export function deliveryConfirmationPublicFields(input: DeliveryConfirmationInput) {
  const destinationCountry = resolveDeliveryDestinationCountry(input);
  const confirmationMode = resolveDeliveryConfirmationMode(input);
  return {
    destinationCountry,
    confirmationMode,
    carrierPodEligible: confirmationMode === "carrier_tracking",
    haitiPinConfirmation: confirmationMode === "haiti_pin",
    /** @deprecated Prefer confirmationMode — kept for existing clients that key off isHaiti */
    usesLocalPinFlow: confirmationMode === "haiti_pin" || confirmationMode === "dr_seller_pin",
  };
}
