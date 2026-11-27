/**
 * Super Admin–configurable Flexa AI Product Verification policy.
 * Balanced Enforcement is the intended production default after calibration.
 *
 * DB access is lazy so unit tests (rulesOnly) do not require DATABASE_URL.
 */

export type ModerationMode = "monitoring_only" | "balanced" | "strict";

export type VerificationDecision =
  | "APPROVED"
  | "APPROVED_WITH_SUGGESTIONS"
  | "CORRECTION_REQUIRED"
  | "UNDER_REVIEW"
  | "REJECTED"
  | "ANALYSIS_FAILED";

export interface ProductVerificationPolicy {
  mode: ModerationMode;
  /** Min AI confidence to treat a substantial category mismatch as CORRECTION_REQUIRED (balanced). */
  substantialMismatchConfidence: number;
  /** Min confidence to auto-reject prohibited signals from AI alone (never below rules). */
  prohibitedAiConfidence: number;
  /** When AI is down: allow low-risk listings through after deterministic checks. */
  fallbackAllowLowRisk: boolean;
  /** Queue listings for later AI analysis after fallback publish. */
  fallbackQueueForLaterAnalysis: boolean;
  /** Hold these category slugs for human review even in balanced mode when flagged. */
  alwaysReviewCategorySlugs: string[];
  /** Soft-suggestion regulated categories (do not hard-block publish in balanced). */
  softReviewCategorySlugs: string[];
  dailyAiBudget: number;
  monthlyAiBudget: number;
  falsePositiveMonitoring: boolean;
}

export const DEFAULT_PRODUCT_VERIFICATION_POLICY: ProductVerificationPolicy = {
  mode: "balanced",
  substantialMismatchConfidence: 0.82,
  prohibitedAiConfidence: 0.9,
  fallbackAllowLowRisk: true,
  fallbackQueueForLaterAnalysis: true,
  alwaysReviewCategorySlugs: ["vehicles", "vehicle", "cars", "motorcycles", "boats", "firearms", "weapons"],
  softReviewCategorySlugs: [
    "food",
    "grocery",
    "cosmetics",
    "beauty",
    "pharmacy",
    "health",
    "supplements",
    "toys",
  ],
  dailyAiBudget: 5000,
  monthlyAiBudget: 100000,
  falsePositiveMonitoring: true,
};

const SETTINGS_KEY = "product_verification_policy_v1";

let cache: { at: number; policy: ProductVerificationPolicy } | null = null;
const CACHE_MS = 30_000;

export function mergeProductVerificationPolicy(
  partial?: Partial<ProductVerificationPolicy> | null,
): ProductVerificationPolicy {
  return {
    ...DEFAULT_PRODUCT_VERIFICATION_POLICY,
    ...(partial || {}),
    alwaysReviewCategorySlugs:
      partial?.alwaysReviewCategorySlugs ?? DEFAULT_PRODUCT_VERIFICATION_POLICY.alwaysReviewCategorySlugs,
    softReviewCategorySlugs:
      partial?.softReviewCategorySlugs ?? DEFAULT_PRODUCT_VERIFICATION_POLICY.softReviewCategorySlugs,
  };
}

export async function getProductVerificationPolicy(): Promise<ProductVerificationPolicy> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.policy;
  try {
    const { db, platformSettingsTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    const [row] = await db
      .select()
      .from(platformSettingsTable)
      .where(eq(platformSettingsTable.key, SETTINGS_KEY))
      .limit(1);
    if (row?.value) {
      const parsed = JSON.parse(row.value) as Partial<ProductVerificationPolicy>;
      const policy = mergeProductVerificationPolicy(parsed);
      cache = { at: Date.now(), policy };
      return policy;
    }
  } catch {
    /* table missing / parse error / no DATABASE_URL — use defaults */
  }
  const policy = DEFAULT_PRODUCT_VERIFICATION_POLICY;
  cache = { at: Date.now(), policy };
  return policy;
}

export async function saveProductVerificationPolicy(
  partial: Partial<ProductVerificationPolicy>,
): Promise<ProductVerificationPolicy> {
  const current = await getProductVerificationPolicy();
  const next = mergeProductVerificationPolicy({ ...current, ...partial });
  const value = JSON.stringify(next);
  const { db, platformSettingsTable } = await import("@workspace/db");
  await db
    .insert(platformSettingsTable)
    .values({ key: SETTINGS_KEY, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: platformSettingsTable.key,
      set: { value, updatedAt: new Date() },
    });
  cache = { at: Date.now(), policy: next };
  return next;
}

export function clearProductVerificationPolicyCache() {
  cache = null;
}

/** Mandatory blocks active in every mode. */
export const MANDATORY_BLOCKS = [
  "no_valid_image",
  "missing_required_fields",
  "invalid_category_ids",
  "subcategory_parent_mismatch",
  "substantial_category_mismatch",
  "confirmed_prohibited",
] as const;

export function categorySlugInList(slug: string | null | undefined, list: string[]): boolean {
  const s = String(slug || "").toLowerCase();
  if (!s) return false;
  return list.some((x) => s === x || s.includes(x) || x.includes(s));
}
