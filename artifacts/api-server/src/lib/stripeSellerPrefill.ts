/**
 * Only use information already present on the public seller profile.
 * Do not infer legal identity, business type, or a company registration from
 * a display name: the seller still confirms those in Stripe-hosted onboarding.
 */
export function buildStripeSellerPrefill(seller: { id: number; name?: string | null }) {
  const name = seller.name?.trim().replace(/\s+/g, " ");
  // The verified public marketplace origin, not a development/return URL.
  const business_profile = {
    ...(name ? { name } : {}),
    url: `https://flexamarket.com/profile/${seller.id}`,
  };

  // Stripe requires 5–22 Latin characters, at least one letter, and no
  // forbidden symbols. Leave unsuitable names for hosted onboarding rather
  // than inventing a shared platform descriptor or an unrelated business name.
  const descriptor = (name ?? "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9 ._-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, 22)
    .trim();

  return {
    business_profile,
    ...(descriptor.length >= 5 && /[A-Z]/.test(descriptor)
      ? { settings: { payments: { statement_descriptor: descriptor } } }
      : {}),
  };
}
