export type Quote = {
  totalAmount: number;
  rate: number;
  commissionAmount: number;
  sellerEarnings: number;
  reason:
    | "category_override"
    | "platform_default"
    | "moncash_rate"
    | "stripe_rate"
    | "new_seller_promo";
  paymentMethod?: string;
  // Buyer fee (card payments only — 0 for wallet/promo/MonCash)
  buyerFeeRate?: number;
  buyerFeeAmount?: number;
  // Delivery fee collected at checkout and paid out to driver
  deliveryFeeUsd?: number;
  // Speed tier label e.g. "Rapid" shown in the delivery row
  deliveryTierName?: string;
  // Driver tip — 100% goes to driver, zero platform cut
  tipUsd?: number;
  buyerTotal?: number;
};

const DELIVERY_COMMISSION_RATE = 0.15; // Flexa takes 15% of delivery fee
const DRIVER_RATE = 0.85;              // Driver keeps 85% of delivery fee

/**
 * Compact breakdown card used in the checkout dialog and on the order detail
 * page. `audience` switches the framing between the buyer's view (shows
 * buyer fee + total) and the seller's view (full commission split).
 */
export default function CommissionBreakdown({
  quote,
  audience = "seller",
  deliveryLoading = false,
  showDeliveryRow = false,
  tipUsd: tipProp,
  deliveryTierName: tierNameProp,
}: {
  quote: Quote;
  audience?: "seller" | "buyer";
  /** True while the delivery fee is being calculated (shows spinner text). */
  deliveryLoading?: boolean;
  /** Always render the delivery fee row even when the fee is 0. */
  showDeliveryRow?: boolean;
  /** Override tip amount (pass from parent state when picker is live). */
  tipUsd?: number;
  /** Override tier name to show in delivery row e.g. "Rapid". */
  deliveryTierName?: string;
  /** @deprecated kept for backward compat — no longer used */
  deliveryFeeKnown?: boolean;
}) {
  const ratePct = (quote.rate * 100).toFixed(1);
  const hasBuyerFee = (quote.buyerFeeRate ?? 0) > 0;
  const buyerFeeAmt = quote.buyerFeeAmount ?? 0;
  const deliveryFee = quote.deliveryFeeUsd ?? 0;
  const hasDeliveryFee = deliveryFee > 0;
  const showDelivery = hasDeliveryFee || showDeliveryRow;
  const tipAmount = tipProp ?? quote.tipUsd ?? 0;
  const hasTip = tipAmount > 0;
  const buyerTotal = (quote.buyerTotal ?? quote.totalAmount) + tipAmount;
  const tierLabel = tierNameProp ?? quote.deliveryTierName;

  // Delivery commission split
  const deliveryCommission = hasDeliveryFee ? parseFloat((deliveryFee * DELIVERY_COMMISSION_RATE).toFixed(2)) : 0;
  const driverEarnings = hasDeliveryFee ? parseFloat((deliveryFee * DRIVER_RATE).toFixed(2)) : 0;

  if (audience === "buyer") {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1.5" data-testid="commission-breakdown-buyer">
        {/* ── Product price ── */}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">📦 Pri atik</span>
          <span className="font-semibold" data-testid="text-item-price">${quote.totalAmount.toFixed(2)}</span>
        </div>

        {/* ── Buyer service fee (card only) ── */}
        {hasBuyerFee && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              Frè sèvis achte <span className="text-amber-500 font-semibold" data-testid="text-buyer-fee-rate">({((quote.buyerFeeRate ?? 0) * 100).toFixed(1)}%)</span>
            </span>
            <span className="font-semibold text-amber-600 dark:text-amber-400" data-testid="text-buyer-fee">+${buyerFeeAmt.toFixed(2)}</span>
          </div>
        )}

        {/* ── Delivery fee ── */}
        {showDelivery && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              🚚 Frè livrezon{tierLabel ? <span className="text-foreground font-semibold"> ({tierLabel})</span> : ""}
            </span>
            {deliveryLoading ? (
              <span className="text-muted-foreground italic" data-testid="text-delivery-fee">Kalkil...</span>
            ) : hasDeliveryFee ? (
              <span className="font-semibold text-blue-600 dark:text-blue-400" data-testid="text-delivery-fee">+${deliveryFee.toFixed(2)}</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-semibold text-[11px]" data-testid="text-delivery-fee">⚠️ Antre vil ou ↑</span>
            )}
          </div>
        )}
        {/* Delivery required notice */}
        {showDelivery && !hasDeliveryFee && !deliveryLoading && (
          <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/40 rounded-lg px-2.5 py-1.5">
            <span className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold">Livrezon obligatwa — li pa gratis. Chofè ap touche dirèkteman nan kont FM yo.</span>
          </div>
        )}

        {/* ── Tip ── */}
        {hasTip && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              💰 Tip chofè <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">(100% chofè)</span>
            </span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400" data-testid="text-tip">+${tipAmount.toFixed(2)}</span>
          </div>
        )}

        <div className="border-t border-border/60 my-1" />

        {/* ── Product commission ── */}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">
            🔴 Komisyon Flexa shop <span data-testid="text-platform-rate">({ratePct}%)</span>
          </span>
          <span className="font-semibold text-rose-600 dark:text-rose-400" data-testid="text-platform-fee">−${quote.commissionAmount.toFixed(2)}</span>
        </div>

        {/* ── Delivery commission (only when fee is known) ── */}
        {hasDeliveryFee && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              🟠 Komisyon Flexa livrezon (15%)
            </span>
            <span className="font-semibold text-orange-600 dark:text-orange-400">−${deliveryCommission.toFixed(2)}</span>
          </div>
        )}

        <div className="border-t border-border pt-1.5 space-y-1">
          {/* ── Vendor receives ── */}
          <div className="flex items-center justify-between">
            <span className="font-bold">🟢 Vandè resevwa</span>
            <span className="font-extrabold text-green-700 dark:text-green-400" data-testid="text-seller-receives">${quote.sellerEarnings.toFixed(2)}</span>
          </div>

          {/* ── Driver receives (only when delivery fee known) ── */}
          {hasDeliveryFee && (
            <div className="flex items-center justify-between">
              <span className="font-bold">🟢 Chofè resevwa</span>
              <span className="font-extrabold text-green-700 dark:text-green-400">${(driverEarnings + tipAmount).toFixed(2)}{hasTip && <span className="text-[10px] text-emerald-600 font-normal ml-1">(incl. tip)</span>}</span>
            </div>
          )}
        </div>

        {/* ── Total ── */}
        <div className="flex items-center justify-between pt-1 border-t border-border mt-0.5">
          <span className="font-black">🔵 Total ou peye</span>
          {showDeliveryRow && !hasDeliveryFee ? (
            <span className="text-base text-primary font-extrabold" data-testid="text-total-to-pay">
              ${(buyerTotal - tipAmount).toFixed(2)}{deliveryLoading ? " + Kalkil..." : " + livrezon"}{hasTip ? ` + $${tipAmount.toFixed(2)} tip` : ""}
            </span>
          ) : (
            <span className="text-base text-primary font-extrabold" data-testid="text-total-to-pay">${buyerTotal.toFixed(2)}</span>
          )}
        </div>

        <p className="text-muted-foreground text-[10px] pt-0.5">
          {hasBuyerFee
            ? `Pri atik + frè sèvis${hasDeliveryFee ? " + livrezon" : ""}${hasTip ? " + tip" : ""} · Eskrow sekirize`
            : `Peman pòtfèy / promo: pa gen frè achte${hasDeliveryFee ? " · frè livrezon enkli" : ""}${hasTip ? " · tip 100% chofè" : ""} · Eskrow sekirize`}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Detay peman</h3>
      <div className="flex justify-between text-sm">
        <span>Pri atik</span>
        <span className="font-semibold">${quote.totalAmount.toFixed(2)}</span>
      </div>
      <div className="flex justify-between text-sm">
        <span>Komisyon platfòm ({ratePct}%)</span>
        <span className="font-semibold text-rose-600 dark:text-rose-400">−${quote.commissionAmount.toFixed(2)}</span>
      </div>
      <div className="border-t border-border pt-2 flex justify-between">
        <span className="font-bold">Ou resevwa</span>
        <span className="font-extrabold text-green-700 dark:text-green-400">${quote.sellerEarnings.toFixed(2)}</span>
      </div>
    </div>
  );
}
