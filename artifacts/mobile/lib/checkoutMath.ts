/** Client-side display totals only — server remains authoritative. */

export type CheckoutLine = {
  price: number;
  quantity: number;
};

export function cartSubtotal(lines: CheckoutLine[]): number {
  return lines.reduce((sum, line) => sum + line.price * Math.max(1, line.quantity || 1), 0);
}

export function referralFeeUsd(subtotal: number, referredByUserId?: number | null): number {
  if (!referredByUserId) return 0;
  return subtotal > 14.99 ? 0.5 : 0;
}

export function grandTotalUsd(opts: {
  subtotal: number;
  deliveryFeeUsd?: number;
  buyerFeeUsd?: number;
  referralFeeUsd?: number;
}): number {
  return (
    Math.max(0, opts.subtotal) +
    Math.max(0, opts.deliveryFeeUsd ?? 0) +
    Math.max(0, opts.buyerFeeUsd ?? 0) +
    Math.max(0, opts.referralFeeUsd ?? 0)
  );
}

export function isDigitalGoodsBlockedPath(path: string): boolean {
  const normalized = (path.split("?")[0] || "/").replace(/^\/api(?=\/|$)/i, "").toLowerCase();
  return (
    /^\/subscription\/checkout\/?$/.test(normalized) ||
    /^\/listings\/[^/]+\/boost(\/|$)/.test(normalized) ||
    /^\/wallet\/topup\//.test(normalized) ||
    /^\/music\//.test(normalized)
  );
}
