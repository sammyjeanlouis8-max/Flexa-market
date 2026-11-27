import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { RestaurantShell } from "@/components/restaurant/RestaurantShell";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { fetchFoodSafetyQuiz, submitFoodSafetyQuiz } from "@/lib/restaurantApi";
import { restaurantTheme as T } from "@/lib/restaurantTheme";

type QuizQ = { id: string; prompt: string; choices: { id: string; label: string }[] };

const FALLBACK: QuizQ[] = [
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
  {
    id: "q6",
    prompt: "Who transports Flexa Restaurant food orders?",
    choices: [
      { id: "a", label: "Flexa Driver" },
      { id: "b", label: "The food business itself (owner-managed delivery or customer pickup)" },
      { id: "c", label: "Any nearby courier app" },
      { id: "d", label: "Customers must always pick up" },
    ],
  },
];

export default function OwnerFoodSafetyScreen() {
  const { t } = useLanguage();
  const { token } = useAuth();
  const router = useRouter();
  const { rid } = useLocalSearchParams<{ rid?: string }>();
  const restaurantId = Number(rid) || 0;
  const [articleVersion, setArticleVersion] = useState("restaurant-food-safety-v1");
  const [questions, setQuestions] = useState<QuizQ[]>(FALLBACK);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [terms, setTerms] = useState(false);
  const [responsibility, setResponsibility] = useState(false);
  const [readDone, setReadDone] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [incorrect, setIncorrect] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFoodSafetyQuiz({ token })
      .then((data) => {
        if (data.articleVersion) setArticleVersion(data.articleVersion);
        if (data.questions?.length) setQuestions(data.questions as QuizQ[]);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [token]);

  async function submit() {
    if (!restaurantId || !token) return;
    if (!terms || !responsibility || !readDone) {
      setResult(t("restaurant_foodSafetyAckRequired") || "Accept terms and food responsibility first.");
      return;
    }
    setSubmitting(true);
    setResult(null);
    try {
      const res = await submitFoodSafetyQuiz(
        restaurantId,
        {
          articleVersion,
          answers,
          termsAccepted: terms,
          foodResponsibilityAccepted: responsibility,
        },
        { token },
      );
      if (res.passed) {
        setResult(t("restaurant_foodSafetyPassed") || `Passed (${res.score})`);
        setTimeout(() => router.replace(`/restaurant/owner?rid=${restaurantId}` as any), 800);
      } else {
        setIncorrect(res.incorrect || []);
        setResult(t("restaurant_foodSafetyFailed") || `Did not pass (${res.score}). Retry.`);
      }
    } catch (e: any) {
      setResult(e?.message || "Submit failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <RestaurantShell title={t("restaurant_foodSafetyQuiz") || "Food safety"} subtitle={t("restaurant_foodSafetySubtitle") || ""}>
      {loading ? (
        <ActivityIndicator color={T.accent} />
      ) : (
        <>
          <Text style={styles.note}>{t("restaurant_driverPolicyNote")}</Text>
          <Text style={styles.p}>
            {t("restaurant_foodSafetyTrainingBody") ||
              "Read hygiene, temperature, allergen, and delivery responsibility guidance, then complete the quiz."}
          </Text>
          <Pressable style={styles.row} onPress={() => setReadDone((v) => !v)}>
            <Text style={{ fontSize: 18 }}>{readDone ? "☑" : "☐"}</Text>
            <Text style={styles.p}>{t("restaurant_trainingRead") || "I have read the food safety training"}</Text>
          </Pressable>

          {questions.map((q) => (
            <View key={q.id} style={styles.card}>
              <Text style={styles.title}>{q.prompt}</Text>
              {q.choices.map((c) => (
                <Pressable
                  key={c.id}
                  style={[styles.choice, answers[q.id] === c.id && styles.choiceOn]}
                  onPress={() => setAnswers((a) => ({ ...a, [q.id]: c.id }))}
                >
                  <Text style={[styles.choiceText, answers[q.id] === c.id && styles.choiceTextOn]}>{c.label}</Text>
                </Pressable>
              ))}
              {incorrect.includes(q.id) ? <Text style={styles.err}>Incorrect</Text> : null}
            </View>
          ))}

          <Pressable style={styles.row} onPress={() => setTerms((v) => !v)}>
            <Text style={{ fontSize: 18 }}>{terms ? "☑" : "☐"}</Text>
            <Text style={styles.p}>{t("restaurant_acceptTerms") || "I accept the food safety terms"}</Text>
          </Pressable>
          <Pressable style={styles.row} onPress={() => setResponsibility((v) => !v)}>
            <Text style={{ fontSize: 18 }}>{responsibility ? "☑" : "☐"}</Text>
            <Text style={styles.p}>
              {t("restaurant_foodResponsibilityAck") ||
                "I acknowledge food prep, packaging, allergens, and owner-managed delivery. Flexa Driver does not transport restaurant food."}
            </Text>
          </Pressable>

          <Pressable style={[styles.btn, submitting && { opacity: 0.6 }]} disabled={submitting} onPress={() => void submit()}>
            <Text style={styles.btnText}>{submitting ? "…" : t("restaurant_submitQuiz") || "Submit quiz"}</Text>
          </Pressable>
          {result ? <Text style={styles.msg}>{result}</Text> : null}
        </>
      )}
    </RestaurantShell>
  );
}

const styles = StyleSheet.create({
  note: { fontSize: 12, color: T.accent, marginBottom: 8, lineHeight: 17 },
  p: { flex: 1, fontSize: 14, color: T.ink, lineHeight: 20, marginBottom: 8 },
  row: { flexDirection: "row", gap: 8, alignItems: "flex-start", marginBottom: 8 },
  card: {
    backgroundColor: T.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  title: { fontWeight: "800", color: T.ink, marginBottom: 8 },
  choice: {
    borderRadius: 12,
    padding: 10,
    marginBottom: 6,
    backgroundColor: T.mintSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
  },
  choiceOn: { backgroundColor: T.accent, borderColor: T.accent },
  choiceText: { fontSize: 13, color: T.ink },
  choiceTextOn: { color: T.white, fontWeight: "700" },
  btn: {
    marginTop: 8,
    backgroundColor: T.accent,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnText: { color: T.white, fontWeight: "900" },
  msg: { marginTop: 10, color: T.accent, fontWeight: "700" },
  err: { color: "#b91c1c", marginTop: 6, fontSize: 12 },
});
