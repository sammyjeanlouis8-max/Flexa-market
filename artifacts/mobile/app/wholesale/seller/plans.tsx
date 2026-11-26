import { Text } from "react-native";
import { useLanguage } from "@/context/LanguageContext";
import { WholesaleGate } from "@/components/wholesale/WholesaleGate";
import { WholesaleShell } from "@/components/wholesale/WholesaleShell";

export default function Screen() {
  const { t } = useLanguage();
  return (
    <WholesaleGate>
      <WholesaleShell title={t("wholesale_plansTitle")}>
        <Text>{t("wholesale_plansSubtitle")}</Text>
      </WholesaleShell>
    </WholesaleGate>
  );
}
