import { CreditCard, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocation } from "wouter";
import { useAuth } from "@/contexts/auth";

/**
 * Permanent, app-wide notice shown to any logged-in user whose Flex Card is
 * blocked for debt. The account stays fully usable (login, browse, sell,
 * receive money) — only OUTGOING money is blocked until the debt is repaid.
 * Tapping "Pay now" opens the in-app repayment page.
 */
export function FlexCardDebtBanner() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [, navigate] = useLocation();

  if (!user?.flexCardBlocked) return null;

  const debt = user.flexCardDebtUsd ?? 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-3 pt-2">
      <div className="flex items-start gap-3 rounded-xl border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/30 px-4 py-3">
        <CreditCard className="h-5 w-5 mt-0.5 flex-shrink-0 text-red-600 dark:text-red-400" />
        <div className="flex-1 min-w-0 space-y-0.5">
          <p className="font-semibold text-sm text-red-800 dark:text-red-300 leading-snug">
            {t("flexCard.bannerTitle")}
          </p>
          <p className="text-xs text-red-700/80 dark:text-red-300/80">
            {t("flexCard.bannerDesc", { amount: debt.toFixed(2) })}
          </p>
        </div>
        <button
          onClick={() => navigate("/flex-card/repay")}
          className="shrink-0 self-center rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 active:bg-red-800 transition-colors flex items-center gap-1"
        >
          {t("flexCard.payNow")} <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default FlexCardDebtBanner;
