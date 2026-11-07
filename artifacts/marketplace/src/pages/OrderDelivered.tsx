import { useEffect, useState } from "react";
import { useRoute, useLocation } from "wouter";
import {
  CheckCircle2, ChevronLeft, Star, Flag, Headphones, Package, ShoppingBag, Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "react-i18next";
import { FLEXA_BRAND, orderRef } from "@/lib/orderTrackingUi";
import DriverRatingModal from "@/components/DriverRatingModal";

type DeliveredOrder = {
  orderId: number;
  orderRef: string;
  createdAt: string;
  amount: number;
  currency: string;
  orderStatus: string;
  deliveredAt: string | null;
  buyerConfirmedAt: string | null;
  escrowReleasedAt: string | null;
  carrier: string | null;
  deliveryMethod: string | null;
  trackingNumber: string | null;
  isHaiti: boolean;
  confirmationMode?: string | null;
  carrierPodEligible?: boolean;
  haitiPinConfirmation?: boolean;
  carrierPodPhotos?: Array<{ url?: string | null; photoUrl?: string | null }>;
  destinationCountry?: string | null;
  listing: { id: number; title: string; images: string[] | null };
  merchant: { id: number; name: string };
  fmDelivery: {
    id: number;
    status: string;
    driverUserId: number | null;
    driverInfo: { name: string | null } | null;
    pickupPhotoUrl?: string | null;
    dropoffPhotoUrl?: string | null;
  } | null;
};

export default function OrderDelivered() {
  const [, params] = useRoute("/orders/:id/delivered");
  const orderId = params?.id ? Number(params.id) : NaN;
  const { user, token } = useAuth();
  const [, setLocation] = useLocation();
  const { t } = useTranslation();

  const [order, setOrder] = useState<DeliveredOrder | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRating, setShowRating] = useState(false);

  useEffect(() => {
    if (!user) {
      setLocation("/auth/login");
      return;
    }
    if (!Number.isFinite(orderId)) {
      setError(t("orderTracking.invalidOrder", { defaultValue: "Invalid order" }));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/orders/${orderId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.error || t("orderDetail.toastError"));
          return;
        }
        setOrder(data as DeliveredOrder);
      } catch {
        if (!cancelled) setError(t("orderDetail.toastNetworkError"));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, token, orderId, setLocation, t]);

  if (!user) return null;

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center">
        <p className="text-destructive font-semibold mb-3">{error}</p>
        <Button variant="outline" onClick={() => setLocation("/orders")}>
          {t("orderTracking.myOrders", { defaultValue: "My Orders" })}
        </Button>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center text-muted-foreground">
        {t("orderDetail.loading")}
      </div>
    );
  }

  const isHaitiPin =
    order.confirmationMode === "haiti_pin" ||
    order.haitiPinConfirmation === true ||
    (order.isHaiti && !order.carrierPodEligible);
  const deliveredAtIso = order.deliveredAt || order.buyerConfirmedAt || order.escrowReleasedAt;
  const deliveredLabel = deliveredAtIso
    ? new Date(deliveredAtIso).toLocaleString(undefined, {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "—";
  const provider =
    order.fmDelivery
      ? t("orderTracking.flexaDelivery", { defaultValue: "Flexa Delivery" })
      : order.carrier || order.deliveryMethod || t("orderTracking.carrierShipment", { defaultValue: "Carrier shipment" });
  const ref = order.orderRef || orderRef(order.orderId);
  const canRateDriver = Boolean(order.fmDelivery?.id && order.fmDelivery.status === "delivered");
  const podPhotos = (order.carrierPodPhotos ?? []).filter((p) => p.url || p.photoUrl);
  const proofPickup = order.fmDelivery?.pickupPhotoUrl?.trim() || null;
  const proofDropoff = order.fmDelivery?.dropoffPhotoUrl?.trim() || null;
  const hasFmProofPhotos = Boolean(proofPickup || proofDropoff);

  return (
    <div className="max-w-lg mx-auto px-4 py-5 pb-28 space-y-4" data-testid="order-delivered-page">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" className="-ml-2" onClick={() => setLocation(`/orders/${order.orderId}`)}>
          <ChevronLeft className="h-4 w-4 mr-1" />
          {t("orderDetail.back")}
        </Button>
        <h1 className="text-sm font-bold truncate">{t("orderTracking.orderHash", { ref, defaultValue: `Order ${ref}` })}</h1>
        <span className="w-16" />
      </div>

      {/* Success hero */}
      <div
        className="rounded-2xl px-5 py-8 text-center"
        style={{ background: FLEXA_BRAND.soft }}
        data-testid="delivery-success-banner"
      >
        <div
          className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full text-white"
          style={{ background: FLEXA_BRAND.success }}
        >
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <h2 className="text-xl font-black text-foreground">
          {t("orderTracking.orderDeliveredTitle", { defaultValue: "Order delivered" })}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
          {t("orderTracking.orderDeliveredBody", {
            defaultValue: "Your package was received and delivery was confirmed successfully.",
          })}
        </p>
      </div>

      {/* Confirmation card */}
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3 shadow-sm">
        <h3 className="text-sm font-bold text-foreground">
          {t("orderTracking.deliveryConfirmation", { defaultValue: "Delivery confirmation" })}
        </h3>

        <div
          className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold"
          style={{ background: "hsla(210,80%,96%,1)", color: "hsl(210,70%,35%)" }}
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {isHaitiPin
            ? t("orderTracking.localHaiti", { defaultValue: "Local delivery — Haiti" })
            : order.destinationCountry
              ? t("orderTracking.deliveryCountry", {
                  country: order.destinationCountry,
                  defaultValue: `Delivery — ${order.destinationCountry}`,
                })
              : t("orderTracking.carrierShipment", { defaultValue: "Carrier shipment" })}
        </div>

        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-2">
            <Package className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <span>
              <span className="text-muted-foreground">{t("orderTracking.orderNumber", { defaultValue: "Order number" })}: </span>
              <span className="font-mono font-bold">{ref}</span>
            </span>
          </li>
          <li className="flex items-start gap-2">
            <Truck className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <span>
              <span className="text-muted-foreground">{t("orderTracking.deliveredBy", { defaultValue: "Delivered by" })}: </span>
              <span className="font-bold">{provider}</span>
            </span>
          </li>
          {isHaitiPin && (
            <li className="flex items-start gap-2" data-testid="pin-verified-row">
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" style={{ color: FLEXA_BRAND.success }} />
              <span>
                <span className="text-muted-foreground">{t("orderTracking.pinVerified", { defaultValue: "PIN verified" })}: </span>
                <span className="font-bold">{t("orderTracking.yes", { defaultValue: "Yes" })}</span>
              </span>
            </li>
          )}
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <span>
              <span className="text-muted-foreground">{t("orderTracking.deliveredAt", { defaultValue: "Delivered" })}: </span>
              <span className="font-bold">{deliveredLabel}</span>
            </span>
          </li>
        </ul>

        {/* Local Flexa driver proof photos — shown once the company finishes delivery */}
        {hasFmProofPhotos && (
          <div className="pt-2 border-t border-border" data-testid="delivered-fm-proof-section">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              {t("orderTracking.proofPhotos", { defaultValue: "Proof of delivery photos" })}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {proofDropoff && (
                <a
                  href={proofDropoff}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative block overflow-hidden rounded-lg border border-border"
                  data-testid="delivered-dropoff-proof"
                >
                  <img
                    src={proofDropoff}
                    alt={t("orderTracking.dropoffProof", { defaultValue: "Handoff proof" })}
                    className="h-28 w-full object-cover"
                  />
                  <span className="absolute bottom-0 inset-x-0 bg-black/55 px-2 py-1 text-[10px] font-bold text-white uppercase tracking-wider">
                    {t("orderTracking.dropoffProof", { defaultValue: "Handoff proof" })}
                  </span>
                </a>
              )}
              {proofPickup && (
                <a
                  href={proofPickup}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="relative block overflow-hidden rounded-lg border border-border"
                  data-testid="delivered-pickup-proof"
                >
                  <img
                    src={proofPickup}
                    alt={t("orderTracking.pickupProof", { defaultValue: "Pickup proof" })}
                    className="h-28 w-full object-cover"
                  />
                  <span className="absolute bottom-0 inset-x-0 bg-black/55 px-2 py-1 text-[10px] font-bold text-white uppercase tracking-wider">
                    {t("orderTracking.pickupProof", { defaultValue: "Pickup proof" })}
                  </span>
                </a>
              )}
            </div>
          </div>
        )}

        {/* International POD only when policy allows — never for Haiti PIN */}
        {!isHaitiPin && order.carrierPodEligible && (
          <div className="pt-2 border-t border-border" data-testid="delivered-pod-section">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
              {t("orderDetail.carrierPodPhotos", { defaultValue: "Carrier proof of delivery" })}
            </p>
            {podPhotos.length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {podPhotos.map((photo, idx) => {
                  const src = photo.url || photo.photoUrl;
                  if (!src) return null;
                  return (
                    <a key={idx} href={src} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-lg border border-border">
                      <img src={src} alt="" className="h-28 w-full object-cover" />
                    </a>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground" data-testid="delivered-pod-unavailable">
                {t("orderDetail.carrierPodUnavailable", { defaultValue: "Delivery photo unavailable." })}
              </p>
            )}
          </div>
        )}
      </div>

      <div
        className="rounded-xl px-4 py-3 text-sm font-medium flex items-center gap-2"
        style={{ background: FLEXA_BRAND.soft, color: FLEXA_BRAND.success }}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        {t("orderTracking.confirmedThanks", {
          defaultValue: "Delivery confirmed. Thank you for confirming receipt of your package.",
        })}
      </div>

      <div className="space-y-2.5">
        {canRateDriver && (
          <Button
            className="w-full h-12 text-base font-bold rounded-xl text-white"
            style={{ background: FLEXA_BRAND.primary }}
            onClick={() => setShowRating(true)}
            data-testid="rate-delivery"
          >
            <Star className="h-5 w-5 mr-2" />
            {t("orderTracking.rateDelivery", { defaultValue: "Rate delivery" })}
          </Button>
        )}

        <Button
          variant="outline"
          className="w-full h-11 font-bold rounded-xl border-2"
          style={{ borderColor: FLEXA_BRAND.success, color: FLEXA_BRAND.success }}
          onClick={() =>
            setLocation(
              `/support?topic=delivery&orderId=${order.orderId}&ref=${encodeURIComponent(ref)}`,
            )
          }
          data-testid="report-delivery-problem"
        >
          <Flag className="h-4 w-4 mr-2" />
          {t("orderTracking.reportProblem", { defaultValue: "Report a delivery problem" })}
        </Button>

        {order.fmDelivery?.driverInfo?.name && order.fmDelivery.driverUserId && (
          <Button
            variant="outline"
            className="w-full h-11 font-bold rounded-xl border-2"
            style={{ borderColor: FLEXA_BRAND.success, color: FLEXA_BRAND.success }}
            onClick={() => setLocation(`/messages?userId=${order.fmDelivery!.driverUserId}`)}
            data-testid="contact-driver"
          >
            <Headphones className="h-4 w-4 mr-2" />
            {t("orderTracking.contactDriver", { defaultValue: "Contact driver" })}
          </Button>
        )}

        <Button
          variant="outline"
          className="w-full h-11 font-bold rounded-xl"
          onClick={() => setLocation(`/listings/${order.listing.id}`)}
          data-testid="buy-again"
        >
          <ShoppingBag className="h-4 w-4 mr-2" />
          {t("orderTracking.buyAgain", { defaultValue: "Buy again" })}
        </Button>

        <Button
          variant="ghost"
          className="w-full font-bold"
          onClick={() => setLocation(`/orders/${order.orderId}`)}
        >
          {t("orderTracking.viewOrder", { defaultValue: "View order" })}
        </Button>
      </div>

      {showRating && canRateDriver && order.fmDelivery && (
        <DriverRatingModal
          onClose={() => setShowRating(false)}
          deliveryId={order.fmDelivery.id}
          driverName={order.fmDelivery.driverInfo?.name || t("orderTracking.flexaDelivery", { defaultValue: "Flexa Delivery" })}
        />
      )}
    </div>
  );
}
