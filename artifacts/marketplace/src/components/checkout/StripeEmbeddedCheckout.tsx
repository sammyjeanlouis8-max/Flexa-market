import { useCallback, useEffect, useMemo, useState } from "react";
import { EmbeddedCheckout, EmbeddedCheckoutProvider } from "@stripe/react-stripe-js";
import { useTranslation } from "react-i18next";
import { Loader2, ShieldCheck, X } from "lucide-react";
import { fetchStripeConfig, getStripePromise, type StripeCapabilities } from "@/lib/stripeBrowser";
import { cn } from "@/lib/utils";

type Props = {
  clientSecret: string;
  publishableKey: string;
  capabilities?: StripeCapabilities | null;
  onClose?: () => void;
  className?: string;
};

/**
 * Stripe Embedded Checkout — card + Apple Pay / Google Pay / Link when available.
 * Save-card consent is shown by Stripe Checkout (never forced).
 */
export function StripeEmbeddedCheckout({
  clientSecret,
  publishableKey,
  capabilities,
  onClose,
  className,
}: Props) {
  const { t } = useTranslation();
  const stripePromise = useMemo(() => getStripePromise(publishableKey), [publishableKey]);
  const options = useMemo(() => ({ clientSecret }), [clientSecret]);

  const walletHints: string[] = [];
  if (capabilities?.applePay) walletHints.push("Apple Pay");
  if (capabilities?.googlePay) walletHints.push("Google Pay");
  if (capabilities?.link) walletHints.push("Link");
  if (capabilities?.card) walletHints.push(t("checkout.payWithCard", { defaultValue: "Card" }));

  return (
    <div
      className={cn("rounded-2xl border border-slate-200 bg-white overflow-hidden", className)}
      data-testid="stripe-embedded-checkout"
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900">
            {t("checkout.securePayment", { defaultValue: "Secure payment" })}
          </p>
          {walletHints.length > 0 && (
            <p className="text-[11px] text-slate-500 truncate">
              {walletHints.join(" · ")}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" />
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-100"
              aria-label={t("common.close", { defaultValue: "Close" })}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      <div className="p-2 sm:p-3 min-h-[320px]">
        <EmbeddedCheckoutProvider stripe={stripePromise} options={options}>
          <EmbeddedCheckout />
        </EmbeddedCheckoutProvider>
      </div>
      <p className="px-4 pb-3 text-[11px] text-slate-400">
        {t("checkout.saveCardConsentHint", {
          defaultValue: "Saving a card is optional — only when you choose “Save for future purchases” in Stripe Checkout. We never store full card numbers or CVV.",
        })}
      </p>
    </div>
  );
}

type LaunchProps = {
  token: string;
  listingId: number;
  country?: string | null;
  body: Record<string, unknown>;
  onCancel: () => void;
  onHostedFallback: (url: string) => void;
};

/**
 * Creates an embedded Checkout Session then mounts StripeEmbeddedCheckout.
 * Falls back to hosted Checkout URL when embedded is unavailable.
 */
export function StripeEmbeddedCheckoutLauncher({
  token,
  listingId,
  country,
  body,
  onCancel,
  onHostedFallback,
}: LaunchProps) {
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [publishableKey, setPublishableKey] = useState<string | null>(null);
  const [capabilities, setCapabilities] = useState<StripeCapabilities | null>(null);

  const start = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const config = await fetchStripeConfig({ country, token });
      setPublishableKey(config.publishableKey);
      setCapabilities(config.capabilities);
      if (!config.capabilities.card) {
        setError(config.capabilities.reason || t("checkout.cardUnavailable", { defaultValue: "Card checkout unavailable" }));
        return;
      }

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...body,
          listingId,
          uiMode: "embedded",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error || t("checkout.paymentError", { defaultValue: "Could not start checkout" }));
        return;
      }
      if (data.clientSecret) {
        setClientSecret(data.clientSecret);
        return;
      }
      if (data.url) {
        onHostedFallback(data.url);
        return;
      }
      setError(t("checkout.noCheckoutUrl", { defaultValue: "No checkout session received" }));
    } catch {
      setError(t("checkout.networkError", { defaultValue: "Network error — please try again" }));
    } finally {
      setLoading(false);
    }
  }, [body, country, listingId, onHostedFallback, t, token]);

  useEffect(() => {
    void start();
  }, [start]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-500">
        <Loader2 className="h-6 w-6 animate-spin" />
        <p className="text-sm">{t("checkout.preparingPayment", { defaultValue: "Preparing secure payment…" })}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-red-600" role="alert">{error}</p>
        <button type="button" className="text-sm font-semibold text-violet-700 underline" onClick={onCancel}>
          {t("common.back", { defaultValue: "Back" })}
        </button>
      </div>
    );
  }

  if (!clientSecret || !publishableKey) return null;

  return (
    <StripeEmbeddedCheckout
      clientSecret={clientSecret}
      publishableKey={publishableKey}
      capabilities={capabilities}
      onClose={onCancel}
    />
  );
}
