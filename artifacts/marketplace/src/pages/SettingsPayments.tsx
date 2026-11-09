import { Link } from "wouter";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/auth";
import { ArrowLeft, Clock, FileText } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { COUNTRY_FLAGS } from "@/lib/countries";
import { STRIPE_SUPPORTED_COUNTRIES, isMonCashPayoutCountry } from "@/lib/paymentCountries";
import {
  StripeConnectPanel,
  HaitiPayoutPanel,
  CardPayoutMethodPanel,
  PaymentStatusBanner,
} from "@/components/payments/SellerPayoutPanels";
import { SavedCardsManager } from "@/components/checkout/SavedCardsManager";

export default function SettingsPayments() {
  const { user } = useAuth();
  const { t } = useTranslation();

  if (!user) {
    return (
      <div className="max-w-md mx-auto p-6 text-center">
        <p className="text-muted-foreground mb-4">{t("settings.loginRequired")}</p>
        <Link href="/auth/login"><Button>{t("auth.signIn")}</Button></Link>
      </div>
    );
  }

  const isStripeSupported = user.country ? STRIPE_SUPPORTED_COUNTRIES.has(user.country) : false;
  const showMonCash = isMonCashPayoutCountry(user.country);
  const countryFlag = user.country ? (COUNTRY_FLAGS[user.country] ?? "🌍") : "🌍";

  return (
    <div className="max-w-2xl mx-auto p-3 sm:p-4 md:p-5 space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Link
          href="/settings"
          className="h-11 w-11 rounded-full flex items-center justify-center hover:bg-accent"
          aria-label={t("settings.backToSettings")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="min-w-0">
          <h1 className="text-lg font-bold truncate">{t("accountCenter.paymentsWithdrawals")}</h1>
          <p className="text-xs text-muted-foreground">{t("accountCenter.paymentsPageSub")}</p>
        </div>
      </div>

      {user.country && (
        <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-medium">
          <span aria-hidden>{countryFlag}</span>
          <span>{t("accountCenter.accountCountry")}: {user.country}</span>
          {showMonCash && (
            <span className="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 px-2 py-0.5 text-[10px] font-bold">
              {t("accountCenter.haitiOnly")}
            </span>
          )}
        </div>
      )}

      <Card className="p-4">
        <SavedCardsManager />
      </Card>

      <div className="space-y-1">
        <h2 className="text-sm font-bold text-foreground">{t("accountCenter.payoutMethodsTitle")}</h2>
        <p className="text-xs text-muted-foreground">{t("accountCenter.payoutMethodsSub")}</p>
      </div>

      <PaymentStatusBanner stripeStatus={user.stripeAccountStatus} />

      {/* Haiti: Stripe + MonCash combined panel. Non-Haiti: Stripe only — MonCash fully hidden. */}
      {showMonCash ? (
        <HaitiPayoutPanel />
      ) : (
        <StripeConnectPanel required={isStripeSupported} />
      )}

      <CardPayoutMethodPanel />

      <div className="space-y-2">
        <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
          {t("accountCenter.otherOptions")}
        </h2>
        <Card className="overflow-hidden rounded-2xl divide-y divide-border">
          <Link href="/wallet/history" className="flex items-center gap-3 px-4 py-3.5 hover:bg-accent min-h-11">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">{t("accountCenter.withdrawalHistory")}</span>
          </Link>
          <Link href="/wallet/history" className="flex items-center gap-3 px-4 py-3.5 hover:bg-accent min-h-11">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">{t("accountCenter.transactionsStatements")}</span>
          </Link>
          <Link href="/wallet" className="flex items-center gap-3 px-4 py-3.5 hover:bg-accent min-h-11">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">{t("accountCenter.walletCashout")}</span>
          </Link>
        </Card>
      </div>
    </div>
  );
}
