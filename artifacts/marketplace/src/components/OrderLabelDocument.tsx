import { useTranslation } from "react-i18next";
import { labelAddressLine, type LabelAddress, type OrderLabelData } from "@/lib/order-label";

export function OrderLabelDocument({ label, sender }: { label: OrderLabelData; sender: LabelAddress }) {
  const { t, i18n } = useTranslation();
  const delivery = label.delivery;
  const carrier = delivery?.kind === "company" ? delivery.carrier
    : delivery?.kind === "flexa" ? t("orderLabel.flexaDelivery")
    : delivery?.kind === "seller" ? t("orderLabel.sellerDelivery")
    : delivery?.kind === "bus" ? t("orderLabel.busDelivery") : t("orderLabel.carrierPending");
  return (
    <div id="shipping-label" className="shipping-label bg-white text-black border-2 border-black rounded-md mx-auto break-words" data-testid="shipping-label">
      <div className="label-section flex items-center justify-between gap-3 px-5 py-3 border-b-2 border-black">
        <div>
          <div className="font-black tracking-tight">FLEXA MARKET</div>
          <div className="text-[10px]">{t("orderLabel.platform")}</div>
          <div className="text-xs font-bold mt-1">{t(delivery?.kind === "seller" ? "orderLabel.deliverySlip" : "orderLabel.packageSlip")}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase">{t("orderLabel.order")}</div>
          <div className="font-mono font-bold text-sm">{label.orderRef}</div>
        </div>
      </div>
      <div className="label-section px-5 py-3 border-b border-black/30" data-testid="label-sender">
        <div className="text-[10px] uppercase text-black/60">{t("orderLabel.sender")}</div>
        <div className="font-bold">{sender.name || "—"}</div>
        <div className="text-sm whitespace-pre-line">{sender.street || "—"}</div>
        <div className="text-sm">{labelAddressLine(sender)}</div>
        {sender.phone && <div className="text-xs">{t("orderLabel.phone")}: {sender.phone}</div>}
      </div>
      <div className="label-section px-5 py-4 border-b-2 border-black" data-testid="label-recipient">
        <div className="text-[10px] uppercase text-black/60">{t("orderLabel.recipient")}</div>
        <div className="text-2xl font-black leading-tight">{label.shipTo.name || "—"}</div>
        <div className="text-base font-semibold mt-1">{label.shipTo.street || "—"}</div>
        <div className="text-base font-semibold">{labelAddressLine(label.shipTo)}</div>
        {label.shipTo.phone && <div className="text-sm font-bold mt-1">{t("orderLabel.phone")}: {label.shipTo.phone}</div>}
      </div>
      <div className="label-section px-5 py-3 border-b border-black/30" data-testid="label-carrier">
        <div className="text-[10px] uppercase text-black/60">{t("orderLabel.carrier")}</div>
        <div className="text-lg font-black">{carrier}</div>
        {delivery?.trackingNumber && <div className="text-xs">{t("orderLabel.tracking")}: <span className="font-mono break-all">{delivery.trackingNumber}</span></div>}
      </div>
      <div className="label-section px-5 py-2">
        <div className="text-[10px] uppercase text-black/60">{t("orderLabel.item")}</div>
        <div className="text-sm font-semibold">{label.listing.title}</div>
      </div>
      <div className="label-section px-5 py-2 border-t border-black/30 text-[10px] font-semibold" data-testid="label-carrier-warning">
        {t(delivery?.kind === "seller" || delivery?.kind === "flexa" || delivery?.kind === "bus" ? "orderLabel.deliveryNote" : "orderLabel.carrierWarning")}
      </div>
      <div className="label-section px-5 py-2 border-t-2 border-black flex justify-between gap-2 text-[10px]">
        <span className="font-mono">{label.orderRef}</span>
        <span>{new Date(label.createdAt).toLocaleDateString(i18n.language)}</span>
        <span>flexamarket.com</span>
      </div>
    </div>
  );
}
