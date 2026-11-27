import { useMemo, useState } from "react";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { useTranslation } from "react-i18next";
import { getStripePromise } from "@/lib/stripeBrowser";

function PayForm({ onPaid }: { onPaid: () => void }) {
  const { t } = useTranslation();
  const stripe = useStripe();
  const elements = useElements();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setBusy(true);
    setError(null);
    const { error: err } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/restaurant/my-orders?paid=1`,
      },
      redirect: "if_required",
    });
    setBusy(false);
    if (err) {
      setError(err.message || "Payment failed");
      return;
    }
    onPaid();
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3" data-testid="restaurant-stripe-pay">
      <PaymentElement />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <button
        type="submit"
        disabled={!stripe || busy}
        className="w-full rounded-2xl bg-[hsl(152,55%,28%)] py-3 text-sm font-extrabold text-white disabled:opacity-60"
      >
        {busy
          ? t("common.loading", { defaultValue: "Loading…" })
          : t("checkout.confirmPayment", { defaultValue: "Confirm payment" })}
      </button>
    </form>
  );
}

/** Payment Element for restaurant PaymentIntent client secrets (not Checkout Session). */
export function RestaurantStripePay({
  clientSecret,
  publishableKey,
  onPaid,
}: {
  clientSecret: string;
  publishableKey: string;
  onPaid: () => void;
}) {
  const stripePromise = useMemo(() => getStripePromise(publishableKey), [publishableKey]);
  const options = useMemo(() => ({ clientSecret }), [clientSecret]);

  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <Elements stripe={stripePromise} options={options}>
        <PayForm onPaid={onPaid} />
      </Elements>
    </div>
  );
}
