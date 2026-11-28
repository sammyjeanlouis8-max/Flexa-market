import { Text } from "react-native";
import { useLanguage } from "@/context/LanguageContext";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";

export default function Screen() {
  const { t } = useLanguage();
  return (
    <WholesaleGate requireAuth>
      <WholesaleShell title={t("wholesale_plansTitle")}>
        <Text testID="wholesale-plans-free">
          {t("wholesale_plansFreeLaunch")
            || "Flexa Wholesale is free during the initial public launch. No subscription charges are active."}
        </Text>
      </WholesaleShell>
    </WholesaleGate>
  );
}
