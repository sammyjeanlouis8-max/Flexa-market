/**
 * Deterministic math evaluation via math.js — never uses eval() / Function().
 */
import {
  all,
  create,
  type MathJsInstance,
  type MathNode,
} from "mathjs";
import type { AngleMode, EvalResult } from "../types";

const math: MathJsInstance = create(all, {
  number: "number",
  precision: 64,
});

/** Combinations / permutations helpers for scientific mode. */
math.import(
  {
    nCr: (n: number, r: number) => {
      if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) {
        throw new Error("nCr domain error");
      }
      return Number(math.combinations(n, r));
    },
    nPr: (n: number, r: number) => {
      if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n) {
        throw new Error("nPr domain error");
      }
      return Number(math.permutations(n, r));
    },
    /** Standard normal PDF φ(x) when μ/σ omitted; otherwise N(μ,σ²). */
    normalpdf: (x: number, mu = 0, sigma = 1) => {
      if (!(sigma > 0)) throw new Error("sigma must be > 0");
      const z = (x - mu) / sigma;
      return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
    },
    /** Approximate standard normal CDF via erf. */
    normalcdf: (x: number, mu = 0, sigma = 1) => {
      if (!(sigma > 0)) throw new Error("sigma must be > 0");
      const z = (x - mu) / (sigma * Math.SQRT2);
      return 0.5 * (1 + Number(math.erf(z)));
    },
  },
  { override: true },
);

const DISPLAY_OPS: Record<string, string> = {
  "×": "*",
  "÷": "/",
  "−": "-",
  "·": "*",
  "π": "pi",
  "√": "sqrt",
  "∛": "cbrt",
  "²": "^2",
  "³": "^3",
  "sin⁻¹": "asin",
  "cos⁻¹": "acos",
  "tan⁻¹": "atan",
  "×10^": "*10^",
};

/** Normalize UI expression tokens into math.js syntax. */
export function normalizeExpression(raw: string, angle: AngleMode): string {
  let s = raw.trim();
  if (!s) return "";

  for (const [from, to] of Object.entries(DISPLAY_OPS)) {
    s = s.split(from).join(to);
  }

  // Percent: 50% → (50/100)
  s = s.replace(/(\d+(?:\.\d+)?)%/g, "($1/100)");

  // Implicit multiplication: 2pi, 3(, )(
  // Do NOT turn log10(x) into log10*(x) — only insert * when the number
  // is not part of an alphanumeric identifier.
  s = s.replace(/(\d)(pi|e|i)\b/gi, "$1*$2");
  s = s.replace(/(?<![A-Za-z0-9_.])(\d+(?:\.\d+)?)\(/g, "$1*(");
  s = s.replace(/\)(\d)/g, ")*$1");
  s = s.replace(/\)\(/g, ")*(");
  s = s.replace(/\)(pi|e|i|[a-zA-Z])/g, ")*$1");

  // Factorial postfix → factorial()
  s = s.replace(/(\d+(?:\.\d+)?)!/g, "factorial($1)");
  s = s.replace(/\)!/g, ")"); // handled via rewrite below if needed

  if (angle === "DEG") {
    // Map trig to degree-aware helpers (same arity — no extra parens).
    s = s
      .replace(/\basin\s*\(/g, "__asind(")
      .replace(/\bacos\s*\(/g, "__acosd(")
      .replace(/\batan\s*\(/g, "__atand(")
      .replace(/\bsin\s*\(/g, "__sind(")
      .replace(/\bcos\s*\(/g, "__cosd(")
      .replace(/\btan\s*\(/g, "__tand(");
  }

  return s;
}

const DEG_SCOPE = {
  __sind: (x: number) => Math.sin((x * Math.PI) / 180),
  __cosd: (x: number) => Math.cos((x * Math.PI) / 180),
  __tand: (x: number) => Math.tan((x * Math.PI) / 180),
  __asind: (x: number) => (Math.asin(x) * 180) / Math.PI,
  __acosd: (x: number) => (Math.acos(x) * 180) / Math.PI,
  __atand: (x: number) => (Math.atan(x) * 180) / Math.PI,
  degToRad: (x: number) => (x * Math.PI) / 180,
  radToDeg: (x: number) => (x * 180) / Math.PI,
};

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) {
    return Number.isNaN(value) ? "Undef" : "∞";
  }
  const abs = Math.abs(value);
  if (abs === 0) return "0";
  if (abs >= 1e10 || (abs < 1e-4 && abs > 0)) {
    return value.toExponential(6).replace(/\.?0+e/, "e");
  }
  // Trim floating noise
  const rounded = Number.parseFloat(value.toPrecision(12));
  return rounded.toLocaleString("en-US", { maximumFractionDigits: 10 });
}

function classifyError(message: string): EvalResult {
  const m = message.toLowerCase();
  if (m.includes("divide by zero") || m.includes("division by zero")) {
    return { ok: false, error: "Division by zero", code: "div_zero" };
  }
  if (
    m.includes("undefined") ||
    m.includes("domain") ||
    m.includes("complex") ||
    m.includes("negative")
  ) {
    return { ok: false, error: message, code: "domain" };
  }
  if (m.includes("overflow") || m.includes("too large")) {
    return { ok: false, error: message, code: "overflow" };
  }
  if (m.includes("syntax") || m.includes("unexpected") || m.includes("parenthesis")) {
    return { ok: false, error: message, code: "syntax" };
  }
  return { ok: false, error: message || "Evaluation failed", code: "unknown" };
}

export function evaluateExpression(
  raw: string,
  angle: AngleMode = "DEG",
  scope: Record<string, unknown> = {},
): EvalResult {
  if (!raw || !raw.trim()) {
    return { ok: false, error: "Empty expression", code: "empty" };
  }

  try {
    const normalized = normalizeExpression(raw, angle);
    if (!normalized) {
      return { ok: false, error: "Empty expression", code: "empty" };
    }

    // Parse first — rejects arbitrary code; only math.js AST is evaluated.
    let node: MathNode;
    try {
      node = math.parse(normalized);
    } catch (err) {
      return classifyError(err instanceof Error ? err.message : String(err));
    }

    const mergedScope = {
      ...DEG_SCOPE,
      ans: scope.ans ?? 0,
      ...scope,
    };

    const result = node.evaluate(mergedScope);

    if (result == null) {
      return { ok: false, error: "No result", code: "unknown" };
    }

    // Complex numbers
    if (math.isComplex(result)) {
      const c = result as { re: number; im: number; toString: () => string };
      if (Math.abs(c.im) < 1e-12) {
        const n = c.re;
        return { ok: true, value: n, formatted: formatNumber(n) };
      }
      return {
        ok: true,
        value: c.toString(),
        formatted: c.toString(),
      };
    }

    if (math.isMatrix(result) || Array.isArray(result)) {
      const formatted = math.format(result, { precision: 10 });
      return { ok: true, value: formatted, formatted };
    }

    if (typeof result === "bigint") {
      const n = Number(result);
      return { ok: true, value: n, formatted: formatNumber(n) };
    }

    if (typeof result === "boolean") {
      return { ok: true, value: result ? 1 : 0, formatted: result ? "1" : "0" };
    }

    if (typeof result === "number") {
      if (Number.isNaN(result)) {
        return { ok: false, error: "Undefined result", code: "domain" };
      }
      if (!Number.isFinite(result)) {
        // math.js returns ±Infinity for divide-by-zero rather than throwing.
        if (/\/|÷/.test(raw) && /\/\s*0(?!\d)|÷\s*0(?!\d)/.test(raw.replace(/\s/g, ""))) {
          return { ok: false, error: "Division by zero", code: "div_zero" };
        }
        return { ok: false, error: "Overflow / infinity", code: "overflow" };
      }
      return { ok: true, value: result, formatted: formatNumber(result) };
    }

    // Unit / Fraction / other math.js types
    const formatted = math.format(result, { precision: 12 });
    return { ok: true, value: formatted, formatted };
  } catch (err) {
    return classifyError(err instanceof Error ? err.message : String(err));
  }
}

/** Compile f(x) for graphing — returns a safe numeric function or null. */
export function compileFunction(
  expr: string,
  angle: AngleMode = "RAD",
): ((x: number) => number) | null {
  try {
    const normalized = normalizeExpression(expr, angle);
    const node = math.parse(normalized);
    const code = node.compile();
    return (x: number) => {
      try {
        const v = code.evaluate({
          ...DEG_SCOPE,
          x,
          X: x,
        });
        if (typeof v === "number" && Number.isFinite(v)) return v;
        if (math.isComplex(v)) {
          const c = v as { re: number; im: number };
          if (Math.abs(c.im) < 1e-10) return c.re;
        }
        return NaN;
      } catch {
        return NaN;
      }
    };
  } catch {
    return null;
  }
}

export function evaluateWithVariables(
  computeExpr: string,
  variables: Record<string, number>,
): EvalResult {
  try {
    const node = math.parse(computeExpr);
    const result = node.evaluate({ ...DEG_SCOPE, ...variables });
    if (typeof result === "number") {
      if (!Number.isFinite(result)) {
        return {
          ok: false,
          error: Number.isNaN(result) ? "Undefined" : "Overflow",
          code: Number.isNaN(result) ? "domain" : "overflow",
        };
      }
      return { ok: true, value: result, formatted: formatNumber(result) };
    }
    const formatted = math.format(result, { precision: 12 });
    return { ok: true, value: formatted, formatted };
  } catch (err) {
    return classifyError(err instanceof Error ? err.message : String(err));
  }
}

export { math };
