import { ShieldAlert } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRestriction } from "@/hooks/useRestriction";

interface Props {
  action?: "comment" | "message" | "post" | "boost";
}

export function RestrictionBanner({ action }: Props) {
  const { t } = useTranslation();
  const { restrictedUntil } = useRestriction();

  const actionLabel = action ? t(`restriction.actions.${action}`) : null;

  const expiry = restrictedUntil
    ? restrictedUntil.toLocaleDateString(undefined, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
      <ShieldAlert className="h-4 w-4 mt-0.5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="space-y-0.5">
        <p className="font-semibold leading-snug">
          {t("restriction.title")}
        </p>
        <p className="text-xs opacity-80">
          {actionLabel
            ? t("restriction.cannotAction", { action: actionLabel })
            : ""}
          {t("restriction.desc")}
          {expiry && (
            <span className="ml-1">
              {t("restriction.expiresOn", { date: expiry })}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
