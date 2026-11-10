import { useMemo, useState } from "react";
import { Mic, Search } from "lucide-react";
import { FORMULA_DATABASE, FORMULA_COUNT } from "../formulas/database";
import { searchFormulas } from "../formulas/search";
import { evaluateWithVariables } from "../engine/evaluate";
import { solveProblem } from "../solver/problemSolver";
import type { FormulaCategory, FormulaRecord, ProblemSolveResult } from "../types";
import { MathDisplay } from "./MathDisplay";

const FILTERS: { id: "all" | FormulaCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "mathematics", label: "Mathematics" },
  { id: "physics", label: "Physics" },
  { id: "chemistry", label: "Chemistry" },
  { id: "trigonometry", label: "Trigonometry" },
  { id: "statistics", label: "Statistics" },
  { id: "probability", label: "Probability" },
  { id: "engineering", label: "Engineering" },
];

const CATEGORY_META: Array<{
  id: FormulaCategory;
  title: string;
  color: string;
  topics: string;
}> = [
  {
    id: "mathematics",
    title: "Mathematics",
    color: "#8b5cf6",
    topics: "Algebra, Geometry, Calculus, Linear algebra…",
  },
  {
    id: "physics",
    title: "Physics",
    color: "#f97316",
    topics: "Motion, Forces, Energy, Electricity…",
  },
  {
    id: "chemistry",
    title: "Chemistry",
    color: "#3b82f6",
    topics: "Stoichiometry, Gas Laws, Equilibrium…",
  },
  {
    id: "trigonometry",
    title: "Trigonometry",
    color: "#22c55e",
    topics: "Identities, Formulas, Solving Triangles",
  },
  {
    id: "statistics",
    title: "Statistics & Probability",
    color: "#ec4899",
    topics: "Mean, Variance, Distributions",
  },
  {
    id: "engineering",
    title: "Engineering",
    color: "#38bdf8",
    topics: "Mechanics, Materials, Fluid Dynamics",
  },
];

export function FormulasMode() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | FormulaCategory>("all");
  const [selected, setSelected] = useState<FormulaRecord | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [calcOut, setCalcOut] = useState<string | null>(null);
  const [solverText, setSolverText] = useState("");
  const [solverResult, setSolverResult] = useState<ProblemSolveResult | null>(null);

  const hits = useMemo(
    () => searchFormulas(query, { category: filter, limit: 40 }),
    [query, filter],
  );

  const popular = FORMULA_DATABASE.find((f) => f.id === "math-quadratic")!;

  const openFormula = (f: FormulaRecord) => {
    setSelected(f);
    const init: Record<string, string> = {};
    for (const [k, v] of Object.entries(f.example.inputs)) {
      init[k] = String(v);
    }
    setInputs(init);
    setCalcOut(null);
  };

  const runCalculate = () => {
    if (!selected?.compute) {
      setCalcOut("This formula is reference-only (no numeric compute expression).");
      return;
    }
    const vars: Record<string, number> = {};
    for (const v of selected.variables) {
      const raw = inputs[v.symbol];
      const n = Number(raw);
      if (!Number.isFinite(n)) {
        setCalcOut(`Invalid value for ${v.symbol}`);
        return;
      }
      vars[v.symbol] = n;
    }
    // Also allow example keys that may differ slightly
    for (const [k, raw] of Object.entries(inputs)) {
      const n = Number(raw);
      if (Number.isFinite(n)) vars[k] = n;
    }
    const ev = evaluateWithVariables(selected.compute, vars);
    setCalcOut(ev.ok ? ev.formatted : ev.error);
  };

  const runSolver = () => {
    setSolverResult(solveProblem(solverText));
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-3">
      {/* Search */}
      <div
        className="flex items-center gap-2 rounded-full px-3 py-2.5"
        style={{ background: "#1a1a1a", border: "1px solid #2e2e2e" }}
      >
        <Search className="w-4 h-4 text-[#888] flex-shrink-0" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search formulas (e.g., quadratic, kinetic energy)"
          className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-[#666]"
          aria-label="Search formulas"
        />
        <Mic className="w-4 h-4 text-[#666] flex-shrink-0" aria-hidden />
      </div>

      {/* Filters */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className="flex-shrink-0 px-3 py-1 rounded-full text-xs font-semibold"
              style={{
                background: active ? "#39ff14" : "#1a1a1a",
                color: active ? "#000" : "#bbb",
                border: active ? "1px solid #39ff14" : "1px solid #2a2a2a",
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Problem solver */}
      <div
        className="rounded-xl p-3 space-y-2"
        style={{ background: "#121212", border: "1px solid #2a2a2a" }}
      >
        <div className="text-sm font-semibold text-white">Problem Solver</div>
        <p className="text-[11px]" style={{ color: "#777" }}>
          Verified solvers only — math / select physics & chemistry. EN · HT · FR · ES search.
        </p>
        <textarea
          value={solverText}
          onChange={(e) => setSolverText(e.target.value)}
          rows={2}
          placeholder='e.g. "How to calculate kinetic energy? m=2 v=3" or "2x^2-3x-2=0"'
          className="w-full rounded-lg px-3 py-2 text-sm bg-[#1a1a1a] border border-[#333] text-white outline-none"
        />
        <button
          type="button"
          onClick={runSolver}
          className="w-full py-2 rounded-lg text-sm font-semibold"
          style={{ background: "#39ff14", color: "#000" }}
        >
          Solve
        </button>
        {solverResult && (
          <div className="text-xs space-y-1 pt-1" style={{ color: "#ccc" }}>
            {solverResult.ok ? (
              <>
                <div>
                  <span style={{ color: "#888" }}>Identified: </span>
                  {solverResult.identified}
                </div>
                <div>
                  <span style={{ color: "#888" }}>Method: </span>
                  {solverResult.method}
                </div>
                {solverResult.formulaLatex && (
                  <div className="py-1 overflow-x-auto">
                    <MathDisplay latex={solverResult.formulaLatex} />
                  </div>
                )}
                {solverResult.steps.map((s, i) => (
                  <div key={i}>
                    <strong style={{ color: "#39ff14" }}>{s.title}:</strong> {s.detail}
                  </div>
                ))}
                <div className="text-base font-bold text-[#39ff14] pt-1">
                  Result: {solverResult.result}
                </div>
              </>
            ) : (
              <>
                <div style={{ color: "#f87171" }}>{solverResult.error}</div>
                {solverResult.suggestion && (
                  <div style={{ color: "#aaa" }}>{solverResult.suggestion}</div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Browse / results */}
      {!query && filter === "all" && !selected && (
        <>
          <div className="text-sm font-semibold text-white">
            Formula Library{" "}
            <span style={{ color: "#666", fontWeight: 400 }}>
              ({FORMULA_COUNT} verified)
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {CATEGORY_META.map((c) => {
              const count = FORMULA_DATABASE.filter((f) => f.category === c.id).length
                + (c.id === "statistics"
                  ? FORMULA_DATABASE.filter((f) => f.category === "probability").length
                  : 0);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setFilter(c.id === "statistics" ? "statistics" : c.id)}
                  className="flex items-center gap-3 rounded-xl px-3 py-3 text-left"
                  style={{ background: "#141414", border: "1px solid #242424" }}
                >
                  <div
                    className="w-10 h-10 rounded-lg flex-shrink-0"
                    style={{ background: c.color }}
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white">{c.title}</div>
                    <div className="text-[11px] truncate" style={{ color: "#888" }}>
                      {c.topics} · {count} formulas
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div
            className="rounded-xl p-3"
            style={{ background: "#132a13", border: "1px solid #1f4d1f" }}
          >
            <div className="text-xs font-semibold mb-1" style={{ color: "#39ff14" }}>
              Popular Formulas
            </div>
            <button type="button" onClick={() => openFormula(popular)} className="text-left w-full">
              <div className="text-sm text-white font-medium">{popular.name}</div>
              <div className="mt-1 overflow-x-auto">
                <MathDisplay latex={popular.latex} />
              </div>
            </button>
          </div>
        </>
      )}

      {(query || filter !== "all") && !selected && (
        <div className="flex flex-col gap-2">
          <div className="text-xs" style={{ color: "#888" }}>
            {hits.length} result{hits.length === 1 ? "" : "s"}
          </div>
          {hits.map((h) => (
            <button
              key={h.formula.id}
              type="button"
              onClick={() => openFormula(h.formula)}
              className="rounded-xl px-3 py-3 text-left"
              style={{ background: "#141414", border: "1px solid #242424" }}
            >
              <div className="text-sm font-semibold text-white">{h.formula.name}</div>
              <div className="text-[11px]" style={{ color: "#888" }}>
                {h.formula.category} · {h.formula.subcategory}
              </div>
              <div className="text-xs mt-1 font-mono" style={{ color: "#aaa" }}>
                {h.formula.expression}
              </div>
            </button>
          ))}
          {hits.length === 0 && (
            <p className="text-sm" style={{ color: "#888" }}>
              No matching verified formulas. Try another keyword or browse categories.
            </p>
          )}
        </div>
      )}

      {selected && (
        <div
          className="rounded-xl p-3 space-y-3"
          style={{ background: "#141414", border: "1px solid #2a2a2a" }}
        >
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="text-xs"
            style={{ color: "#39ff14" }}
          >
            ← Back
          </button>
          <div className="text-lg font-semibold text-white">{selected.name}</div>
          <div className="overflow-x-auto py-1">
            <MathDisplay latex={selected.latex} displayMode />
          </div>
          <p className="text-sm" style={{ color: "#bbb" }}>
            {selected.description}
          </p>
          {selected.conditions && (
            <p className="text-xs" style={{ color: "#f59e0b" }}>
              Conditions: {selected.conditions}
            </p>
          )}
          <div className="text-xs space-y-1">
            <div className="font-semibold text-white">Variables</div>
            {selected.variables.map((v) => (
              <div key={v.symbol} className="flex items-center gap-2">
                <label className="w-16 font-mono text-[#39ff14]">{v.symbol}</label>
                <input
                  value={inputs[v.symbol] ?? ""}
                  onChange={(e) =>
                    setInputs((prev) => ({ ...prev, [v.symbol]: e.target.value }))
                  }
                  className="flex-1 rounded-lg px-2 py-1.5 bg-[#1a1a1a] border border-[#333] text-white text-sm"
                  aria-label={v.name}
                />
                <span style={{ color: "#666" }}>{v.unit ?? ""}</span>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={runCalculate}
            className="w-full py-2.5 rounded-lg font-semibold text-sm"
            style={{ background: "#39ff14", color: "#000" }}
          >
            Calculate
          </button>
          {calcOut && (
            <div className="text-center text-lg font-bold text-[#39ff14]">{calcOut}</div>
          )}
          <div className="text-xs" style={{ color: "#888" }}>
            <div>
              <strong>Example:</strong> {selected.example.result}
              {selected.example.note ? ` — ${selected.example.note}` : ""}
            </div>
            <div className="mt-1">
              <strong>Reference:</strong> {selected.reference}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
