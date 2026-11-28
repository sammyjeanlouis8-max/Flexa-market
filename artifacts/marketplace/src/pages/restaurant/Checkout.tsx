import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantStripePay } from "@/components/restaurant/RestaurantStripePay";
import { RestaurantEmpty, RestaurantNotice, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import {
  createRestaurantReservation,
  fetchRestaurant,
  formatMoney,
  placeRestaurantOrder,
  type Restaurant,
} from "@/lib/restaurantApi";
import {
  cartTotals,
  clearRestaurantCart,
  getRestaurantCart,
  setCartMeta,
  type RestaurantCartState,
} from "@/lib/restaurantCart";
import { fetchStripeConfig } from "@/lib/stripeBrowser";
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";

function newIdempotencyKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `rest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export default function RestaurantCheckoutPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [cart, setCart] = useState<RestaurantCartState | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<number | null>(null);
  /** One key per submit intent — retries reuse it until success clears the cart. */
  const orderIdempotencyKey = useRef(newIdempotencyKey());

  useEffect(() => {
    const c = getRestaurantCart();
    setCart(c);
    if (c) {
      fetchRestaurant(c.restaurantId).then(setRestaurant).catch(() => setRestaurant(null));
    }
  }, []);

  const totals = cartTotals(cart, restaurant?.deliveryFee || 0, {
    freeDeliveryMin: (restaurant as any)?.freeDeliveryMin ?? null,
    feeMode: (restaurant as any)?.feeMode,
    feePerKm: (restaurant as any)?.feePerKm,
    deliveryMethod: cart?.fulfillment === "delivery" ? "merchant" : "pickup",
  });

  function updateMeta(patch: Partial<Pick<RestaurantCartState, "fulfillment" | "specialInstructions" | "deliveryAddress">>) {
    const next = setCartMeta(patch);
    setCart(next);
  }

  async function submit() {
    if (!user) {
      setError(t("common.loginRequired", { defaultValue: "Sign in to place your order." }));
      return;
    }
    if (!cart || cart.lines.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const orderLines = cart.lines.filter((l) => l.mode === "order");
      const reserveLines = cart.lines.filter((l) => l.mode === "reserve");
      const messages: string[] = [];

      if (orderLines.length) {
        const result = await placeRestaurantOrder(cart.restaurantId, {
          fulfillment: cart.fulfillment,
          deliveryMethod: cart.fulfillment === "delivery" ? "merchant" : "pickup",
          items: orderLines.map((l) => ({
            dailyMenuItemId: l.dailyMenuItemId,
            quantity: l.quantity,
            notes: l.notes,
            optionIds: l.optionIds,
          })),
          specialInstructions: cart.specialInstructions,
          deliveryAddress: cart.fulfillment === "delivery" ? cart.deliveryAddress : undefined,
          idempotencyKey: orderIdempotencyKey.current,
        });
        messages.push(`${t("restaurant.placeOrder")} #${result.order.id}`);
        setOrderId(result.order.id);
        if (result.payment?.clientSecret) {
          const token = localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token");
          const cfg = await fetchStripeConfig({
            country: restaurant?.country || user.country,
            token,
          });
          setPublishableKey(cfg.publishableKey);
          setClientSecret(result.payment.clientSecret);
          setCart(null);
          clearRestaurantCart();
          setDoneMsg(messages.join(" · "));
          return;
        }
      }

      for (const line of reserveLines) {
        const reservation = await createRestaurantReservation(cart.restaurantId, {
          dailyMenuItemId: line.dailyMenuItemId,
          quantity: line.quantity,
          fulfillment: cart.fulfillment,
          specialInstructions: cart.specialInstructions,
          reservationTime: line.availableFrom,
        });
        messages.push(`${t("restaurant.reserve")} #${reservation.id}`);
      }

      clearRestaurantCart();
      setCart(null);
      setDoneMsg(messages.join(" · "));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (doneMsg) {
    return (
      <RestaurantPageGate requireAuth>
        <RestaurantShell title={t("restaurant.checkout", { defaultValue: "Checkout" })}>
          <div className="rounded-2xl border border-[hsl(152,40%,80%)] bg-white p-5 text-center shadow-sm">
            <p className="text-lg font-extrabold text-[hsl(152,55%,22%)]">
              {clientSecret
                ? t("restaurant.completePayment", { defaultValue: "Complete payment" })
                : t("restaurant.orderPlaced", { defaultValue: "Request sent" })}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{doneMsg}</p>
            <RestaurantNotice>
              {t("restaurant.deliveryManagedByBusiness", {
                defaultValue: "Delivery is managed directly by this business.",
              })}
            </RestaurantNotice>
            {clientSecret && publishableKey ? (
              <div className="mt-4 text-left">
                <RestaurantStripePay
                  clientSecret={clientSecret}
                  publishableKey={publishableKey}
                  onPaid={() => {
                    setClientSecret(null);
                    setDoneMsg(
                      orderId
                        ? `${t("restaurant.orderPlacedStatus", { defaultValue: "Order placed" })} #${orderId}`
                        : t("restaurant.paymentReceived", { defaultValue: "Payment received" }),
                    );
                  }}
                />
              </div>
            ) : (
              <RestaurantNotice>{t("restaurant.paymentNote")}</RestaurantNotice>
            )}
            <div className="mt-4 flex justify-center gap-2">
              <Link href="/restaurant/my-orders" className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-sm font-bold text-white">
                {t("restaurant.myOrdersTitle")}
              </Link>
              <Link href="/restaurant" className="rounded-full border px-4 py-2 text-sm font-bold">
                {t("restaurant.backDiscover")}
              </Link>
            </div>
          </div>
        </RestaurantShell>
      </RestaurantPageGate>
    );
  }

  if (!cart || cart.lines.length === 0) {
    return (
      <RestaurantPageGate>
        <RestaurantShell title={t("restaurant.checkout", { defaultValue: "Checkout" })}>
          <RestaurantEmpty
            title={t("restaurant.cartEmpty", { defaultValue: "Your restaurant cart is empty" })}
            body={t("restaurant.cartEmptyBody", { defaultValue: "Add meals first." })}
            action={<Link href="/restaurant">{t("restaurant.backDiscover")}</Link>}
          />
        </RestaurantShell>
      </RestaurantPageGate>
    );
  }

  const methods = (restaurant as any)?.deliveryMethods as { pickup?: boolean; merchant?: boolean; flexa?: boolean } | undefined;
  const canDelivery =
    methods?.merchant
    ?? (
      (restaurant?.fulfillment === "delivery" || restaurant?.fulfillment === "both")
      && (restaurant as any)?.deliveryAvailable !== false
      && !(restaurant as any)?.deliverySuspended
    );
  const canPickup =
    methods?.pickup
    ?? (
      restaurant?.fulfillment === "pickup"
      || restaurant?.fulfillment === "both"
      || !restaurant?.fulfillment
      || (restaurant as any)?.pickupAvailable !== false
    );
  const canFlexa = !!(methods?.flexa && (restaurant as any)?.flexaDeliveryFeatureEnabled);

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell
        title={t("restaurant.placeOrderTitle", { defaultValue: "Place Order" })}
        subtitle={cart.restaurantName}
      >
        <RestaurantNotice>{t("restaurant.paymentNote")}</RestaurantNotice>
        <RestaurantNotice>
          {t("restaurant.deliveryManagedByBusiness", {
            defaultValue: "Delivery is managed directly by this business.",
          })}
        </RestaurantNotice>
        <RestaurantNotice>
          {t("restaurant.driverPolicyNote", {
            defaultValue: "Flexa Driver never transports Flexa Restaurant food orders.",
          })}
        </RestaurantNotice>

        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("restaurant.fulfillment", { defaultValue: "Pickup or Delivery" })}
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={!canPickup}
                onClick={() => updateMeta({ fulfillment: "pickup" })}
                className={cn(
                  "rounded-xl border px-3 py-3 text-left text-sm font-bold disabled:opacity-40",
                  cart.fulfillment === "pickup" ? "border-[hsl(152,55%,28%)] bg-[hsl(152,45%,95%)]" : "",
                )}
              >
                <span className="block">{t("restaurant.customerPickup", { defaultValue: "Customer Pickup" })}</span>
                <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                  {t("restaurant.pickupHint", { defaultValue: "Collect at the business" })}
                </span>
              </button>
              <button
                type="button"
                disabled={!canDelivery}
                onClick={() => updateMeta({ fulfillment: "delivery" })}
                className={cn(
                  "rounded-xl border px-3 py-3 text-left text-sm font-bold disabled:opacity-40",
                  cart.fulfillment === "delivery" ? "border-[hsl(152,55%,28%)] bg-[hsl(152,45%,95%)]" : "",
                )}
                data-testid="checkout-merchant-delivery"
              >
                <span className="block">{t("restaurant.deliveredByRestaurant", { defaultValue: "Delivered by Restaurant" })}</span>
                <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">
                  {restaurant?.estimatedDeliveryMinutes
                    ? t("restaurant.etaShort", { defaultValue: "~{{m}} min", m: restaurant.estimatedDeliveryMinutes })
                    : t("restaurant.merchantDelivery", { defaultValue: "Merchant delivery" })}
                  {totals.deliveryFee > 0 ? ` · ${formatMoney(totals.deliveryFee, totals.currency)}` : ""}
                </span>
              </button>
              {canFlexa ? (
                <button type="button" disabled className="rounded-xl border px-3 py-3 text-left text-sm font-bold opacity-50 sm:col-span-2">
                  {t("restaurant.deliveredByFlexa", { defaultValue: "Delivered by Flexa" })}
                </button>
              ) : null}
            </div>
            {cart.fulfillment === "delivery" && (
              <>
                <textarea
                  className="mt-3 w-full rounded-xl border px-3 py-2 text-sm"
                  rows={2}
                  placeholder={t("restaurant.deliveryAddress", { defaultValue: "Delivery address" })}
                  value={cart.deliveryAddress}
                  onChange={(e) => updateMeta({ deliveryAddress: e.target.value })}
                />
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("restaurant.noLiveGpsUnlessAuthorized", {
                    defaultValue: "Live courier GPS is shown only when authorized location data is available.",
                  })}
                </p>
              </>
            )}
          </div>

          <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("restaurant.orderSummary", { defaultValue: "Order summary" })}
            </p>
            <ul className="space-y-2">
              {cart.lines.map((line) => (
                <li key={`${line.mode}-${line.dailyMenuItemId}-${(line.optionIds || []).join("-")}`} className="flex justify-between text-sm">
                  <span>
                    {line.quantity} × {line.name}
                    {line.optionLabels?.length ? ` (${line.optionLabels.join(", ")})` : ""}
                    {line.mode === "reserve" ? ` (${t("restaurant.reserve")})` : ""}
                  </span>
                  <span className="font-semibold">{formatMoney(line.price * line.quantity, line.currency)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-3 space-y-1 border-t pt-3 text-sm">
              <div className="flex justify-between">
                <span>{t("restaurant.subtotal", { defaultValue: "Subtotal" })}</span>
                <span>{formatMoney(totals.subtotal, totals.currency)}</span>
              </div>
              {cart.fulfillment === "delivery" && (
                <>
                  <div className="flex justify-between">
                    <span>{t("restaurant.merchantDeliveryFee", { defaultValue: "Merchant delivery fee" })}</span>
                    <span>{formatMoney(totals.deliveryFee, totals.currency)}</span>
                  </div>
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t("restaurant.flexaDriverFee", { defaultValue: "Flexa driver fee" })}</span>
                    <span>{formatMoney(0, totals.currency)}</span>
                  </div>
                </>
              )}
              <div className="flex justify-between text-base font-extrabold">
                <span>{t("restaurant.total", { defaultValue: "Total" })}</span>
                <span>{formatMoney(totals.total, totals.currency)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("restaurant.commissionZero", { defaultValue: "Flexa commission: $0.00" })}
                {" · "}
                {t("restaurant.noFlexaDriverPayout", { defaultValue: "No Flexa driver payout for merchant delivery" })}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("restaurant.orderNotes", { defaultValue: "Order notes" })}
            </label>
            <textarea
              className="w-full rounded-xl border px-3 py-2 text-sm"
              rows={3}
              value={cart.specialInstructions}
              onChange={(e) => updateMeta({ specialInstructions: e.target.value })}
              placeholder={t("restaurant.orderNotesPlaceholder", { defaultValue: "No spicy please" })}
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="button"
            disabled={submitting || (cart.fulfillment === "delivery" && !cart.deliveryAddress.trim())}
            onClick={() => void submit()}
            className="w-full rounded-2xl bg-[hsl(152,55%,28%)] py-3.5 text-sm font-extrabold text-white disabled:opacity-60"
          >
            {submitting
              ? t("common.loading", { defaultValue: "Loading…" })
              : `${t("restaurant.placeOrder")} — ${formatMoney(totals.total, totals.currency)}`}
          </button>
          <button type="button" onClick={() => setLocation("/restaurant/cart")} className="w-full text-sm font-semibold text-muted-foreground">
            {t("restaurant.backToCart", { defaultValue: "Back to cart" })}
          </button>
        </div>
      </RestaurantShell>
    </RestaurantPageGate>
  );
}
