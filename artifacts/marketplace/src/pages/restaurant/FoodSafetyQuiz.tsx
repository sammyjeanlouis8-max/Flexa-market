import { useState } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantNotice, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { submitFoodSafetyQuiz } from "@/lib/restaurantApi";

const QUESTIONS = [
  { id: "q1", prompt: "Wash hands before handling food?", options: [{ id: "a", label: "Yes" }, { id: "b", label: "Only on weekends" }] },
  { id: "q2", prompt: "Keep hot food above safe temperature?", options: [{ id: "a", label: "Yes" }, { id: "b", label: "No" }] },
] as const;

export default function FoodSafetyQuiz() {
  const { t } = useTranslation();
  const search = useSearch();
  const restaurantId = Number(new URLSearchParams(search).get("rid"));
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [terms, setTerms] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit() {
    if (!restaurantId || !terms) return;
    setSubmitting(true);
    try {
      const res = await submitFoodSafetyQuiz(restaurantId, {
        articleVersion: "restaurant-food-safety-v1",
        answers,
        termsAccepted: true,
      });
      setResult(res.passed ? `Passed (${res.score})` : `Try again (${res.score})`);
    } catch (e) {
      setResult(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RestaurantPageGate requireAuth>
      <RestaurantShell title={t("restaurant.foodSafetyQuiz")} subtitle={t("restaurant.foodSafetySubtitle")}>
        <RestaurantNotice>{t("restaurant.freeLaunchNote")}</RestaurantNotice>
        <div className="mt-4 space-y-4">
          {QUESTIONS.map((q) => (
            <fieldset key={q.id} className="rounded-xl border bg-white p-3 dark:bg-[hsl(152,16%,12%)]">
              <legend className="px-1 text-sm font-semibold">{q.prompt}</legend>
              <div className="mt-2 space-y-1">
                {q.options.map((opt) => (
                  <label key={opt.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === opt.id}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: opt.id }))}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1" />
            <span>{t("restaurant.identityPrivacyAccept")}</span>
          </label>
          <button
            type="button"
            disabled={submitting || !terms}
            onClick={onSubmit}
            className="rounded-full bg-[hsl(152,55%,28%)] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {t("restaurant.foodSafetyQuiz")}
          </button>
          {result && <p className="text-sm font-semibold">{result}</p>}
        </div>
      </RestaurantShell>
    </RestaurantPageGate>
  );
}