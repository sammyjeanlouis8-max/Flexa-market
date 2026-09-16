import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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

  if (audience === "buyer") {
    return (
      <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs space-y-1.5" data-testid="commission-breakdown-buyer">
        {/* ── Product price ── */}
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">📦 {t("listing.checkoutItemPrice")}</span>
          <span className="font-semibold" data-testid="text-item-price">${quote.totalAmount.toFixed(2)}</span>
        </div>

        {/* ── Buyer service fee (card only) ── */}
        {hasBuyerFee && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              {t("listing.checkoutBuyerFee")} <span className="text-amber-500 font-semibold" data-testid="text-buyer-fee-rate">({((quote.buyerFeeRate ?? 0) * 100).toFixed(1)}%)</span>
            </span>
            <span className="font-semibold text-amber-600 dark:text-amber-400" data-testid="text-buyer-fee">+${buyerFeeAmt.toFixed(2)}</span>
          </div>
        )}

        {/* ── Delivery fee ── */}
        {showDelivery && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              🚚 {t("listing.checkoutDeliveryFee")}{tierLabel ? <span className="text-foreground font-semibold"> ({tierLabel})</span> : ""}
            </span>
            {deliveryLoading ? (
              <span className="text-muted-foreground italic" data-testid="text-delivery-fee">{t("listing.calculating")}</span>
            ) : hasDeliveryFee ? (
              <span className="font-semibold text-blue-600 dark:text-blue-400" data-testid="text-delivery-fee">+${deliveryFee.toFixed(2)}</span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-semibold text-[11px]" data-testid="text-delivery-fee">⚠️ {t("listing.checkoutEnterCity")}</span>
            )}
          </div>
        )}
        {/* Delivery required notice */}
        {showDelivery && !hasDeliveryFee && !deliveryLoading && (
          <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-700/40 rounded-lg px-2.5 py-1.5">
            <span className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold">{t("listing.checkoutDeliveryRequired")}</span>
          </div>
        )}

        {/* ── Tip ── */}
        {hasTip && (
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              💰 {t("listing.checkoutDriverTip")} <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">({t("listing.checkoutTipRecipient")})</span>
            </span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400" data-testid="text-tip">+${tipAmount.toFixed(2)}</span>
          </div>
        )}

        {/* ── Total ── */}
        <div className="flex items-center justify-between pt-1 border-t border-border mt-0.5">
          <span className="font-black">🔵 {t("listing.checkoutTotal")}</span>
          {showDeliveryRow && !hasDeliveryFee ? (
            <span className="text-base text-primary font-extrabold" data-testid="text-total-to-pay">
              ${(buyerTotal - tipAmount).toFixed(2)}{deliveryLoading ? ` + ${t("listing.calculating")}` : ` + ${t("listing.checkoutDelivery")}`}{hasTip ? ` + $${tipAmount.toFixed(2)} ${t("listing.checkoutTip")}` : ""}
            </span>
          ) : (
            <span className="text-base text-primary font-extrabold" data-testid="text-total-to-pay">${buyerTotal.toFixed(2)}</span>
          )}
        </div>

        <p className="text-muted-foreground text-[10px] pt-0.5">
          {hasBuyerFee
            ? t("listing.checkoutCardSummary", { delivery: hasDeliveryFee ? ` + ${t("listing.checkoutDelivery")}` : "", tip: hasTip ? ` + ${t("listing.checkoutTip")}` : "" })
            : t("listing.checkoutWalletSummary", { delivery: hasDeliveryFee ? ` · ${t("listing.checkoutDeliveryIncluded")}` : "", tip: hasTip ? ` · ${t("listing.checkoutTipIncluded")}` : "" })}
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
