import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantNotice, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import RestaurantDiscover from "@/pages/restaurant/Discover";

export default function FlexaRestaurant() {
  const { t } = useTranslation();
  return (
    <RestaurantPageGate>
      <RestaurantShell>
        <div className="mb-4 space-y-2">
          <RestaurantNotice>{t("restaurant.freeLaunchNote")}</RestaurantNotice>
          <RestaurantNotice>{t("restaurant.identityBadgeNote")}</RestaurantNotice>
        </div>
        <RestaurantDiscover embedded />
      </RestaurantShell>
    </RestaurantPageGate>
  );
}
