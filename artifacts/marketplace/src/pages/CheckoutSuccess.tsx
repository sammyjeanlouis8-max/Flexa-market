import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, Loader2, XCircle, Package, ArrowRight, ArrowLeft, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

interface SessionResult {
  status: string;
  amount: number;
  currency: string;
  transaction: {
    id: number;
    listingId: number | null;
    orderStatus: string;
    shippingName: string | null;
  } | null;
}

export default function CheckoutSuccess() {
  const { t } = useTranslation();
  const [, setLocation] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");

  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [result, setResult] = useState<SessionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) { setError("Invalid session"); setLoading(false); return; }

    const controller = new AbortController();
    // Soft timeout: show retry UI but keep waiting — never treat abort as unpaid
    const timer = setTimeout(() => {
      setTimedOut(true);
    }, 8000);

    const tk = localStorage.getItem("flexamarket_token");
    fetch(`/api/stripe/checkout/session?session_id=${encodeURIComponent(sessionId)}`, {
      headers: tk ? { Authorization: `Bearer ${tk}` } : {},
      signal: controller.signal,
    })
      .then(r => r.json())
      .then(data => {
        clearTimeout(timer);
        if (data.error) throw new Error(data.error);
        setResult(data);
        setTimedOut(false);
      })
      .catch(err => {
        clearTimeout(timer);
        if (err.name !== "AbortError") setError(err.message);
      })
      .finally(() => setLoading(false));

    return () => { clearTimeout(timer); controller.abort(); };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-5 px-4">
        <div className="text-center space-y-2">
          <Loader2 className="h-9 w-9 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm font-medium">{t("payment.verifyingPayment")}</p>
          <p className="text-[11px] text-muted-foreground max-w-xs mx-auto">
            Confirming payment with Stripe. Do not close this page.
          </p>
        </div>
        {timedOut && (
          <div className="border border-amber-200 rounded-xl p-4 bg-amber-50/80 dark:bg-amber-950/20 max-w-sm w-full text-center space-y-3">
            <AlertCircle className="h-5 w-5 text-amber-600 mx-auto" />
            <p className="text-xs text-amber-900 dark:text-amber-200 font-medium">{t("payment.verifyingTakingLong")}</p>
            <p className="text-[11px] text-muted-foreground">
              Payment may still be processing. Check My Orders before paying again.
            </p>
            <div className="flex gap-2 justify-center flex-wrap">
              <Button size="sm" variant="outline" onClick={() => window.location.reload()} className="gap-1.5 h-9">
                <Loader2 className="h-3.5 w-3.5" /> {t("subscription.retry")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setLocation("/orders")} className="gap-1.5 h-9">
                {t("payment.myOrders")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setLocation("/")} className="gap-1.5 h-9">
                <ArrowLeft className="h-3.5 w-3.5" /> {t("errors.goHome")}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Only show failure when we have a definitive non-paid status or a real error —
  // not when verification is still pending after a soft timeout.
  const unpaid = !!error || (result != null && result.status !== "paid");
  if (unpaid) {
    const isCancelled = result?.status === "canceled" || result?.status === "cancelled";
    return (
      <div className="max-w-lg mx-auto px-4 py-12 text-center space-y-5">
        <XCircle className="h-14 w-14 text-destructive mx-auto" />
        <div className="space-y-1.5">
          <h1 className="text-xl font-bold">
            {isCancelled ? "Payment cancelled" : t("payment.paymentNotConfirmed")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {error ?? (isCancelled
              ? "No charge was completed. You can return to the listing and try again."
              : t("payment.paymentNotVerified"))}
          </p>
        </div>
        <div className="flex gap-2 justify-center flex-wrap">
          <Link href="/orders"><Button variant="outline" className="h-10">{t("payment.myOrders")}</Button></Link>
          <Link href="/"><Button className="h-10">{t("errors.goHome")}</Button></Link>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <AlertCircle className="h-10 w-10 text-amber-500" />
        <p className="text-sm font-medium">{t("payment.verifyingTakingLong")}</p>
        <Button size="sm" onClick={() => window.location.reload()} className="h-9">Retry verification</Button>
      </div>
    );
  }

  const amountStr = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: result.currency?.toUpperCase() ?? "USD",
  }).format(result.amount);

  return (
    <div className="max-w-lg mx-auto px-4 py-10 space-y-5">
      <div className="text-center space-y-2">
        <CheckCircle2 className="h-14 w-14 text-green-500 mx-auto" />
        <h1 className="text-2xl font-bold">{t("payment.paymentSuccessful")}</h1>
        <p className="text-sm text-muted-foreground">{t("payment.paymentThankYou")}</p>
        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
          Payment verified with Stripe
        </p>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("payment.amountPaid")}</span>
            <span className="font-semibold text-green-600 dark:text-green-400 tabular-nums">{amountStr}</span>
          </div>
          {result.transaction && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("payment.orderNumber")}</span>
                <span className="font-medium tabular-nums">#{result.transaction.id}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("payment.orderStatus")}</span>
                <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                  <Package className="h-3.5 w-3.5" />
                  {t("payment.preparingToShip")}
                </span>
              </div>
              {result.transaction.shippingName && (
                <div className="flex justify-between text-sm gap-3">
                  <span className="text-muted-foreground shrink-0">{t("payment.shipTo")}</span>
                  <span className="font-medium text-right truncate">{result.transaction.shippingName}</span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-2.5">
        <Link href={result.transaction ? `/orders/${result.transaction.id}` : "/orders"} className="flex-1">
          <Button className="w-full h-11" size="default">
            {t("payment.trackOrder")} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
        <Link href="/" className="flex-1">
          <Button variant="outline" className="w-full h-11" size="default">{t("payment.continueShopping")}</Button>
        </Link>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {t("payment.paymentEmailSent")}
      </p>
    </div>
  );
}
