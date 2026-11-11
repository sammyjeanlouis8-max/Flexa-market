import type { FormulaRecord, FormulaSearchHit } from "../types";
import { FORMULA_DATABASE } from "./database";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s.+^=*/()-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const STOP = new Set([
  "how", "to", "the", "a", "an", "of", "for", "and", "or", "is", "find",
  "calculate", "calc", "what", "is", "please",
  "kijan", "pou", "kalkile", "jwenn", "yon", "nan",
  "comment", "calculer", "trouver", "une", "un", "des", "la", "le", "les",
  "como", "calcular", "encontrar", "una", "el", "los", "las", "de",
]);

function tokens(q: string): string[] {
  return normalize(q)
    .split(" ")
    .filter((t) => t.length > 1 && !STOP.has(t));
}

function haystack(f: FormulaRecord): string {
  const i18n = [
    ...(f.keywordsI18n?.en ?? []),
    ...(f.keywordsI18n?.ht ?? []),
    ...(f.keywordsI18n?.fr ?? []),
    ...(f.keywordsI18n?.es ?? []),
  ];
  return normalize(
    [
      f.name,
      f.description,
      f.expression,
      f.category,
      f.subcategory,
      ...f.keywords,
      ...i18n,
      ...f.variables.map((v) => `${v.symbol} ${v.name}`),
    ].join(" "),
  );
}

/** Score a formula against a free-text / NL query (EN, HT, FR, ES). */
export function searchFormulas(
  query: string,
  opts: { category?: string; limit?: number } = {},
): FormulaSearchHit[] {
  const q = query.trim();
  const limit = opts.limit ?? 25;
  const toks = tokens(q);
  const nq = normalize(q);

  let pool = FORMULA_DATABASE;
  if (opts.category && opts.category !== "all") {
    pool = pool.filter((f) => f.category === opts.category);
  }

  if (!nq) {
    return pool.slice(0, limit).map((formula) => ({
      formula,
      score: 0,
      matchedOn: [],
    }));
  }

  const hits: FormulaSearchHit[] = [];

  for (const formula of pool) {
    const hay = haystack(formula);
    const matchedOn: string[] = [];
    let score = 0;

    if (hay.includes(nq)) {
      score += 50;
      matchedOn.push("phrase");
    }

    const nameN = normalize(formula.name);
    if (nameN === nq) {
      score += 100;
      matchedOn.push("exact-name");
    } else if (nameN.includes(nq) || nq.includes(nameN)) {
      score += 40;
      matchedOn.push("name");
    }

    const exprN = normalize(formula.expression);
    if (exprN.includes(nq) || nq.includes(exprN.replace(/\s/g, ""))) {
      score += 30;
      matchedOn.push("expression");
    }

    for (const t of toks) {
      if (hay.includes(t)) {
        score += 8;
        matchedOn.push(t);
      }
      if (normalize(formula.category).includes(t) || normalize(formula.subcategory).includes(t)) {
        score += 5;
      }
    }

    // Natural-language intent boosts
    if (/\b(kinetic|sinetik|cin[eé]tique|cinetica)\b/i.test(q) && formula.id === "phys-kinetic-energy") {
      score += 40;
    }
    if (/\b(quadratic|kwadratik|quadratique|cuadr[aá]tica)\b/i.test(q) && formula.id === "math-quadratic") {
      score += 40;
    }
    if (/\b(triangle|triyang|triángulo)\b/i.test(q) && /\b(area|aire|sip[eè]fisi|área|zòn)\b/i.test(q) && formula.id === "math-triangle-area") {
      score += 40;
    }
    if (/\b(molar|molaire|molaridad|mas\s*mol)\b/i.test(q) && formula.id.includes("chem-moles")) {
      score += 35;
    }
    if (/\b(cosine|cosinus|cosenos|kosinis)\b/i.test(q) && formula.id === "trig-law-of-cosines") {
      score += 35;
    }

    if (score > 0) {
      hits.push({ formula, score, matchedOn: [...new Set(matchedOn)] });
    }
  }

  hits.sort((a, b) => b.score - a.score || a.formula.name.localeCompare(b.formula.name));
  return hits.slice(0, limit);
}
