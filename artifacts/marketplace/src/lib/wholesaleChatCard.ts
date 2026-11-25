/** Shared Flexa Wholesale product-card payload for Market chat. */

export const WHOLESALE_CARD_KIND = "wholesale_product_card" as const;
export const WHOLESALE_CARD_MESSAGE_TYPE = "wholesale_card" as const;

export type WholesaleProductCardPayload = {
  v: 1;
  kind: typeof WHOLESALE_CARD_KIND;
  productId: number;
  title: string;
  image: string | null;
  unitPrice: number;
  currency: string;
  minOrderQty: number;
  wholesaleUnitType: string;
  qty?: number;
};

export function wholesaleCardClientMessageId(productId: number): string {
  return `wholesale-card-${productId}`;
}

export function buildWholesaleCardPayload(input: {
  productId: number;
  title: string;
  image?: string | null;
  unitPrice: number;
  currency?: string | null;
  minOrderQty: number;
  wholesaleUnitType?: string | null;
  qty?: number;
}): WholesaleProductCardPayload {
  return {
    v: 1,
    kind: WHOLESALE_CARD_KIND,
    productId: input.productId,
    title: String(input.title || "Wholesale product").slice(0, 160),
    image: input.image ? String(input.image).slice(0, 500) : null,
    unitPrice: Number(input.unitPrice) || 0,
    currency: String(input.currency || "USD").slice(0, 8),
    minOrderQty: Math.max(1, Math.floor(Number(input.minOrderQty) || 1)),
    wholesaleUnitType: String(input.wholesaleUnitType || "unit").slice(0, 40),
    ...(input.qty != null ? { qty: Math.max(1, Math.floor(Number(input.qty) || 1)) } : {}),
  };
}

export function serializeWholesaleCard(payload: WholesaleProductCardPayload): string {
  return JSON.stringify(payload);
}

export function parseWholesaleCard(content: string | null | undefined): WholesaleProductCardPayload | null {
  if (!content) return null;
  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) {
    // Legacy opener: "From Flexa Wholesale · Title · qty N [wholesale:ID]"
    const m = trimmed.match(/\[wholesale:(\d+)\]/);
    if (!m) return null;
    const productId = Number(m[1]);
    if (!Number.isFinite(productId) || productId <= 0) return null;
    const titleMatch = trimmed.match(/^From Flexa Wholesale · (.+?) · qty /);
    return {
      v: 1,
      kind: WHOLESALE_CARD_KIND,
      productId,
      title: titleMatch?.[1]?.trim() || "Wholesale product",
      image: null,
      unitPrice: 0,
      currency: "USD",
      minOrderQty: 1,
      wholesaleUnitType: "unit",
    };
  }
  try {
    const data = JSON.parse(trimmed) as Partial<WholesaleProductCardPayload>;
    if (data?.kind !== WHOLESALE_CARD_KIND) return null;
    const productId = Number(data.productId);
    if (!Number.isFinite(productId) || productId <= 0) return null;
    return {
      v: 1,
      kind: WHOLESALE_CARD_KIND,
      productId,
      title: String(data.title || "Wholesale product").slice(0, 160),
      image: data.image ? String(data.image) : null,
      unitPrice: Number(data.unitPrice) || 0,
      currency: String(data.currency || "USD"),
      minOrderQty: Math.max(1, Math.floor(Number(data.minOrderQty) || 1)),
      wholesaleUnitType: String(data.wholesaleUnitType || "unit"),
      ...(data.qty != null ? { qty: Math.max(1, Math.floor(Number(data.qty) || 1)) } : {}),
    };
  } catch {
    return null;
  }
}

export function wholesaleCardPreview(payload: WholesaleProductCardPayload): string {
  return `📦 ${payload.title}`;
}
