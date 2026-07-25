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
    // If verification takes more than 8 s, surface an escape hatch
    const timer = setTimeout(() => {
      setTimedOut(true);
      controller.abort();
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
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 px-4">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground text-sm">{t("payment.verifyingPayment")}</p>
        </div>
        {timedOut && (
          <div className="border border-border rounded-xl p-4 bg-card max-w-sm w-full text-center space-y-3">
            <AlertCircle className="h-5 w-5 text-amber-500 mx-auto" />
            <p className="text-xs text-muted-foreground">{t("payment.verifyingTakingLong")}</p>
            <div className="flex gap-2 justify-center">
              <Button size="sm" variant="outline" onClick={() => window.location.reload()} className="gap-1.5">
                <Loader2 className="h-3.5 w-3.5" /> {t("subscription.retry")}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setLocation("/")} className="gap-1.5">
                <ArrowLeft className="h-3.5 w-3.5" /> {t("errors.goHome")}
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (error || result?.status !== "paid") {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-6">
        <XCircle className="h-16 w-16 text-destructive mx-auto" />
        <h1 className="text-2xl font-bold">{t("payment.paymentNotConfirmed")}</h1>
        <p className="text-muted-foreground">{error ?? t("payment.paymentNotVerified")}</p>
        <div className="flex gap-3 justify-center">
          <Link href="/orders"><Button variant="outline">{t("payment.myOrders")}</Button></Link>
          <Link href="/"><Button>{t("errors.goHome")}</Button></Link>
        </div>
      </div>
    );
  }

  const amountStr = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: result.currency?.toUpperCase() ?? "USD",
  }).format(result.amount);

  return (
    <div className="max-w-lg mx-auto px-4 py-16 space-y-6">
      <div className="text-center space-y-3">
        <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
        <h1 className="text-3xl font-bold">{t("payment.paymentSuccessful")}</h1>
        <p className="text-muted-foreground">{t("payment.paymentThankYou")}</p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">{t("payment.amountPaid")}</span>
            <span className="font-semibold text-green-500 dark:text-green-400">{amountStr}</span>
          </div>
          {result.transaction && (
            <>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("payment.orderNumber")}</span>
                <span className="font-medium">{result.transaction.id}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{t("payment.orderStatus")}</span>
                <span className="inline-flex items-center gap-1 text-blue-500 dark:text-blue-400 font-medium">
                  <Package className="h-3.5 w-3.5" />
                  {t("payment.preparingToShip")}
                </span>
              </div>
              {result.transaction.shippingName && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("payment.shipTo")}</span>
                  <span className="font-medium">{result.transaction.shippingName}</span>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Link href="/orders" className="flex-1">
          <Button className="w-full" size="lg">
            {t("payment.trackOrder")} <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
        <Link href="/" className="flex-1">
          <Button variant="outline" className="w-full" size="lg">{t("payment.continueShopping")}</Button>
        </Link>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        {t("payment.paymentEmailSent")}
      </p>
    </div>
  );
}
