import { useState } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantNotice, RestaurantShell } from "@/components/restaurant/RestaurantShell";

export default function IdentityVerification() {
  const { t } = useTranslation();
  const search = useSearch();
  const restaurantId = new URLSearchParams(search).get("rid");
  const [accepted, setAccepted] = useState(false);

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell title={t("restaurant.identityVerification")} subtitle={t("restaurant.identityVerificationSubtitle")}>
        <div className="space-y-3">
          <h3 className="font-bold">{t("restaurant.identityPrivacyTitle")}</h3>
          <p className="text-sm text-muted-foreground">{t("restaurant.identityPrivacyBody")}</p>
          <RestaurantNotice>{t("restaurant.identityBadgeNote")}</RestaurantNotice>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-1" />
            <span>{t("restaurant.identityPrivacyAccept")}</span>
          </label>
          <p className="text-xs text-muted-foreground">
            Restaurant #{restaurantId ?? "—"} — upload flows connect when API routes are live.
          </p>
        </div>
      </RestaurantShell>
    </RestaurantPageGate>
  );
}