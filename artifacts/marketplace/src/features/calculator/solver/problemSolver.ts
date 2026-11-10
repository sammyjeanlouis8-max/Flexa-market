import type { ProblemSolveResult } from "../types";
import { evaluateExpression, evaluateWithVariables } from "../engine/evaluate";
import { getFormulaById } from "../formulas/database";
import { searchFormulas } from "../formulas/search";

/**
 * Deterministic problem solver for a verified set of patterns.
 * Does not invent solutions for unsupported problems.
 */

function parseNumbers(text: string): number[] {
  const matches = text.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi) ?? [];
  return matches.map(Number).filter((n) => Number.isFinite(n));
}

function solveQuadratic(a: number, b: number, c: number): ProblemSolveResult {
  const formula = getFormulaById("math-quadratic")!;
  const steps: Array<{ title: string; detail: string; latex?: string }> = [
    {
      title: "Identify",
      detail: `Quadratic equation ax² + bx + c = 0 with a=${a}, b=${b}, c=${c}.`,
      latex: `${a}x^{2}+(${b})x+(${c})=0`,
    },
    {
      title: "Formula",
      detail: "Use the quadratic formula.",
      latex: formula.latex,
    },
  ];

  if (a === 0) {
    return {
      ok: false,
      error: "Not a quadratic equation (a = 0).",
      suggestion: "Provide a non-zero coefficient a, or use a linear solver.",
    };
  }

  const D = b * b - 4 * a * c;
  steps.push({
    title: "Discriminant",
    detail: `D = b² − 4ac = ${D}`,
    latex: `D=${D}`,
  });

  if (D < 0) {
    const re = -b / (2 * a);
    const im = Math.sqrt(-D) / (2 * a);
    steps.push({
      title: "Complex roots",
      detail: "D < 0 ⇒ complex conjugate roots.",
    });
    return {
      ok: true,
      identified: "Quadratic equation (complex roots)",
      method: "Quadratic formula",
      formulaId: formula.id,
      formulaLatex: formula.latex,
      steps,
      result: `x = ${re} ± ${im}i`,
      explanation: "Real solutions do not exist; complex roots reported.",
    };
  }

  const sqrtD = Math.sqrt(D);
  const x1 = (-b + sqrtD) / (2 * a);
  const x2 = (-b - sqrtD) / (2 * a);
  steps.push({
    title: "Evaluate",
    detail: `x₁ = (−b + √D)/(2a), x₂ = (−b − √D)/(2a)`,
  });

  return {
    ok: true,
    identified: "Quadratic equation",
    method: "Quadratic formula",
    formulaId: formula.id,
    formulaLatex: formula.latex,
    steps,
    result: D === 0 ? `x = ${x1}` : `x₁ = ${x1}, x₂ = ${x2}`,
  };
}

function solveKinetic(m: number, v: number): ProblemSolveResult {
  const formula = getFormulaById("phys-kinetic-energy")!;
  const ev = evaluateWithVariables("0.5 * m * v^2", { m, v });
  if (!ev.ok) {
    return { ok: false, error: ev.error };
  }
  return {
    ok: true,
    identified: "Kinetic energy",
    method: "KE = ½mv²",
    formulaId: formula.id,
    formulaLatex: formula.latex,
    steps: [
      { title: "Identify", detail: "Translational kinetic energy problem." },
      { title: "Formula", detail: formula.expression, latex: formula.latex },
      { title: "Substitute", detail: `m = ${m} kg, v = ${v} m/s` },
      { title: "Compute", detail: `KE = 0.5 × ${m} × ${v}²` },
    ],
    result: `${ev.formatted} J`,
  };
}

function solveTriangleArea(b: number, h: number): ProblemSolveResult {
  const formula = getFormulaById("math-triangle-area")!;
  const ev = evaluateWithVariables("0.5 * b * h", { b, h });
  if (!ev.ok) return { ok: false, error: ev.error };
  return {
    ok: true,
    identified: "Triangle area",
    method: "A = ½bh",
    formulaId: formula.id,
    formulaLatex: formula.latex,
    steps: [
      { title: "Identify", detail: "Area of a triangle from base and height." },
      { title: "Formula", detail: formula.expression, latex: formula.latex },
      { title: "Substitute", detail: `b = ${b}, h = ${h}` },
    ],
    result: ev.formatted,
  };
}

function solvePythagorean(a: number, b: number): ProblemSolveResult {
  const formula = getFormulaById("math-pythagorean")!;
  const ev = evaluateWithVariables("sqrt(a^2 + b^2)", { a, b });
  if (!ev.ok) return { ok: false, error: ev.error };
  return {
    ok: true,
    identified: "Right-triangle hypotenuse",
    method: "Pythagorean theorem",
    formulaId: formula.id,
    formulaLatex: formula.latex,
    steps: [
      { title: "Identify", detail: "Find hypotenuse given legs a and b." },
      { title: "Formula", detail: formula.expression, latex: formula.latex },
      { title: "Substitute", detail: `a = ${a}, b = ${b}` },
    ],
    result: ev.formatted,
  };
}

function solveMoles(m: number, M: number): ProblemSolveResult {
  const formula = getFormulaById("chem-moles-from-mass")!;
  if (M === 0) {
    return { ok: false, error: "Molar mass cannot be zero." };
  }
  const ev = evaluateWithVariables("m / M", { m, M });
  if (!ev.ok) return { ok: false, error: ev.error };
  return {
    ok: true,
    identified: "Amount of substance from mass",
    method: "n = m / M",
    formulaId: formula.id,
    formulaLatex: formula.latex,
    steps: [
      { title: "Identify", detail: "Convert mass to moles using molar mass." },
      { title: "Formula", detail: formula.expression, latex: formula.latex },
      { title: "Substitute", detail: `m = ${m} g, M = ${M} g/mol` },
    ],
    result: `${ev.formatted} mol`,
  };
}

function solveOhm(I: number, R: number): ProblemSolveResult {
  const formula = getFormulaById("phys-ohms-law")!;
  const ev = evaluateWithVariables("I * R", { I, R });
  if (!ev.ok) return { ok: false, error: ev.error };
  return {
    ok: true,
    identified: "Ohm's law (voltage)",
    method: "V = IR",
    formulaId: formula.id,
    formulaLatex: formula.latex,
    steps: [
      { title: "Identify", detail: "Voltage from current and resistance." },
      { title: "Formula", detail: formula.expression, latex: formula.latex },
      { title: "Substitute", detail: `I = ${I} A, R = ${R} Ω` },
    ],
    result: `${ev.formatted} V`,
  };
}

/** Try to evaluate a raw math expression if the whole query looks like math. */
function tryDirectMath(text: string): ProblemSolveResult | null {
  const cleaned = text
    .replace(/^(calculate|compute|eval|solve|kalkile|calculer|calcular)\s+/i, "")
    .trim();
  if (!/^[0-9a-zA-ZπeE+\-*/^().,\s√∛×÷−·!%]+$/.test(cleaned)) return null;
  if (!/[+\-*/^×÷]/.test(cleaned) && !/[a-zA-Zπ√]/.test(cleaned)) return null;

  const ev = evaluateExpression(cleaned, "DEG");
  if (!ev.ok) {
    return {
      ok: false,
      error: ev.error,
      suggestion: "Check parentheses, operators, and domain (e.g. √ of negative).",
    };
  }
  return {
    ok: true,
    identified: "Arithmetic / scientific expression",
    method: "Direct evaluation (math.js)",
    steps: [
      { title: "Parse", detail: cleaned },
      { title: "Evaluate", detail: "Deterministic math.js AST evaluation (no eval)." },
    ],
    result: ev.formatted,
  };
}

export function solveProblem(text: string): ProblemSolveResult {
  const raw = text.trim();
  if (!raw) {
    return {
      ok: false,
      error: "Enter a mathematical, physics, or chemistry problem.",
      suggestion: "Examples: solve 2x^2 - 3x - 2 = 0; kinetic energy m=2 v=3; area of triangle base 10 height 4",
    };
  }

  // Quadratic: ax^2 + bx + c = 0
  const quad =
    raw.match(
      /(-?\d+(?:\.\d+)?)\s*\*?\s*x\s*\^\s*2\s*([+-]\s*\d+(?:\.\d+)?)\s*\*?\s*x\s*([+-]\s*\d+(?:\.\d+)?)\s*=\s*0/i,
    ) ||
    raw.match(
      /(-?\d+(?:\.\d+)?)x\^2\s*([+-]\d+(?:\.\d+)?)x\s*([+-]\d+(?:\.\d+)?)\s*=\s*0/i,
    );
  if (quad) {
    const a = Number(quad[1].replace(/\s/g, ""));
    const b = Number(quad[2].replace(/\s/g, ""));
    const c = Number(quad[3].replace(/\s/g, ""));
    return solveQuadratic(a, b, c);
  }

  const lower = raw.toLowerCase();
  const nums = parseNumbers(raw);

  if (/\b(kinetic|sinetik|cin[eé]tique|cin[eé]tica)\b/i.test(raw) && nums.length >= 2) {
    return solveKinetic(nums[0], nums[1]);
  }

  if (
    /\b(triangle|triyang|triángulo)\b/i.test(raw) &&
    /\b(area|aire|sip[eè]fisi|área|zòn)\b/i.test(raw) &&
    nums.length >= 2
  ) {
    return solveTriangleArea(nums[0], nums[1]);
  }

  if (/\b(pythagoras|pythagorean|pitag[oó]r|hypotenuse|ipotenis)\b/i.test(raw) && nums.length >= 2) {
    return solvePythagorean(nums[0], nums[1]);
  }

  if (/\b(molar|moles|mòl|moles?\s+from\s+mass|masse\s+molaire)\b/i.test(raw) && nums.length >= 2) {
    return solveMoles(nums[0], nums[1]);
  }

  if (/\b(ohm|voltage|voltaj|tension)\b/i.test(raw) && nums.length >= 2) {
    return solveOhm(nums[0], nums[1]);
  }

  // Quadratic with a,b,c named
  const abc = lower.match(/a\s*=\s*(-?\d+(?:\.\d+)?).*b\s*=\s*(-?\d+(?:\.\d+)?).*c\s*=\s*(-?\d+(?:\.\d+)?)/);
  if (abc && /\b(quadratic|kwadratik|quadratique|cuadr[aá]tica)\b/i.test(raw)) {
    return solveQuadratic(Number(abc[1]), Number(abc[2]), Number(abc[3]));
  }

  const direct = tryDirectMath(raw);
  if (direct) return direct;

  // Fall back: suggest matching formulas without fabricating a numeric answer
  const hits = searchFormulas(raw, { limit: 3 });
  if (hits.length > 0) {
    const top = hits[0].formula;
    return {
      ok: false,
      error: "No verified automatic solver for this problem wording.",
      suggestion: `Closest verified formula: “${top.name}” (${top.id}). Open Formulas, enter variables, and calculate — or rephrase like “kinetic energy m=2 v=3”.`,
    };
  }

  return {
    ok: false,
    error: "Unsupported problem. This solver covers verified patterns only.",
    suggestion:
      "Supported examples: quadratic equations, kinetic energy, triangle area, Pythagorean theorem, moles from mass, Ohm's law, and direct math expressions.",
  };
}
