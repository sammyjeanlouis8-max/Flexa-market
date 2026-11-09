/**
 * Country-aware payment method capabilities for Flexa Market checkout.
 * Used to decide which methods to advertise in UI — Stripe Elements still
 * auto-hides unavailable wallets on the device.
 *
 * Does NOT change registration country. Uses checkout / account country.
 */

export type WalletCapability = {
  applePay: boolean;
  googlePay: boolean;
  card: boolean;
  link: boolean;
  /** Flexa Card / wallet balance — product flag, not Stripe. */
  flexaCard: boolean;
  currency: "usd";
  reason?: string;
};

/** Markets where Stripe card + wallet checkout is offered. */
const STRIPE_CARD_COUNTRIES = new Set([
  "USA", "United States", "Canada", "United Kingdom", "France", "Germany",
  "Spain", "Italy", "Portugal", "Belgium", "Netherlands", "Ireland", "Austria",
  "Finland", "Greece", "Luxembourg", "Switzerland", "Norway", "Sweden",
  "Denmark", "Poland", "Australia", "Japan", "South Korea", "Mexico", "Brazil",
  "Chile", "Dominican Republic", "Puerto Rico", "Jamaica", "Bahamas",
  "Trinidad and Tobago", "Barbados", "United Arab Emirates", "Saudi Arabia",
  "India", "Philippines", "South Africa", "Kenya", "Ghana", "Haiti",
]);

export function resolveWalletCapabilities(opts: {
  checkoutCountry?: string | null;
  accountCountry?: string | null;
}): WalletCapability {
  const country = (opts.checkoutCountry || opts.accountCountry || "").trim();
  const stripeOk = !country || STRIPE_CARD_COUNTRIES.has(country);

  if (!stripeOk) {
    return {
      applePay: false,
      googlePay: false,
      card: false,
      link: false,
      flexaCard: true,
      currency: "usd",
      reason: "Stripe card checkout is not offered for this market",
    };
  }

  // Apple/Google Pay availability is ultimately device/browser gated.
  // We advertise them for Stripe markets; Elements hide when unavailable.
  return {
    applePay: true,
    googlePay: true,
    card: true,
    link: true,
    flexaCard: true,
    currency: "usd",
  };
}

/**
 * Shared Checkout Session options that unlock wallets + optional save-card
 * without introducing a second payment stack.
 */
export function modernCheckoutSessionExtras(opts: {
  customerId: string;
  /** When true, Checkout shows "save payment method" (customer consent). */
  allowSaveCard?: boolean;
}): Partial<import("stripe").Stripe.Checkout.SessionCreateParams> {
  const extras: Partial<import("stripe").Stripe.Checkout.SessionCreateParams> = {
    customer: opts.customerId,
    // Card + Link; Apple Pay / Google Pay appear automatically when eligible.
    payment_method_types: ["card", "link"],
    billing_address_collection: "auto",
    customer_update: {
      address: "auto",
      name: "auto",
    },
  };

  if (opts.allowSaveCard !== false) {
    extras.saved_payment_method_options = {
      payment_method_save: "enabled",
      allow_redisplay_filters: ["always"],
    };
  }

  return extras;
}
