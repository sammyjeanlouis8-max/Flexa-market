export type CalculatorMode = "normal" | "scientific" | "graph" | "formulas";

export type AngleMode = "DEG" | "RAD";

export interface EvalSuccess {
  ok: true;
  value: number | string;
  formatted: string;
  latex?: string;
}

export interface EvalFailure {
  ok: false;
  error: string;
  code:
    | "empty"
    | "syntax"
    | "domain"
    | "div_zero"
    | "overflow"
    | "unsupported"
    | "unknown";
}

export type EvalResult = EvalSuccess | EvalFailure;

export interface HistoryEntry {
  id: string;
  expression: string;
  result: string;
  at: number;
}

export type FormulaCategory =
  | "mathematics"
  | "physics"
  | "chemistry"
  | "engineering"
  | "trigonometry"
  | "statistics"
  | "probability";

export type FormulaSubcategory = string;

export interface FormulaVariable {
  symbol: string;
  name: string;
  unit?: string;
  description?: string;
}

export interface FormulaRecord {
  id: string;
  name: string;
  category: FormulaCategory;
  subcategory: FormulaSubcategory;
  expression: string;
  latex: string;
  description: string;
  variables: FormulaVariable[];
  units?: string;
  conditions?: string;
  example: {
    inputs: Record<string, number>;
    result: string;
    note?: string;
  };
  /** Authoritative reference label (textbook / standard). */
  reference: string;
  keywords: string[];
  /** Multilingual search terms: en / ht / fr / es */
  keywordsI18n?: {
    en?: string[];
    ht?: string[];
    fr?: string[];
    es?: string[];
  };
  /** math.js-compatible compute expression using variable symbols */
  compute?: string;
}

export interface FormulaSearchHit {
  formula: FormulaRecord;
  score: number;
  matchedOn: string[];
}

export interface ProblemSolveRequest {
  text: string;
}

export interface ProblemSolveStep {
  title: string;
  detail: string;
  latex?: string;
}

export interface ProblemSolveSuccess {
  ok: true;
  identified: string;
  method: string;
  formulaId?: string;
  formulaLatex?: string;
  steps: ProblemSolveStep[];
  result: string;
  explanation?: string;
}

export interface ProblemSolveFailure {
  ok: false;
  error: string;
  suggestion?: string;
}

export type ProblemSolveResult = ProblemSolveSuccess | ProblemSolveFailure;

export interface GraphViewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface GraphAnalysis {
  zeros: number[];
  yIntercept: number | null;
  localMax: Array<{ x: number; y: number }>;
  localMin: Array<{ x: number; y: number }>;
  periodHint: string | null;
  derivativeAt?: { x: number; dy: number };
  integralApprox?: { from: number; to: number; value: number };
}
