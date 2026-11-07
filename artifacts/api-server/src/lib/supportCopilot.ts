/**
 * AI Copilot for support agents — suggestions only.
 * Agents must approve before sending. Never approves refunds or mutates payments.
 */
import { completeChat, type ChatTurn } from "./flexaAi";
import { retrieveKnowledge, formatKnowledgeBlock } from "./chatbotKnowledge";
import { classifySupportTicket, type SupportCategory, type SupportPriority } from "./supportClassify";
import { assertWithinDailyQuota, recordAiUsage } from "./flexaAiUsage";
import { logger } from "./logger";

export type CopilotAction =
  | "suggest_reply"
  | "grammar"
  | "translate"
  | "summarize"
  | "identify_problem"
  | "knowledge"
  | "classify"
  | "troubleshoot"
  | "internal_note";

export type CopilotMessage = { role: "customer" | "agent" | "bot" | "system"; content: string };

const ACTION_PROMPTS: Record<CopilotAction, string> = {
  suggest_reply:
    "Draft ONE professional customer-facing reply the human agent can edit. Do not claim actions were completed. Do not approve refunds or change orders.",
  grammar: "Correct grammar and clarity of the agent's draft. Keep the same language and meaning. Return only the corrected text.",
  translate:
    "Translate the text to the target language. Keep product names and ticket/order IDs unchanged. Return only the translation.",
  summarize: "Summarize the conversation in 3–6 bullet points for the agent. Include problem, steps tried, and open questions.",
  identify_problem: "Identify the customer's core problem in one short paragraph. List likely category and urgency.",
  knowledge: "Suggest relevant verified knowledge / troubleshooting steps. Cite only VERIFIED_KNOWLEDGE. If unsure, say so.",
  classify: "Classify category and priority. Return JSON: {\"category\":\"...\",\"priority\":\"normal|high|urgent\",\"reason\":\"...\"}",
  troubleshoot: "Suggest step-by-step troubleshooting the agent can verify. Never invent order/payment statuses.",
  internal_note: "Draft a concise INTERNAL note for agents only (customer will never see it).",
};

export async function runSupportCopilot(input: {
  action: CopilotAction;
  agentId: number;
  draft?: string;
  targetLang?: string;
  messages: CopilotMessage[];
  ticketSubject?: string;
}): Promise<{
  ok: boolean;
  text: string;
  classification?: { category: SupportCategory; priority: SupportPriority };
  provider?: string | null;
  error?: string;
}> {
  const action = input.action;
  if (!ACTION_PROMPTS[action]) {
    return { ok: false, text: "", error: "Invalid action" };
  }

  try {
    await assertWithinDailyQuota({ userId: input.agentId, capability: "admin", isAdmin: true });
  } catch (err: any) {
    return { ok: false, text: "", error: err?.message || "AI quota exceeded" };
  }

  const transcript = input.messages
    .slice(-40)
    .map((m) => `${m.role.toUpperCase()}: ${String(m.content || "").slice(0, 1500)}`)
    .join("\n");

  const subject = input.ticketSubject || "";
  const lastCustomer = [...input.messages].reverse().find((m) => m.role === "customer")?.content || subject;
  const classification = classifySupportTicket({
    subject,
    message: `${lastCustomer}\n${input.draft || ""}`,
  });
  const knowledge = formatKnowledgeBlock(retrieveKnowledge(`${subject} ${lastCustomer}`));

  if (action === "classify") {
    return {
      ok: true,
      text: JSON.stringify({
        category: classification.category,
        priority: classification.priority,
        reason: "Rule-based classification from ticket text (verified signals only).",
      }),
      classification,
      provider: "rules",
    };
  }

  const system = [
    "You are Flexa Copilot, an assistant for Flexa Market human support agents.",
    "English default. Match customer language when drafting replies if clear from transcript.",
    "Never fabricate customer data, order statuses, payment outcomes, or policies.",
    "Never approve refunds, modify payments, change deliveries, or access unauthorized data.",
    "Suggestions only — the human agent must approve before sending to the customer.",
    ACTION_PROMPTS[action],
    input.targetLang ? `Target language: ${input.targetLang}` : "",
    knowledge,
  ]
    .filter(Boolean)
    .join("\n\n");

  const userContent = [
    subject ? `Ticket subject: ${subject}` : "",
    `Suggested category: ${classification.category}; priority: ${classification.priority}`,
    "Conversation:",
    transcript || "(empty)",
    input.draft ? `\nAgent draft:\n${input.draft.slice(0, 4000)}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const messages: ChatTurn[] = [{ role: "user", content: userContent }];

  try {
    const result = await completeChat({
      system,
      messages,
      maxTokens: 900,
      temperature: 0.3,
    });
    const text = (result?.text || "").trim();
    if (!text) {
      return {
        ok: true,
        text: fallbackSuggestion(action, classification, input.draft),
        classification,
        provider: result?.provider ?? "fallback",
      };
    }
    await recordAiUsage({
      userId: input.agentId,
      capability: "admin",
      provider: result.provider,
      model: result.model,
      inputChars: userContent.length,
      outputChars: text.length,
    }).catch(() => {});
    return {
      ok: true,
      text,
      classification,
      provider: result.provider,
    };
  } catch (err: any) {
    logger.warn({ err: err?.message }, "support copilot failed");
    return {
      ok: true,
      text: fallbackSuggestion(action, classification, input.draft),
      classification,
      provider: "fallback",
      error: err?.message,
    };
  }
}

function fallbackSuggestion(
  action: CopilotAction,
  classification: { category: SupportCategory; priority: SupportPriority },
  draft?: string,
): string {
  if (action === "grammar" || action === "translate") return (draft || "").trim();
  if (action === "summarize") {
    return `• Category: ${classification.category}\n• Priority: ${classification.priority}\n• Review transcript and verify order/account data before replying.`;
  }
  if (action === "internal_note") {
    return `Internal: category=${classification.category}, priority=${classification.priority}. Verify live data before customer reply.`;
  }
  return (
    `Thank you for contacting Flexa Market Support. I am reviewing your ${classification.category} request ` +
    `and will follow up with verified information shortly.`
  );
}
