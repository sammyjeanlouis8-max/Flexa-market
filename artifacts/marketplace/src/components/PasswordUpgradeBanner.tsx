import { ShieldAlert, X } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import { useLocation } from "wouter";
import { useTranslation } from "react-i18next";

/**
 * Shown after a successful login that was authenticated against a legacy
 * SHA-256 password hash. Prompts the user to set a new password voluntarily
 * before any admin-forced invalidation locks them out.
 *
 * Dismissed permanently (within this session + localStorage) once the user
 * clicks "Dismiss" or successfully changes their password via Settings.
 */
export default function PasswordUpgradeBanner() {
  const { user, requiresPasswordUpgrade, dismissPasswordUpgrade } = useAuth();
  const [, navigate] = useLocation();
  const { t } = useTranslation();

  if (!user || !requiresPasswordUpgrade) return null;

  const handleUpdate = () => {
    dismissPasswordUpgrade();
    navigate("/settings/security");
  };

  return (
    <div
      className="border-b border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 px-4 py-3 text-sm text-amber-900 dark:text-amber-200"
      data-testid="password-upgrade-banner"
      role="alert"
    >
      <div className="mx-auto flex max-w-6xl items-start gap-3">
        <ShieldAlert className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1">
          <p className="font-semibold">{t("settings.passwordUpgradeTitle")}</p>
          <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
            {t("settings.passwordUpgradeDesc")}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={handleUpdate}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700 transition-colors"
            data-testid="button-password-upgrade"
          >
            {t("settings.passwordUpgradeBtn")}
          </button>
          <button
            type="button"
            onClick={dismissPasswordUpgrade}
            aria-label={t("buttons.dismiss")}
            className="rounded-md p-1 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
            data-testid="button-dismiss-password-upgrade"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
