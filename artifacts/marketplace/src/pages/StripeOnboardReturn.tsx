import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { CheckCircle2, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useTranslation } from "react-i18next";

type Phase = "loading" | "active" | "pending" | "error";

export default function StripeOnboardReturn() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [, navigate] = useLocation();
  const { t } = useTranslation();

  useEffect(() => {
    const tk = localStorage.getItem("flexamarket_token");
    if (!tk) { setPhase("error"); return; }

    fetch("/api/stripe/connect/status", {
      headers: { Authorization: `Bearer ${tk}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.stripeAccountStatus === "active") setPhase("active");
        else setPhase("pending");
      })
      .catch(() => setPhase("error"));
  }, []);

  const handleRefreshLink = async () => {
    setPhase("loading");
    const tk = localStorage.getItem("flexamarket_token");
    try {
      const res = await fetch("/api/stripe/connect/refresh", {
        method: "POST",
        headers: { Authorization: `Bearer ${tk}` },
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else setPhase("error");
    } catch {
      setPhase("error");
    }
  };

  if (phase === "loading") {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin text-primary mx-auto" />
          <p className="text-muted-foreground">{t("stripeConnect.verifying")}</p>
        </div>
      </div>
    );
  }

  if (phase === "active") {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-6">
        <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
        <h1 className="text-2xl font-bold">{t("stripeConnect.activeTitle")}</h1>
        <p className="text-muted-foreground">
          {t("stripeConnect.activeDesc")}
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/settings"><Button>{t("stripeConnect.backToSettings")}</Button></Link>
          <Link href="/sell"><Button variant="outline">{t("stripeConnect.postListing")}</Button></Link>
        </div>
      </div>
    );
  }

  if (phase === "pending") {
    return (
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-6">
        <AlertCircle className="h-14 w-14 text-yellow-500 mx-auto" />
        <h1 className="text-2xl font-bold">{t("stripeConnect.pendingTitle")}</h1>
        <Card>
          <CardContent className="pt-5">
            <p className="text-muted-foreground text-sm">
              {t("stripeConnect.pendingDesc")}
            </p>
          </CardContent>
        </Card>
        <div className="flex gap-3 justify-center">
          <Button onClick={handleRefreshLink}>
            <RefreshCw className="mr-2 h-4 w-4" />
            {t("stripeConnect.completeSetup")}
          </Button>
          <Link href="/settings"><Button variant="outline">{t("stripeConnect.backToSettings")}</Button></Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-6">
      <AlertCircle className="h-14 w-14 text-destructive mx-auto" />
      <h1 className="text-2xl font-bold">{t("stripeConnect.errorTitle")}</h1>
      <p className="text-muted-foreground">{t("stripeConnect.errorDesc")}</p>
      <div className="flex gap-3 justify-center">
        <Button onClick={handleRefreshLink}>{t("stripeConnect.tryAgain")}</Button>
        <Link href="/settings"><Button variant="outline">{t("stripeConnect.backToSettings")}</Button></Link>
      </div>
    </div>
  );
}
