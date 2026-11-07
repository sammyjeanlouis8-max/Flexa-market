import { useTranslation } from "react-i18next";
import BoosterLayout from "./BoosterLayout";

export default function BoosterHelp() {
  const { t } = useTranslation();
  const rules = [
    "booster.help.r1",
    "booster.help.r2",
    "booster.help.r3",
    "booster.help.r4",
    "booster.help.r5",
    "booster.help.r6",
    "booster.help.r7",
    "booster.help.r8",
  ];

  return (
    <BoosterLayout title={t("booster.help.title")} subtitle={t("booster.help.subtitle")}>
      <div className="bp-card">
        <ul className="space-y-3">
          {rules.map((k) => (
            <li key={k} className="flex gap-2 text-sm">
              <span className="text-violet-600 font-bold">✓</span>
              <span>{t(k)}</span>
            </li>
          ))}
        </ul>
      </div>
    </BoosterLayout>
  );
}
