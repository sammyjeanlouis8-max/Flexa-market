import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import { Minus, Plus, Trash2 } from "lucide-react";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantEmpty, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { formatMoney } from "@/lib/restaurantApi";
import {
  cartTotals,
  clearRestaurantCart,
  getRestaurantCart,
  upsertCartLine,
  type RestaurantCartState,
} from "@/lib/restaurantCart";

export default function RestaurantCartPage() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const [cart, setCart] = useState<RestaurantCartState | null>(null);

  useEffect(() => {
    setCart(getRestaurantCart());
  }, []);

  const totals = cartTotals(cart);

  function updateQty(lineId: number, mode: "order" | "reserve", quantity: number) {
    if (!cart) return;
    const line = cart.lines.find((l) => l.dailyMenuItemId === lineId && l.mode === mode);
    if (!line) return;
    const next = upsertCartLine(
      { id: cart.restaurantId, name: cart.restaurantName },
      { ...line, quantity },
    );
    setCart(next.lines.length ? next : null);
  }

  if (!cart || cart.lines.length === 0) {
    return (
      <RestaurantPageGate>
        <RestaurantShell title={t("restaurant.cartTitle", { defaultValue: "Cart" })}>
          <RestaurantEmpty
            title={t("restaurant.cartEmpty", { defaultValue: "Your restaurant cart is empty" })}
            body={t("restaurant.cartEmptyBody", { defaultValue: "Add meals from a restaurant menu to get started." })}
            action={
              <Link href="/restaurant" className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-sm font-bold text-white">
                {t("restaurant.backDiscover")}
              </Link>
            }
          />
        </RestaurantShell>
      </RestaurantPageGate>
    );
  }

  return (
    <RestaurantPageGate>
      <RestaurantShell
        title={t("restaurant.cartTitle", { defaultValue: "Cart" })}
        subtitle={cart.restaurantName}
        actions={
          <button
            type="button"
            onClick={() => {
              clearRestaurantCart();
              setCart(null);
            }}
            className="text-xs font-bold text-destructive"
          >
            {t("restaurant.clearCart", { defaultValue: "Clear" })}
          </button>
        }
      >
        <ul className="space-y-3">
          {cart.lines.map((line) => (
            <li key={`${line.mode}-${line.dailyMenuItemId}`} className="flex gap-3 rounded-2xl border border-black/5 bg-white p-3 shadow-sm">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-[hsl(152,25%,92%)]">
                {line.photo ? <img src={line.photo} alt="" className="h-full w-full object-cover" /> : null}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-extrabold">{line.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {line.mode === "reserve"
                        ? t("restaurant.reserve", { defaultValue: "Reserve" })
                        : t("restaurant.placeOrder")}
                      {line.availableFrom ? ` · ${line.availableFrom}–${line.availableUntil}` : ""}
                    </p>
                  </div>
                  <p className="font-extrabold text-[hsl(152,55%,28%)]">
                    {formatMoney(line.price * line.quantity, line.currency)}
                  </p>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full border"
                    onClick={() => updateQty(line.dailyMenuItemId, line.mode, line.quantity - 1)}
                  >
                    {line.quantity <= 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                  </button>
                  <span className="w-6 text-center text-sm font-bold">{line.quantity}</span>
                  <button
                    type="button"
                    className="flex h-8 w-8 items-center justify-center rounded-full border"
                    onClick={() => updateQty(line.dailyMenuItemId, line.mode, line.quantity + 1)}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
          <div className="flex justify-between text-sm">
            <span>{t("restaurant.subtotal", { defaultValue: "Subtotal" })}</span>
            <span className="font-bold">{formatMoney(totals.subtotal, totals.currency)}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t("restaurant.paymentNote")}</p>
          <button
            type="button"
            onClick={() => setLocation("/restaurant/checkout")}
            className="mt-4 w-full rounded-2xl bg-[hsl(152,55%,28%)] py-3 text-sm font-extrabold text-white"
          >
            {t("restaurant.checkout", { defaultValue: "Checkout" })} · {formatMoney(totals.total, totals.currency)}
          </button>
        </div>
      </RestaurantShell>
    </RestaurantPageGate>
  );
}
