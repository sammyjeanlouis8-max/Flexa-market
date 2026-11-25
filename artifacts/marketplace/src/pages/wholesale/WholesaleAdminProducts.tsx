import { useTranslation } from "react-i18next";
import { WholesaleLiveProductsPage } from "@/pages/wholesale/WholesaleLiveProducts";

export default function WholesaleAdminProducts() {
  const { t } = useTranslation();
  return (
    <WholesaleLiveProductsPage
      title={t("wholesale.adminProducts", { defaultValue: "Admin · products" })}
      subtitle={t("wholesale.adminProductsSub", { defaultValue: "Live wholesale catalog for Super Admin review." })}
      badge={(p) => p.status}
    />
  );
}
