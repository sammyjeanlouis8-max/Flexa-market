/** Food safety article + quiz for Flexa Restaurant onboarding. */

export const FOOD_SAFETY_ARTICLE_VERSION = "restaurant-food-safety-v2-business-delivery";

export const FOOD_SAFETY_PASS_SCORE = 5;

export type FoodSafetyQuestion = {
  id: string;
  prompt: string;
  choices: { id: string; label: string }[];
  correctChoiceId: string;
};

export const FOOD_SAFETY_ARTICLE_SECTIONS = [
  {
    id: "hygiene",
    titleKey: "restaurant.safety.hygieneTitle",
    bodyKey: "restaurant.safety.hygieneBody",
  },
  {
    id: "equipment",
    titleKey: "restaurant.safety.equipmentTitle",
    bodyKey: "restaurant.safety.equipmentBody",
  },
  {
    id: "temps",
    titleKey: "restaurant.safety.tempsTitle",
    bodyKey: "restaurant.safety.tempsBody",
  },
  {
    id: "cross",
    titleKey: "restaurant.safety.crossTitle",
    bodyKey: "restaurant.safety.crossBody",
  },
  {
    id: "allergens",
    titleKey: "restaurant.safety.allergensTitle",
    bodyKey: "restaurant.safety.allergensBody",
  },
  {
    id: "permits",
    titleKey: "restaurant.safety.permitsTitle",
    bodyKey: "restaurant.safety.permitsBody",
  },
  {
    id: "suspension",
    titleKey: "restaurant.safety.suspensionTitle",
    bodyKey: "restaurant.safety.suspensionBody",
  },
  {
    id: "businessDelivery",
    titleKey: "restaurant.safety.businessDeliveryTitle",
    bodyKey: "restaurant.safety.businessDeliveryBody",
  },
] as const;

/** Explicit business responsibility acknowledgment shown during onboarding / checkout. */
export const FOOD_BUSINESS_RESPONSIBILITY_ACK =
  "I acknowledge that my business is fully responsible for food preparation, hygiene, safe packaging, allergen disclosure, temperature control, food transportation, delivery personnel, applicable licenses and permits, and customer delivery complaints. Flexa Driver never transports Flexa Restaurant food orders.";

export const FOOD_SAFETY_QUESTIONS: FoodSafetyQuestion[] = [
  {
    id: "q1",
    prompt: "When should you wash your hands while preparing food?",
    choices: [
      { id: "a", label: "Only at the start of the day" },
      { id: "b", label: "Before handling food, after raw meat, and after using the restroom" },
      { id: "c", label: "Only if hands look dirty" },
      { id: "d", label: "Never — gloves replace handwashing" },
    ],
    correctChoiceId: "b",
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
    correctChoiceId: "b",
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
    correctChoiceId: "c",
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
    correctChoiceId: "b",
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
    correctChoiceId: "b",
  },
  {
    id: "q6",
    prompt: "Who delivers Flexa Restaurant food orders?",
    choices: [
      { id: "a", label: "Flexa Driver always delivers restaurant food" },
      { id: "b", label: "The business delivers or the customer picks up — Flexa Driver never transports restaurant food" },
      { id: "c", label: "Any marketplace courier can accept the job" },
      { id: "d", label: "Only Super Admin drivers" },
    ],
    correctChoiceId: "b",
  },
];

export function gradeFoodSafetyQuiz(answers: Record<string, string>): {
  score: number;
  passed: boolean;
  incorrect: string[];
} {
  const incorrect: string[] = [];
  let score = 0;
  for (const q of FOOD_SAFETY_QUESTIONS) {
    if (answers[q.id] === q.correctChoiceId) score += 1;
    else incorrect.push(q.id);
  }
  return { score, passed: score >= FOOD_SAFETY_PASS_SCORE, incorrect };
}

export function publicQuizPayload() {
  return {
    articleVersion: FOOD_SAFETY_ARTICLE_VERSION,
    passScore: FOOD_SAFETY_PASS_SCORE,
    sections: FOOD_SAFETY_ARTICLE_SECTIONS,
    questions: FOOD_SAFETY_QUESTIONS.map(({ id, prompt, choices }) => ({ id, prompt, choices })),
  };
}
