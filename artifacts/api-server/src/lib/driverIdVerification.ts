/**
 * Haiti motorcycle driver — identity document name matching & verification decisions.
 *
 * Never auto-rejects for minor spelling differences.
 * Uncertain / significant mismatches → pending human review or needs_correction.
 */

export type DriverVerificationOutcome =
  | "pending_review"
  | "needs_correction"
  | "clear_for_review";

export type DocQualityFlag =
  | "blurry"
  | "unreadable"
  | "incomplete"
  | "name_mismatch"
  | "minor_name_diff"
  | "missing_document"
  | "ai_unavailable";

export interface NameCompareResult {
  score: number; // 0–1
  exact: boolean;
  minorDiff: boolean;
  significantMismatch: boolean;
}

export interface VerificationDecisionInput {
  registeredFullName: string;
  cinExtractedName?: string | null;
  licenseExtractedName?: string | null;
  cinQuality?: DocQualityFlag[];
  licenseQuality?: DocQualityFlag[];
  aiAvailable: boolean;
}

export interface VerificationDecision {
  outcome: DriverVerificationOutcome;
  flags: DocQualityFlag[];
  cinMatch: NameCompareResult | null;
  licenseMatch: NameCompareResult | null;
  crossDocMatch: NameCompareResult | null;
  summary: string;
  /** Safe for audit/admin UI — no raw document pixels or full OCR dumps. */
  adminNotes: string[];
}

/** Strip accents, punctuation, collapse whitespace, lowercase. */
export function normalizePersonName(raw: string): string {
  return String(raw ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(name: string): string[] {
  return normalizePersonName(name).split(" ").filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i - 1;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + cost);
      prev = cur;
    }
  }
  return row[b.length];
}

function tokenSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (!maxLen) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Fuzzy person-name compare.
 * - Exact normalized match → score 1
 * - Token-level soft match tolerates accents/order/minor typos
 * - significantMismatch only when score < 0.55
 * - minorDiff when 0.55 ≤ score < 0.92
 */
export function comparePersonNames(a: string, b: string): NameCompareResult {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) {
    return { score: 0, exact: false, minorDiff: false, significantMismatch: true };
  }
  if (na === nb) {
    return { score: 1, exact: true, minorDiff: false, significantMismatch: false };
  }

  const ta = tokens(a);
  const tb = tokens(b);
  // Greedy best-token pairing
  const used = new Set<number>();
  let sum = 0;
  let paired = 0;
  for (const tokenA of ta) {
    let best = 0;
    let bestIdx = -1;
    for (let i = 0; i < tb.length; i++) {
      if (used.has(i)) continue;
      const s = tokenSimilarity(tokenA, tb[i]);
      if (s > best) { best = s; bestIdx = i; }
    }
    if (bestIdx >= 0 && best >= 0.7) {
      used.add(bestIdx);
      sum += best;
      paired++;
    }
  }
  const denom = Math.max(ta.length, tb.length);
  const score = denom === 0 ? 0 : sum / denom;

  return {
    score,
    exact: false,
    minorDiff: score >= 0.55 && score < 0.92,
    significantMismatch: score < 0.55,
  };
}

export function decideDriverVerification(input: VerificationDecisionInput): VerificationDecision {
  const flags: DocQualityFlag[] = [];
  const adminNotes: string[] = [];

  if (!input.aiAvailable) {
    flags.push("ai_unavailable");
    adminNotes.push("AI verification unavailable — queued for human review.");
    return {
      outcome: "pending_review",
      flags,
      cinMatch: null,
      licenseMatch: null,
      crossDocMatch: null,
      summary: "AI unavailable; pending human review.",
      adminNotes,
    };
  }

  for (const f of input.cinQuality ?? []) flags.push(f);
  for (const f of input.licenseQuality ?? []) flags.push(f);

  const qualityHard = flags.some((f) => f === "blurry" || f === "unreadable" || f === "incomplete" || f === "missing_document");
  if (qualityHard) {
    adminNotes.push("Document quality issue detected — request clearer photos.");
    return {
      outcome: "needs_correction",
      flags: [...new Set(flags)],
      cinMatch: null,
      licenseMatch: null,
      crossDocMatch: null,
      summary: "Document quality insufficient; needs correction.",
      adminNotes,
    };
  }

  const cinMatch = input.cinExtractedName
    ? comparePersonNames(input.registeredFullName, input.cinExtractedName)
    : null;
  const licenseMatch = input.licenseExtractedName
    ? comparePersonNames(input.registeredFullName, input.licenseExtractedName)
    : null;
  const crossDocMatch =
    input.cinExtractedName && input.licenseExtractedName
      ? comparePersonNames(input.cinExtractedName, input.licenseExtractedName)
      : null;

  if (cinMatch?.minorDiff) flags.push("minor_name_diff");
  if (licenseMatch?.minorDiff) flags.push("minor_name_diff");
  if (cinMatch?.significantMismatch || licenseMatch?.significantMismatch || crossDocMatch?.significantMismatch) {
    flags.push("name_mismatch");
  }

  // Significant mismatches → human review (never auto-reject)
  if (cinMatch?.significantMismatch || licenseMatch?.significantMismatch || crossDocMatch?.significantMismatch) {
    adminNotes.push("Significant name mismatch between registration and/or documents — human review required.");
    return {
      outcome: "pending_review",
      flags: [...new Set(flags)],
      cinMatch,
      licenseMatch,
      crossDocMatch,
      summary: "Name mismatch flagged for human review.",
      adminNotes,
    };
  }

  // Minor diffs are OK — still send to human review for final approval
  if (cinMatch?.minorDiff || licenseMatch?.minorDiff || crossDocMatch?.minorDiff) {
    adminNotes.push("Minor spelling/accent differences tolerated; final approval still requires an administrator.");
  } else {
    adminNotes.push("Names appear consistent; awaiting administrator final approval.");
  }

  return {
    outcome: "clear_for_review",
    flags: [...new Set(flags)],
    cinMatch,
    licenseMatch,
    crossDocMatch,
    summary: "AI checks passed; pending human review.",
    adminNotes,
  };
}

/** Map decision outcome → application status (admin alone can approve/reject). */
export function outcomeToApplicationStatus(outcome: DriverVerificationOutcome): string {
  switch (outcome) {
    case "needs_correction":
      return "needs_correction";
    case "clear_for_review":
    case "pending_review":
    default:
      return "pending_review";
  }
}

/** Normalize legacy + enterprise statuses for filters/UI. */
export function canonicalizeDriverAppStatus(status: string): string {
  const s = String(status || "").toLowerCase();
  if (s === "pending") return "pending_review";
  if (s === "needs_changes") return "needs_correction";
  return s;
}

export const DRIVER_APP_STATUSES = [
  "draft",
  "submitted",
  "ai_processing",
  "needs_correction",
  "pending_review",
  "approved",
  "rejected",
  "suspended",
] as const;

export type DriverAppStatus = (typeof DRIVER_APP_STATUSES)[number];
