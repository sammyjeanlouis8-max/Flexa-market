import { useEffect, useState } from "react";
import { useSearch } from "wouter";
import { useTranslation } from "react-i18next";
import { RestaurantPageGate } from "@/components/restaurant/RestaurantPageGate";
import { RestaurantNotice, RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { submitFoodSafetyQuiz } from "@/lib/restaurantApi";

type QuizQ = { id: string; prompt: string; choices: { id: string; label: string }[] };
type QuizSection = { id: string; titleKey: string; bodyKey: string };

const FALLBACK_QUESTIONS: QuizQ[] = [
  {
    id: "q1",
    prompt: "When should you wash your hands while preparing food?",
    choices: [
      { id: "a", label: "Only at the start of the day" },
      { id: "b", label: "Before handling food, after raw meat, and after using the restroom" },
      { id: "c", label: "Only if hands look dirty" },
      { id: "d", label: "Never — gloves replace handwashing" },
    ],
  },
  {
    id: "q2",
    prompt: "How should raw meat and ready-to-eat food be handled?",
    choices: [
      { id: "a", label: "Use the same cutting board to save time" },
      { id: "b", label: "Keep them separated to prevent cross-contamination" },
      { id: "c", label: "Rinse raw meat in the sink next to salads" },
      { id: "d", label: "Store raw meat above cooked food in the fridge" },
    ],
  },
  {
    id: "q3",
    prompt: "What should you do with expired or spoiled ingredients?",
    choices: [
      { id: "a", label: "Cook them longer to make them safe" },
      { id: "b", label: "Mix them into sauces" },
      { id: "c", label: "Discard them and never serve them" },
      { id: "d", label: "Sell them at a discount" },
    ],
  },
  {
    id: "q4",
    prompt: "Why must allergens and ingredients be disclosed?",
    choices: [
      { id: "a", label: "They are optional marketing details" },
      { id: "b", label: "Customers with allergies need accurate information to stay safe" },
      { id: "c", label: "Only restaurants with more than 10 seats must disclose" },
      { id: "d", label: "Only if a customer asks twice" },
    ],
  },
  {
    id: "q5",
    prompt: "Which situation may result in restaurant suspension?",
    choices: [
      { id: "a", label: "Updating opening hours" },
      { id: "b", label: "Serious hygiene or food safety complaints under investigation" },
      { id: "c", label: "Temporarily closing for vacation" },
      { id: "d", label: "Changing a dish photo" },
    ],
  },
];

const ARTICLE_FALLBACK: QuizSection[] = [
  { id: "hygiene", titleKey: "restaurant.safety.hygieneTitle", bodyKey: "restaurant.safety.hygieneBody" },
  { id: "equipment", titleKey: "restaurant.safety.equipmentTitle", bodyKey: "restaurant.safety.equipmentBody" },
  { id: "temps", titleKey: "restaurant.safety.tempsTitle", bodyKey: "restaurant.safety.tempsBody" },
  { id: "cross", titleKey: "restaurant.safety.crossTitle", bodyKey: "restaurant.safety.crossBody" },
  { id: "allergens", titleKey: "restaurant.safety.allergensTitle", bodyKey: "restaurant.safety.allergensBody" },
  { id: "permits", titleKey: "restaurant.safety.permitsTitle", bodyKey: "restaurant.safety.permitsBody" },
  { id: "suspension", titleKey: "restaurant.safety.suspensionTitle", bodyKey: "restaurant.safety.suspensionBody" },
  { id: "businessDelivery", titleKey: "restaurant.safety.businessDeliveryTitle", bodyKey: "restaurant.safety.businessDeliveryBody" },
];

export default function FoodSafetyQuiz() {
  const { t } = useTranslation();
  const search = useSearch();
  const restaurantId = Number(new URLSearchParams(search).get("rid"));
  const [articleVersion, setArticleVersion] = useState("restaurant-food-safety-v1");
  const [passScore, setPassScore] = useState(4);
  const [sections, setSections] = useState<QuizSection[]>(ARTICLE_FALLBACK);
  const [questions, setQuestions] = useState<QuizQ[]>(FALLBACK_QUESTIONS);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [terms, setTerms] = useState(false);
  const [responsibility, setResponsibility] = useState(false);
  const [readDone, setReadDone] = useState(false);
  const [incorrect, setIncorrect] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/restaurants/food-safety/quiz", {
      headers: {
        Authorization: `Bearer ${localStorage.getItem("flexamarket_token") ?? localStorage.getItem("token") ?? ""}`,
      },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.articleVersion) setArticleVersion(data.articleVersion);
        if (data.passScore) setPassScore(data.passScore);
        if (Array.isArray(data.sections) && data.sections.length) setSections(data.sections);
        if (Array.isArray(data.questions) && data.questions.length) setQuestions(data.questions);
      })
      .catch(() => undefined);
  }, []);

  async function onSubmit() {
    if (!restaurantId || !terms || !responsibility || !readDone) return;
    setSubmitting(true);
    setResult(null);
    try {
      const res = await submitFoodSafetyQuiz(restaurantId, {
        articleVersion,
        answers,
        termsAccepted: true,
        foodResponsibilityAccepted: true,
      }) as { passed: boolean; score: number; incorrect?: string[] };
      setIncorrect(res.incorrect ?? []);
      setResult(
        res.passed
          ? `Passed (${res.score}/${questions.length}) — you may publish after identity verification.`
          : `Score ${res.score}/${questions.length}. Need ${passScore}+. Review incorrect answers and retry.`,
      );
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

        <section className="mt-4 space-y-3">
          <h3 className="font-bold">Food safety & platform rules</h3>
          {sections.map((s) => (
            <article key={s.id} className="rounded-xl border bg-white p-3 dark:bg-[hsl(152,16%,12%)]">
              <h4 className="text-sm font-bold">
                {t(s.titleKey, {
                  defaultValue: s.id.replace(/_/g, " "),
                })}
              </h4>
              <p className="mt-1 text-sm text-muted-foreground">
                {t(s.bodyKey, {
                  defaultValue:
                    s.id === "hygiene"
                      ? "Wash hands before food prep, after raw meat, and after using the restroom. Wear clean clothes and keep nails short."
                      : s.id === "equipment"
                        ? "Clean cooking equipment, utensils, and surfaces before and after use."
                        : s.id === "temps"
                          ? "Cook and store food at safe temperatures. Keep hot food hot and cold food cold."
                          : s.id === "cross"
                            ? "Prevent cross-contamination: separate raw and ready-to-eat foods, boards, and knives."
                            : s.id === "allergens"
                              ? "Disclose ingredients and allergens accurately. Never hide major allergens."
                              : s.id === "permits"
                                ? "Follow local food-business permits and regulations where you operate."
                                : s.id === "businessDelivery"
                                  ? "You—not Flexa Driver—prepare, package, transport, and deliver food. Customers may pick up or you deliver with your own staff. Confirm handoff with the order PIN."
                                  : "Unsafe food, hygiene failures, fraud, or serious complaints may lead to suspension.",
                })}
              </p>
            </article>
          ))}
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={readDone} onChange={(e) => setReadDone(e.target.checked)} className="mt-1" />
            <span>I have read the food safety article (version {articleVersion}).</span>
          </label>
        </section>

        <div className="mt-6 space-y-4">
          <h3 className="font-bold">Quiz · pass {passScore}/{questions.length}</h3>
          {questions.map((q) => (
            <fieldset
              key={q.id}
              className={`rounded-xl border bg-white p-3 dark:bg-[hsl(152,16%,12%)] ${incorrect.includes(q.id) ? "border-destructive" : ""}`}
            >
              <legend className="px-1 text-sm font-semibold">{q.prompt}</legend>
              <div className="mt-2 space-y-1">
                {q.choices.map((opt) => (
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
            <span>I accept the Flexa Restaurant food safety and platform rules.</span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={responsibility} onChange={(e) => setResponsibility(e.target.checked)} className="mt-1" />
            <span>
              {t("restaurant.foodResponsibilityAck", {
                defaultValue:
                  "I acknowledge my business is responsible for food prep, hygiene, packaging, allergens, temperature control, transportation, delivery staff, permits, and delivery complaints. Flexa Driver does not deliver restaurant food.",
              })}
            </span>
          </label>
          <button
            type="button"
            disabled={submitting || !terms || !responsibility || !readDone || !restaurantId}
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
