import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
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
import { useAuth } from "@/contexts/auth";
import { cn } from "@/lib/utils";

export default function RestaurantCheckoutPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [cart, setCart] = useState<RestaurantCartState | null>(null);
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  useEffect(() => {
    const c = getRestaurantCart();
    setCart(c);
    if (c) {
      fetchRestaurant(c.restaurantId).then(setRestaurant).catch(() => setRestaurant(null));
    }
  }, []);

  const totals = cartTotals(cart, restaurant?.deliveryFee || 0);

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
        const order = await placeRestaurantOrder(cart.restaurantId, {
          fulfillment: cart.fulfillment,
          items: orderLines.map((l) => ({
            dailyMenuItemId: l.dailyMenuItemId,
            quantity: l.quantity,
            notes: l.notes,
          })),
          specialInstructions: cart.specialInstructions,
          deliveryAddress: cart.fulfillment === "delivery" ? cart.deliveryAddress : undefined,
        });
        messages.push(`${t("restaurant.placeOrder")} #${order.id}`);
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
            <p className="text-lg font-extrabold text-[hsl(152,55%,22%)]">{t("restaurant.orderPlaced", { defaultValue: "Request sent" })}</p>
            <p className="mt-2 text-sm text-muted-foreground">{doneMsg}</p>
            <RestaurantNotice>{t("restaurant.paymentNote")}</RestaurantNotice>
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

  const canDelivery = restaurant?.fulfillment === "delivery" || restaurant?.fulfillment === "both";
  const canPickup = restaurant?.fulfillment === "pickup" || restaurant?.fulfillment === "both" || !restaurant?.fulfillment;

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell
        title={t("restaurant.placeOrderTitle", { defaultValue: "Place Order" })}
        subtitle={cart.restaurantName}
      >
        <RestaurantNotice>{t("restaurant.paymentNote")}</RestaurantNotice>
        {(canDelivery) && (
          <div className="mt-3">
            <RestaurantNotice>
              {t("restaurant.deliveryDisclaimer", {
                defaultValue: "Delivery is arranged and managed by this restaurant.",
              })}
            </RestaurantNotice>
          </div>
        )}

        <div className="mt-4 space-y-4">
          <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("restaurant.fulfillment", { defaultValue: "Pickup or Delivery" })}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={!canPickup}
                onClick={() => updateMeta({ fulfillment: "pickup" })}
                className={cn(
                  "rounded-xl border px-3 py-3 text-sm font-bold disabled:opacity-40",
                  cart.fulfillment === "pickup" ? "border-[hsl(152,55%,28%)] bg-[hsl(152,45%,95%)]" : "",
                )}
              >
                {t("restaurant.pickup")}
              </button>
              <button
                type="button"
                disabled={!canDelivery}
                onClick={() => updateMeta({ fulfillment: "delivery" })}
                className={cn(
                  "rounded-xl border px-3 py-3 text-sm font-bold disabled:opacity-40",
                  cart.fulfillment === "delivery" ? "border-[hsl(152,55%,28%)] bg-[hsl(152,45%,95%)]" : "",
                )}
              >
                {t("restaurant.delivery")}
                {restaurant?.deliveryFee ? ` · ${formatMoney(restaurant.deliveryFee, totals.currency)}` : ""}
              </button>
            </div>
            {cart.fulfillment === "delivery" && (
              <textarea
                className="mt-3 w-full rounded-xl border px-3 py-2 text-sm"
                rows={2}
                placeholder={t("restaurant.deliveryAddress", { defaultValue: "Delivery address" })}
                value={cart.deliveryAddress}
                onChange={(e) => updateMeta({ deliveryAddress: e.target.value })}
              />
            )}
          </div>

          <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("restaurant.orderSummary", { defaultValue: "Order summary" })}
            </p>
            <ul className="space-y-2">
              {cart.lines.map((line) => (
                <li key={`${line.mode}-${line.dailyMenuItemId}`} className="flex justify-between text-sm">
                  <span>
                    {line.quantity} × {line.name}
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
                <div className="flex justify-between">
                  <span>{t("restaurant.deliveryFee", { defaultValue: "Delivery fee" })}</span>
                  <span>{formatMoney(totals.deliveryFee, totals.currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-extrabold">
                <span>{t("restaurant.total", { defaultValue: "Total" })}</span>
                <span>{formatMoney(totals.total, totals.currency)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                {t("restaurant.commissionZero", { defaultValue: "Flexa commission: $0.00" })}
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
