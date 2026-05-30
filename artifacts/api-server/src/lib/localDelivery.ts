/**
 * Local Delivery Engine — per-country local courier configs
 *
 * This covers LOCAL delivery WITHIN each country only.
 * NOT international/cross-border shipping.
 *
 * Haiti & Dominican Republic use the advanced OSRM driver-matching system (deliveryPricing.ts).
 * All other countries use this table-based local carrier selection.
 */

export interface LocalCarrier {
  name: string;
  type: "standard" | "express" | "economy";
  estimatedDays: [number, number]; // [min, max] business days
  baseFeeCents: number;            // in local currency minor units (USD cents for USD countries)
  perKgCents: number;              // per kg over 1kg
  currency: string;                // ISO 4217
  currencySymbol: string;
  maxWeightKg: number;
  trackingAvailable: boolean;
}

export interface CountryDeliveryConfig {
  country: string;
  currency: string;
  currencySymbol: string;
  // Conversion rate to USD (approx) — for display/reporting
  toUsdRate: number;
  carriers: LocalCarrier[];
  notes?: string;
}

export const LOCAL_DELIVERY_CONFIGS: Record<string, CountryDeliveryConfig> = {

  // ── Americas ──────────────────────────────────────────────────────────────

  USA: {
    country: "USA", currency: "USD", currencySymbol: "$", toUsdRate: 1,
    carriers: [
      { name: "USPS First Class",    type: "economy",  estimatedDays: [3, 7], baseFeeCents: 499,  perKgCents: 100, currency: "USD", currencySymbol: "$", maxWeightKg: 30, trackingAvailable: true },
      { name: "UPS Ground",          type: "standard", estimatedDays: [1, 5], baseFeeCents: 899,  perKgCents: 150, currency: "USD", currencySymbol: "$", maxWeightKg: 70, trackingAvailable: true },
      { name: "FedEx Express",       type: "express",  estimatedDays: [1, 2], baseFeeCents: 1999, perKgCents: 300, currency: "USD", currencySymbol: "$", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Canada: {
    country: "Canada", currency: "CAD", currencySymbol: "CA$", toUsdRate: 0.74,
    carriers: [
      { name: "Canada Post Regular", type: "economy",  estimatedDays: [3, 8], baseFeeCents: 999,  perKgCents: 200, currency: "CAD", currencySymbol: "CA$", maxWeightKg: 30, trackingAvailable: true },
      { name: "Purolator Ground",    type: "standard", estimatedDays: [1, 5], baseFeeCents: 1399, perKgCents: 250, currency: "CAD", currencySymbol: "CA$", maxWeightKg: 70, trackingAvailable: true },
      { name: "FedEx Priority",      type: "express",  estimatedDays: [1, 2], baseFeeCents: 2499, perKgCents: 400, currency: "CAD", currencySymbol: "CA$", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Mexico: {
    country: "Mexico", currency: "MXN", currencySymbol: "MX$", toUsdRate: 0.058,
    carriers: [
      { name: "Correos de México",   type: "economy",  estimatedDays: [4, 10], baseFeeCents: 10000, perKgCents: 2000, currency: "MXN", currencySymbol: "MX$", maxWeightKg: 20, trackingAvailable: false },
      { name: "Estafeta",            type: "standard", estimatedDays: [1, 5],  baseFeeCents: 18000, perKgCents: 3500, currency: "MXN", currencySymbol: "MX$", maxWeightKg: 70, trackingAvailable: true },
      { name: "DHL México",          type: "express",  estimatedDays: [1, 3],  baseFeeCents: 35000, perKgCents: 7000, currency: "MXN", currencySymbol: "MX$", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Brazil: {
    country: "Brazil", currency: "BRL", currencySymbol: "R$", toUsdRate: 0.20,
    carriers: [
      { name: "Correios PAC",        type: "economy",  estimatedDays: [4, 12], baseFeeCents: 1500, perKgCents: 300, currency: "BRL", currencySymbol: "R$", maxWeightKg: 30, trackingAvailable: true },
      { name: "Correios SEDEX",      type: "standard", estimatedDays: [1, 5],  baseFeeCents: 3000, perKgCents: 600, currency: "BRL", currencySymbol: "R$", maxWeightKg: 30, trackingAvailable: true },
      { name: "Loggi Express",       type: "express",  estimatedDays: [1, 2],  baseFeeCents: 5000, perKgCents: 1000, currency: "BRL", currencySymbol: "R$", maxWeightKg: 30, trackingAvailable: true },
    ],
  },

  Colombia: {
    country: "Colombia", currency: "COP", currencySymbol: "COP$", toUsdRate: 0.00025,
    carriers: [
      { name: "472 Correos",         type: "economy",  estimatedDays: [4, 10], baseFeeCents: 1200000, perKgCents: 200000, currency: "COP", currencySymbol: "COP$", maxWeightKg: 20, trackingAvailable: false },
      { name: "Servientrega",        type: "standard", estimatedDays: [1, 5],  baseFeeCents: 2000000, perKgCents: 400000, currency: "COP", currencySymbol: "COP$", maxWeightKg: 70, trackingAvailable: true },
      { name: "DHL Colombia",        type: "express",  estimatedDays: [1, 2],  baseFeeCents: 4500000, perKgCents: 900000, currency: "COP", currencySymbol: "COP$", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Chile: {
    country: "Chile", currency: "CLP", currencySymbol: "CL$", toUsdRate: 0.0011,
    carriers: [
      { name: "Correos de Chile",    type: "economy",  estimatedDays: [3, 8],  baseFeeCents: 400000,  perKgCents: 80000,  currency: "CLP", currencySymbol: "CL$", maxWeightKg: 20, trackingAvailable: true },
      { name: "Chilexpress",         type: "standard", estimatedDays: [1, 4],  baseFeeCents: 800000,  perKgCents: 150000, currency: "CLP", currencySymbol: "CL$", maxWeightKg: 50, trackingAvailable: true },
      { name: "DHL Chile",           type: "express",  estimatedDays: [1, 2],  baseFeeCents: 1500000, perKgCents: 300000, currency: "CLP", currencySymbol: "CL$", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Jamaica: {
    country: "Jamaica", currency: "JMD", currencySymbol: "J$", toUsdRate: 0.0064,
    carriers: [
      { name: "Jamaica Post",        type: "economy",  estimatedDays: [3, 8], baseFeeCents: 120000, perKgCents: 25000, currency: "JMD", currencySymbol: "J$", maxWeightKg: 20, trackingAvailable: false },
      { name: "GraceKennedy",        type: "standard", estimatedDays: [1, 4], baseFeeCents: 250000, perKgCents: 50000, currency: "JMD", currencySymbol: "J$", maxWeightKg: 30, trackingAvailable: true },
      { name: "DHL Jamaica",         type: "express",  estimatedDays: [1, 2], baseFeeCents: 500000, perKgCents: 100000, currency: "JMD", currencySymbol: "J$", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  "Trinidad and Tobago": {
    country: "Trinidad and Tobago", currency: "TTD", currencySymbol: "TT$", toUsdRate: 0.148,
    carriers: [
      { name: "TTPost",              type: "economy",  estimatedDays: [3, 7], baseFeeCents: 4000,  perKgCents: 800,  currency: "TTD", currencySymbol: "TT$", maxWeightKg: 20, trackingAvailable: true },
      { name: "Speedway Courier",    type: "standard", estimatedDays: [1, 3], baseFeeCents: 8000,  perKgCents: 1500, currency: "TTD", currencySymbol: "TT$", maxWeightKg: 50, trackingAvailable: true },
      { name: "DHL T&T",             type: "express",  estimatedDays: [1, 2], baseFeeCents: 18000, perKgCents: 3500, currency: "TTD", currencySymbol: "TT$", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Barbados: {
    country: "Barbados", currency: "BBD", currencySymbol: "Bds$", toUsdRate: 0.50,
    carriers: [
      { name: "Barbados Post",       type: "economy",  estimatedDays: [2, 6], baseFeeCents: 600,  perKgCents: 120,  currency: "BBD", currencySymbol: "Bds$", maxWeightKg: 20, trackingAvailable: false },
      { name: "Island Courier",      type: "standard", estimatedDays: [1, 3], baseFeeCents: 1500, perKgCents: 300,  currency: "BBD", currencySymbol: "Bds$", maxWeightKg: 30, trackingAvailable: true },
      { name: "DHL Barbados",        type: "express",  estimatedDays: [1, 2], baseFeeCents: 3500, perKgCents: 700,  currency: "BBD", currencySymbol: "Bds$", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Bahamas: {
    country: "Bahamas", currency: "BSD", currencySymbol: "B$", toUsdRate: 1.0,
    carriers: [
      { name: "Bahamas Post",        type: "economy",  estimatedDays: [3, 7], baseFeeCents: 599,  perKgCents: 100,  currency: "BSD", currencySymbol: "B$", maxWeightKg: 20, trackingAvailable: false },
      { name: "FastTrak Courier",    type: "standard", estimatedDays: [1, 4], baseFeeCents: 1200, perKgCents: 200,  currency: "BSD", currencySymbol: "B$", maxWeightKg: 50, trackingAvailable: true },
      { name: "DHL Bahamas",         type: "express",  estimatedDays: [1, 2], baseFeeCents: 2500, perKgCents: 500,  currency: "BSD", currencySymbol: "B$", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  "Puerto Rico": {
    country: "Puerto Rico", currency: "USD", currencySymbol: "$", toUsdRate: 1.0,
    carriers: [
      { name: "USPS Priority",       type: "standard", estimatedDays: [1, 4], baseFeeCents: 799,  perKgCents: 150, currency: "USD", currencySymbol: "$", maxWeightKg: 30, trackingAvailable: true },
      { name: "FedEx Express",       type: "express",  estimatedDays: [1, 2], baseFeeCents: 1999, perKgCents: 300, currency: "USD", currencySymbol: "$", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  // ── Europe ────────────────────────────────────────────────────────────────

  "United Kingdom": {
    country: "United Kingdom", currency: "GBP", currencySymbol: "£", toUsdRate: 1.27,
    carriers: [
      { name: "Royal Mail 2nd Class", type: "economy",  estimatedDays: [2, 5], baseFeeCents: 249,  perKgCents:  80, currency: "GBP", currencySymbol: "£", maxWeightKg: 20, trackingAvailable: true },
      { name: "DPD UK",              type: "standard", estimatedDays: [1, 3], baseFeeCents: 599,  perKgCents: 120, currency: "GBP", currencySymbol: "£", maxWeightKg: 70, trackingAvailable: true },
      { name: "Hermes Next Day",     type: "express",  estimatedDays: [1, 1], baseFeeCents: 999,  perKgCents: 200, currency: "GBP", currencySymbol: "£", maxWeightKg: 30, trackingAvailable: true },
    ],
  },

  France: {
    country: "France", currency: "EUR", currencySymbol: "€", toUsdRate: 1.09,
    carriers: [
      { name: "La Poste Colissimo",  type: "economy",  estimatedDays: [2, 5], baseFeeCents: 599,  perKgCents: 100, currency: "EUR", currencySymbol: "€", maxWeightKg: 30, trackingAvailable: true },
      { name: "Chronopost",          type: "standard", estimatedDays: [1, 3], baseFeeCents: 1199, perKgCents: 200, currency: "EUR", currencySymbol: "€", maxWeightKg: 30, trackingAvailable: true },
      { name: "DHL Express France",  type: "express",  estimatedDays: [1, 2], baseFeeCents: 1999, perKgCents: 350, currency: "EUR", currencySymbol: "€", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Germany: {
    country: "Germany", currency: "EUR", currencySymbol: "€", toUsdRate: 1.09,
    carriers: [
      { name: "DHL Paket",           type: "standard", estimatedDays: [1, 4], baseFeeCents: 499,  perKgCents:  80, currency: "EUR", currencySymbol: "€", maxWeightKg: 31, trackingAvailable: true },
      { name: "DPD Germany",         type: "standard", estimatedDays: [1, 3], baseFeeCents: 599,  perKgCents: 100, currency: "EUR", currencySymbol: "€", maxWeightKg: 70, trackingAvailable: true },
      { name: "DHL Express",         type: "express",  estimatedDays: [1, 2], baseFeeCents: 1799, perKgCents: 320, currency: "EUR", currencySymbol: "€", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Italy: {
    country: "Italy", currency: "EUR", currencySymbol: "€", toUsdRate: 1.09,
    carriers: [
      { name: "Poste Italiane",      type: "economy",  estimatedDays: [3, 7], baseFeeCents: 599,  perKgCents: 120, currency: "EUR", currencySymbol: "€", maxWeightKg: 20, trackingAvailable: true },
      { name: "BRT Corriere",        type: "standard", estimatedDays: [1, 4], baseFeeCents: 999,  perKgCents: 180, currency: "EUR", currencySymbol: "€", maxWeightKg: 50, trackingAvailable: true },
      { name: "DHL Express Italy",   type: "express",  estimatedDays: [1, 2], baseFeeCents: 1999, perKgCents: 350, currency: "EUR", currencySymbol: "€", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Netherlands: {
    country: "Netherlands", currency: "EUR", currencySymbol: "€", toUsdRate: 1.09,
    carriers: [
      { name: "PostNL",              type: "standard", estimatedDays: [1, 3], baseFeeCents: 449,  perKgCents:  80, currency: "EUR", currencySymbol: "€", maxWeightKg: 23, trackingAvailable: true },
      { name: "DHL Parcel NL",       type: "express",  estimatedDays: [1, 2], baseFeeCents: 999,  perKgCents: 180, currency: "EUR", currencySymbol: "€", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Belgium: {
    country: "Belgium", currency: "EUR", currencySymbol: "€", toUsdRate: 1.09,
    carriers: [
      { name: "Bpost",               type: "standard", estimatedDays: [1, 3], baseFeeCents: 499,  perKgCents:  90, currency: "EUR", currencySymbol: "€", maxWeightKg: 30, trackingAvailable: true },
      { name: "DHL Express Belgium", type: "express",  estimatedDays: [1, 2], baseFeeCents: 1599, perKgCents: 280, currency: "EUR", currencySymbol: "€", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Portugal: {
    country: "Portugal", currency: "EUR", currencySymbol: "€", toUsdRate: 1.09,
    carriers: [
      { name: "CTT Correios",        type: "economy",  estimatedDays: [2, 6], baseFeeCents: 499,  perKgCents: 100, currency: "EUR", currencySymbol: "€", maxWeightKg: 20, trackingAvailable: true },
      { name: "DHL Express Portugal",type: "express",  estimatedDays: [1, 2], baseFeeCents: 1599, perKgCents: 280, currency: "EUR", currencySymbol: "€", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Switzerland: {
    country: "Switzerland", currency: "CHF", currencySymbol: "Fr.", toUsdRate: 1.12,
    carriers: [
      { name: "Swiss Post",          type: "standard", estimatedDays: [1, 3], baseFeeCents: 899,  perKgCents: 150, currency: "CHF", currencySymbol: "Fr.", maxWeightKg: 30, trackingAvailable: true },
      { name: "DHL Express CH",      type: "express",  estimatedDays: [1, 2], baseFeeCents: 1899, perKgCents: 350, currency: "CHF", currencySymbol: "Fr.", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Sweden: {
    country: "Sweden", currency: "SEK", currencySymbol: "kr", toUsdRate: 0.096,
    carriers: [
      { name: "PostNord Sverige",    type: "standard", estimatedDays: [1, 4], baseFeeCents: 5900,  perKgCents: 1000, currency: "SEK", currencySymbol: "kr", maxWeightKg: 20, trackingAvailable: true },
      { name: "DHL Express Sweden",  type: "express",  estimatedDays: [1, 2], baseFeeCents: 14900, perKgCents: 2500, currency: "SEK", currencySymbol: "kr", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Norway: {
    country: "Norway", currency: "NOK", currencySymbol: "kr", toUsdRate: 0.095,
    carriers: [
      { name: "Posten Norge",        type: "standard", estimatedDays: [1, 4], baseFeeCents: 7900,  perKgCents: 1500, currency: "NOK", currencySymbol: "kr", maxWeightKg: 20, trackingAvailable: true },
      { name: "DHL Express Norway",  type: "express",  estimatedDays: [1, 2], baseFeeCents: 17900, perKgCents: 3000, currency: "NOK", currencySymbol: "kr", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  // ── Africa ────────────────────────────────────────────────────────────────

  Nigeria: {
    country: "Nigeria", currency: "NGN", currencySymbol: "₦", toUsdRate: 0.00065,
    carriers: [
      { name: "GIG Logistics",       type: "economy",  estimatedDays: [2, 6], baseFeeCents: 300000,  perKgCents: 60000,  currency: "NGN", currencySymbol: "₦", maxWeightKg: 30, trackingAvailable: true },
      { name: "Kwik Delivery",       type: "standard", estimatedDays: [1, 3], baseFeeCents: 500000,  perKgCents: 100000, currency: "NGN", currencySymbol: "₦", maxWeightKg: 20, trackingAvailable: true },
      { name: "DHL Nigeria",         type: "express",  estimatedDays: [1, 2], baseFeeCents: 1200000, perKgCents: 250000, currency: "NGN", currencySymbol: "₦", maxWeightKg: 70, trackingAvailable: true },
    ],
    notes: "Rates apply for same-state delivery. Cross-state may incur additional charges.",
  },

  Ghana: {
    country: "Ghana", currency: "GHS", currencySymbol: "GH₵", toUsdRate: 0.068,
    carriers: [
      { name: "GhanaPost",           type: "economy",  estimatedDays: [3, 8], baseFeeCents: 3500,  perKgCents: 700,  currency: "GHS", currencySymbol: "GH₵", maxWeightKg: 20, trackingAvailable: false },
      { name: "Aramex Ghana",        type: "standard", estimatedDays: [1, 4], baseFeeCents: 7000,  perKgCents: 1400, currency: "GHS", currencySymbol: "GH₵", maxWeightKg: 50, trackingAvailable: true },
      { name: "DHL Ghana",           type: "express",  estimatedDays: [1, 2], baseFeeCents: 15000, perKgCents: 3000, currency: "GHS", currencySymbol: "GH₵", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Kenya: {
    country: "Kenya", currency: "KES", currencySymbol: "KSh", toUsdRate: 0.0077,
    carriers: [
      { name: "Posta Kenya",         type: "economy",  estimatedDays: [3, 8], baseFeeCents: 50000,  perKgCents: 10000, currency: "KES", currencySymbol: "KSh", maxWeightKg: 20, trackingAvailable: false },
      { name: "G4S Kenya",           type: "standard", estimatedDays: [1, 4], baseFeeCents: 100000, perKgCents: 20000, currency: "KES", currencySymbol: "KSh", maxWeightKg: 50, trackingAvailable: true },
      { name: "DHL Kenya",           type: "express",  estimatedDays: [1, 2], baseFeeCents: 220000, perKgCents: 45000, currency: "KES", currencySymbol: "KSh", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Senegal: {
    country: "Senegal", currency: "XOF", currencySymbol: "CFA", toUsdRate: 0.0016,
    carriers: [
      { name: "La Poste Sénégal",    type: "economy",  estimatedDays: [3, 8], baseFeeCents: 300000,  perKgCents: 60000,  currency: "XOF", currencySymbol: "CFA", maxWeightKg: 20, trackingAvailable: false },
      { name: "DHL Sénégal",         type: "express",  estimatedDays: [1, 3], baseFeeCents: 700000,  perKgCents: 140000, currency: "XOF", currencySymbol: "CFA", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  "South Africa": {
    country: "South Africa", currency: "ZAR", currencySymbol: "R", toUsdRate: 0.054,
    carriers: [
      { name: "South African Post",  type: "economy",  estimatedDays: [4, 10], baseFeeCents: 8000,  perKgCents: 1500, currency: "ZAR", currencySymbol: "R", maxWeightKg: 20, trackingAvailable: true },
      { name: "PostNet",             type: "standard", estimatedDays: [1, 5],  baseFeeCents: 15000, perKgCents: 3000, currency: "ZAR", currencySymbol: "R", maxWeightKg: 50, trackingAvailable: true },
      { name: "Aramex South Africa", type: "express",  estimatedDays: [1, 3],  baseFeeCents: 28000, perKgCents: 5500, currency: "ZAR", currencySymbol: "R", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  // ── Asia-Pacific ──────────────────────────────────────────────────────────

  Philippines: {
    country: "Philippines", currency: "PHP", currencySymbol: "₱", toUsdRate: 0.018,
    carriers: [
      { name: "LBC Express",         type: "economy",  estimatedDays: [2, 6], baseFeeCents: 12000, perKgCents: 2000, currency: "PHP", currencySymbol: "₱", maxWeightKg: 30, trackingAvailable: true },
      { name: "J&T Express",         type: "standard", estimatedDays: [1, 4], baseFeeCents: 8000,  perKgCents: 1500, currency: "PHP", currencySymbol: "₱", maxWeightKg: 50, trackingAvailable: true },
      { name: "Flash Express",       type: "express",  estimatedDays: [1, 2], baseFeeCents: 20000, perKgCents: 4000, currency: "PHP", currencySymbol: "₱", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  India: {
    country: "India", currency: "INR", currencySymbol: "₹", toUsdRate: 0.012,
    carriers: [
      { name: "India Post",          type: "economy",  estimatedDays: [4, 10], baseFeeCents: 5000,  perKgCents: 1000, currency: "INR", currencySymbol: "₹", maxWeightKg: 20, trackingAvailable: true },
      { name: "Delhivery",           type: "standard", estimatedDays: [2, 5],  baseFeeCents: 12000, perKgCents: 2500, currency: "INR", currencySymbol: "₹", maxWeightKg: 50, trackingAvailable: true },
      { name: "BlueDart",            type: "express",  estimatedDays: [1, 3],  baseFeeCents: 22000, perKgCents: 4500, currency: "INR", currencySymbol: "₹", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Japan: {
    country: "Japan", currency: "JPY", currencySymbol: "¥", toUsdRate: 0.0065,
    carriers: [
      { name: "Japan Post",          type: "economy",  estimatedDays: [2, 5], baseFeeCents: 90000,  perKgCents: 15000, currency: "JPY", currencySymbol: "¥", maxWeightKg: 30, trackingAvailable: true },
      { name: "Yamato Transport",    type: "standard", estimatedDays: [1, 3], baseFeeCents: 100000, perKgCents: 18000, currency: "JPY", currencySymbol: "¥", maxWeightKg: 25, trackingAvailable: true },
      { name: "Sagawa Express",      type: "express",  estimatedDays: [1, 2], baseFeeCents: 150000, perKgCents: 28000, currency: "JPY", currencySymbol: "¥", maxWeightKg: 30, trackingAvailable: true },
    ],
  },

  "South Korea": {
    country: "South Korea", currency: "KRW", currencySymbol: "₩", toUsdRate: 0.00073,
    carriers: [
      { name: "Korea Post",          type: "economy",  estimatedDays: [2, 5], baseFeeCents: 400000,  perKgCents: 80000,  currency: "KRW", currencySymbol: "₩", maxWeightKg: 20, trackingAvailable: true },
      { name: "CJ Logistics",        type: "standard", estimatedDays: [1, 3], baseFeeCents: 500000,  perKgCents: 100000, currency: "KRW", currencySymbol: "₩", maxWeightKg: 30, trackingAvailable: true },
      { name: "DHL Korea",           type: "express",  estimatedDays: [1, 2], baseFeeCents: 1200000, perKgCents: 240000, currency: "KRW", currencySymbol: "₩", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  Australia: {
    country: "Australia", currency: "AUD", currencySymbol: "A$", toUsdRate: 0.65,
    carriers: [
      { name: "Australia Post Std",  type: "economy",  estimatedDays: [3, 8], baseFeeCents: 1099, perKgCents: 200, currency: "AUD", currencySymbol: "A$", maxWeightKg: 22, trackingAvailable: true },
      { name: "Sendle",              type: "standard", estimatedDays: [1, 5], baseFeeCents: 899,  perKgCents: 180, currency: "AUD", currencySymbol: "A$", maxWeightKg: 25, trackingAvailable: true },
      { name: "StarTrack Express",   type: "express",  estimatedDays: [1, 2], baseFeeCents: 2199, perKgCents: 400, currency: "AUD", currencySymbol: "A$", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  "United Arab Emirates": {
    country: "United Arab Emirates", currency: "AED", currencySymbol: "AED", toUsdRate: 0.272,
    carriers: [
      { name: "Emirates Post",       type: "economy",  estimatedDays: [2, 5], baseFeeCents: 2500, perKgCents: 500,  currency: "AED", currencySymbol: "AED", maxWeightKg: 20, trackingAvailable: true },
      { name: "Aramex UAE",          type: "standard", estimatedDays: [1, 3], baseFeeCents: 5000, perKgCents: 1000, currency: "AED", currencySymbol: "AED", maxWeightKg: 70, trackingAvailable: true },
      { name: "DHL UAE",             type: "express",  estimatedDays: [1, 2], baseFeeCents: 9000, perKgCents: 1800, currency: "AED", currencySymbol: "AED", maxWeightKg: 70, trackingAvailable: true },
    ],
  },

  "Saudi Arabia": {
    country: "Saudi Arabia", currency: "SAR", currencySymbol: "SAR", toUsdRate: 0.267,
    carriers: [
      { name: "Saudi Post (SPL)",    type: "economy",  estimatedDays: [2, 6], baseFeeCents: 2000,  perKgCents: 400,  currency: "SAR", currencySymbol: "SAR", maxWeightKg: 20, trackingAvailable: true },
      { name: "Aramex KSA",          type: "standard", estimatedDays: [1, 3], baseFeeCents: 5000,  perKgCents: 1000, currency: "SAR", currencySymbol: "SAR", maxWeightKg: 70, trackingAvailable: true },
      { name: "DHL Saudi Arabia",    type: "express",  estimatedDays: [1, 2], baseFeeCents: 9500,  perKgCents: 1900, currency: "SAR", currencySymbol: "SAR", maxWeightKg: 70, trackingAvailable: true },
    ],
  },
};

// ── Helper: get local delivery quote ─────────────────────────────────────────

export interface LocalDeliveryQuote {
  carrier: string;
  type: "standard" | "express" | "economy";
  estimatedDays: [number, number];
  feeCents: number;      // in local currency minor units
  feeUsd: number;        // converted to USD
  currency: string;
  currencySymbol: string;
  trackingAvailable: boolean;
}

/**
 * Get local delivery options for a country.
 * @param country  Exact country name (e.g. "Nigeria")
 * @param weightKg Package weight in kg
 * @returns Array of quote options sorted economy→standard→express, or [] if country unsupported here
 */
export function getLocalDeliveryQuotes(country: string, weightKg: number): LocalDeliveryQuote[] {
  const config = LOCAL_DELIVERY_CONFIGS[country];
  if (!config) return []; // Haiti/DR handled by deliveryPricing.ts

  const extraKg = Math.max(0, weightKg - 1);
  return config.carriers.map((c) => {
    const feeCents = c.baseFeeCents + Math.round(extraKg * c.perKgCents);
    const feeUsd   = Math.round(feeCents * config.toUsdRate) / 100; // in USD dollars
    return {
      carrier:          c.name,
      type:             c.type,
      estimatedDays:    c.estimatedDays,
      feeCents,
      feeUsd,
      currency:         c.currency,
      currencySymbol:   c.currencySymbol,
      trackingAvailable: c.trackingAvailable,
    };
  }).sort((a, b) => a.feeUsd - b.feeUsd);
}

/**
 * Countries that use the advanced OSRM driver-matching (deliveryPricing.ts).
 */
export const DRIVER_MATCHING_COUNTRIES = new Set(["Haiti", "Dominican Republic"]);

/**
 * Returns true if the country supports any form of local delivery.
 */
export function supportsLocalDelivery(country: string): boolean {
  return DRIVER_MATCHING_COUNTRIES.has(country) || country in LOCAL_DELIVERY_CONFIGS;
}
