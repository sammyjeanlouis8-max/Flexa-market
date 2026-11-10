import { useCallback, useMemo, useState } from "react";
import { evaluateExpression, math } from "../engine/evaluate";
import type { AngleMode, HistoryEntry } from "../types";
import { MathDisplay } from "./MathDisplay";

/**
 * TI-84–style Pro scientific pad with natural-notation history display.
 * Matches the Flexa Market advanced scientific reference.
 */

interface SciKey {
  label: string;
  second?: string;
  alpha?: string;
  insert?: string;
  secondInsert?: string;
  alphaInsert?: string;
  action?: string;
  tone?: "blue" | "green" | "dark" | "white" | "enter" | "num" | "op" | "soft";
}

const TOP: SciKey[] = [
  { label: "Y=", second: "STAT PLOT", action: "Y=" },
  { label: "WINDOW", second: "TBLSET", action: "WINDOW" },
  { label: "ZOOM", second: "FORMAT", action: "ZOOM" },
  { label: "TRACE", second: "CALC", action: "TRACE" },
  { label: "GRAPH", second: "TABLE", action: "GRAPH" },
];

/** Rows below the soft-key / d-pad cluster */
const GRID: SciKey[][] = [
  [
    { label: "2nd", action: "2ND", tone: "blue" },
    { label: "MODE", second: "QUIT", action: "MODE" },
    { label: "DEL", second: "INS", action: "DEL" },
    { label: "ALPHA", action: "ALPHA", tone: "green" },
    { label: "X,T,θ,n", second: "LINK", insert: "x", alphaInsert: "A" },
  ],
  [
    { label: "STAT", second: "LIST", insert: "mean(", secondInsert: "std(" },
    { label: "MATH", second: "TEST", insert: "nCr(", secondInsert: "nPr(" },
    { label: "APPS", second: "ANGLE", insert: "normalpdf(" },
    { label: "PRGM", second: "DRAW", insert: "solve(" },
    { label: "VARS", second: "DISTR", insert: "ans", secondInsert: "normalcdf(" },
  ],
  [
    { label: "CLEAR", second: "CLEARALL", action: "CLEAR" },
    { label: "x⁻¹", second: "ᴇᴇ", insert: "^(-1)", secondInsert: "*10^" },
    { label: "SIN", second: "SIN⁻¹", insert: "sin(", secondInsert: "asin(" },
    { label: "COS", second: "COS⁻¹", insert: "cos(", secondInsert: "acos(" },
    { label: "TAN", second: "TAN⁻¹", insert: "tan(", secondInsert: "atan(" },
  ],
  [
    { label: "^", second: "π", insert: "^", secondInsert: "π", alpha: "H" },
    { label: "x²", second: "√", insert: "^2", secondInsert: "sqrt(" },
    { label: ",", second: "ᴇ", insert: ",", secondInsert: "*10^" },
    { label: "(", second: "{", insert: "(", secondInsert: "{" },
    { label: ")", second: "}", insert: ")", secondInsert: "}" },
  ],
  [
    { label: "LOG", second: "10ˣ", insert: "log10(", secondInsert: "10^(" },
    { label: "LN", second: "eˣ", insert: "log(", secondInsert: "exp(" },
    { label: "7", insert: "7", tone: "num", alpha: "O" },
    { label: "8", insert: "8", tone: "num", alpha: "P" },
    { label: "9", insert: "9", tone: "num", alpha: "Q" },
  ],
  [
    { label: "STO→", second: "RCL", action: "STO" },
    { label: "ON", action: "CLEAR", tone: "soft" },
    { label: "4", insert: "4", tone: "num", alpha: "L" },
    { label: "5", insert: "5", tone: "num", alpha: "M" },
    { label: "6", insert: "6", tone: "num", alpha: "N" },
  ],
  [
    { label: "−", insert: "−", tone: "op" },
    { label: "÷", insert: "÷", tone: "op" },
    { label: "1", insert: "1", tone: "num", alpha: "I" },
    { label: "2", insert: "2", tone: "num", alpha: "J" },
    { label: "3", insert: "3", tone: "num", alpha: "K" },
  ],
  [
    { label: "+", insert: "+", tone: "op" },
    { label: "×", insert: "×", tone: "op" },
    { label: "0", insert: "0", tone: "num", alpha: " " },
    { label: ".", insert: ".", tone: "num", alpha: ":" },
    { label: "(−)", action: "NEG", tone: "num" },
  ],
  [
    { label: "EE", insert: "*10^", tone: "dark" },
    { label: "i", insert: "i", tone: "dark", alphaInsert: "i" },
    { label: "MATRIX", insert: "det([[", tone: "dark" },
    { label: "PROB", insert: "normalcdf(", tone: "dark" },
    { label: "ENTER", action: "ENTER", tone: "enter" },
  ],
];

const TONE_CLS: Record<string, string> = {
  blue: "bg-[#5b8def] text-white rounded-full",
  green: "bg-[#3ecf5b] text-black rounded-full",
  dark: "bg-[#2a2a2a] text-[#e8e8e8] rounded-full",
  soft: "bg-[#3a3a3a] text-[#ddd] rounded-md",
  white: "bg-[#f2f2f2] text-black rounded-full",
  enter: "bg-[#d8d8d8] text-black font-bold rounded-full",
  num: "bg-[#f5f5f5] text-black rounded-full shadow-sm",
  op: "bg-[#c8c8c8] text-black rounded-full",
};

interface HistoryLine {
  expr: string;
  result?: string;
  latex?: string;
}

interface Props {
  onHistory: (entry: HistoryEntry) => void;
  onOpenGraph?: (expr: string) => void;
}

export function ScientificProMode({ onHistory, onOpenGraph }: Props) {
  const [history, setHistory] = useState<HistoryLine[]>([
    {
      expr: "{7, 8, sin(8)}^2",
      result: "{49, 64, 0.9788297402}",
      latex: "\\{7,8,\\sin(8)\\}^{2}\\rightarrow L_{1}",
    },
    {
      expr: "(87*sqrt(7))/52 - 48/5 * sin(7)",
      result: "-1.880525885",
      latex: "\\dfrac{87\\sqrt{7}}{52}-\\dfrac{48}{5}\\cdot\\sin(7)",
    },
  ]);
  const [expr, setExpr] = useState("");
  const [angle, setAngle] = useState<AngleMode>("DEG");
  const [second, setSecond] = useState(false);
  const [alpha, setAlpha] = useState(false);
  const [ans, setAns] = useState(0);
  const [memory, setMemory] = useState<Record<string, number>>({});
  const [hint, setHint] = useState<string | null>(null);
  const [cursorPad, setCursorPad] = useState(0);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [redoStack, setRedoStack] = useState<string[]>([]);

  const pushUndo = (prev: string) => {
    setUndoStack((s) => [...s.slice(-30), prev]);
    setRedoStack([]);
  };

  const insertText = useCallback(
    (text: string) => {
      setExpr((prev) => {
        pushUndo(prev);
        if (cursorPad > 0 && cursorPad < prev.length) {
          const i = prev.length - cursorPad;
          return prev.slice(0, i) + text + prev.slice(i);
        }
        return prev + text;
      });
      if (text.startsWith("normalpdf(")) {
        setHint("normalpdf(X Value, [μ], [σ])");
      } else if (text.startsWith("normalcdf(")) {
        setHint("normalcdf(lower, upper, [μ], [σ])");
      } else if (text.startsWith("nCr(") || text.startsWith("nPr(")) {
        setHint(`${text.slice(0, 3)}(n, r)`);
      } else if (text.startsWith("det(")) {
        setHint("det([[a,b],[c,d]])");
      } else if (text.startsWith("mean(") || text.startsWith("std(")) {
        setHint(`${text.slice(0, -1)}([data…])`);
      } else {
        setHint(null);
      }
    },
    [cursorPad],
  );

  const evaluate = () => {
    const scope = { ans, ...memory };
    const ev = evaluateExpression(expr || String(ans), angle, scope);
    if (ev.ok) {
      let latex = expr;
      try {
        latex = math
          .parse(
            expr
              .replace(/×/g, "*")
              .replace(/÷/g, "/")
              .replace(/π/g, "pi")
              .replace(/−/g, "-") || "0",
          )
          .toTex();
      } catch {
        /* keep raw */
      }
      setHistory((h) => [
        ...h.slice(-6),
        { expr, result: ev.formatted, latex },
      ]);
      const num =
        typeof ev.value === "number"
          ? ev.value
          : Number(String(ev.value).replace(/,/g, ""));
      if (Number.isFinite(num)) setAns(num);
      onHistory({
        id: `${Date.now()}`,
        expression: expr,
        result: ev.formatted,
        at: Date.now(),
      });
      pushUndo(expr);
      setExpr(ev.formatted.replace(/,/g, ""));
      setHint(null);
    } else {
      setHistory((h) => [...h.slice(-6), { expr, result: `ERR: ${ev.error}` }]);
    }
  };

  const handleKey = (key: SciKey) => {
    if (key.action === "2ND") {
      setSecond((s) => !s);
      setAlpha(false);
      return;
    }
    if (key.action === "ALPHA") {
      setAlpha((a) => !a);
      setSecond(false);
      return;
    }
    if (key.action === "MODE") {
      setAngle((a) => (a === "DEG" ? "RAD" : "DEG"));
      setHistory((h) => [
        ...h,
        { expr: `Angle → ${angle === "DEG" ? "RAD" : "DEG"}` },
      ]);
      setSecond(false);
      setAlpha(false);
      return;
    }
    if (key.action === "DEL") {
      setExpr((prev) => {
        pushUndo(prev);
        return prev.slice(0, -1);
      });
      setSecond(false);
      setAlpha(false);
      return;
    }
    if (key.action === "CLEAR") {
      pushUndo(expr);
      setExpr("");
      setHint(null);
      setSecond(false);
      setAlpha(false);
      return;
    }
    if (key.action === "ENTER") {
      evaluate();
      setSecond(false);
      setAlpha(false);
      return;
    }
    if (key.action === "NEG") {
      insertText("-");
      setSecond(false);
      setAlpha(false);
      return;
    }
    if (key.action === "STO") {
      if (second) {
        // RCL A
        if (memory.A != null) insertText(String(memory.A));
      } else {
        setMemory((m) => ({ ...m, A: ans }));
        setHistory((h) => [...h, { expr: `Ans → A (${ans})` }]);
      }
      setSecond(false);
      setAlpha(false);
      return;
    }
    if (
      key.action === "GRAPH" ||
      key.action === "Y=" ||
      key.action === "TRACE" ||
      key.action === "ZOOM" ||
      key.action === "WINDOW"
    ) {
      if (key.action === "GRAPH" || key.action === "Y=") {
        onOpenGraph?.(expr.includes("x") ? expr : "sin(x)");
      } else {
        setHistory((h) => [
          ...h,
          { expr: `${key.action}: open Graph tab for interactive view` },
        ]);
      }
      setSecond(false);
      setAlpha(false);
      return;
    }

    let text = key.insert ?? "";
    if (second && key.secondInsert) text = key.secondInsert;
    else if (alpha && (key.alphaInsert || key.alpha)) {
      text = key.alphaInsert ?? key.alpha ?? text;
    }
    if (text) insertText(text);
    setSecond(false);
    setAlpha(false);
  };

  const displayLatex = useMemo(() => {
    try {
      const node = math.parse(
        expr
          .replace(/×/g, "*")
          .replace(/÷/g, "/")
          .replace(/π/g, "pi")
          .replace(/−/g, "-") || "0",
      );
      return node.toTex();
    } catch {
      return expr || "";
    }
  }, [expr]);

  const undo = () => {
    setUndoStack((s) => {
      if (!s.length) return s;
      const prev = s[s.length - 1];
      setRedoStack((r) => [...r, expr]);
      setExpr(prev);
      return s.slice(0, -1);
    });
  };
  const redo = () => {
    setRedoStack((s) => {
      if (!s.length) return s;
      const next = s[s.length - 1];
      setUndoStack((u) => [...u, expr]);
      setExpr(next);
      return s.slice(0, -1);
    });
  };

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-2">
      {/* Natural notation paper screen */}
      <div
        className="rounded-lg px-3 py-2 overflow-auto"
        style={{
          background: "#f7f8f4",
          color: "#111",
          minHeight: 148,
          maxHeight: 180,
          fontFamily: "KaTeX_Main, 'Times New Roman', serif",
          boxShadow: "inset 0 2px 8px rgba(0,0,0,0.2)",
          border: "1px solid #cfd3c8",
        }}
      >
        <div
          className="text-[10px] mb-1 flex justify-between"
          style={{ color: "#666", fontFamily: "system-ui, sans-serif" }}
        >
          <span>
            {angle}
            {second ? " · 2nd" : ""}
            {alpha ? " · ALPHA" : ""}
          </span>
          <span>Ans={ans}</span>
        </div>

        <div className="space-y-2 mb-2">
          {history.slice(-3).map((line, i) => (
            <div key={i} className="text-[13px]">
              <div className="overflow-x-auto">
                {line.latex ? (
                  <MathDisplay latex={line.latex} />
                ) : (
                  <span className="font-mono text-xs">{line.expr}</span>
                )}
              </div>
              {line.result && (
                <div
                  className="text-right font-mono text-sm"
                  style={{ color: "#222" }}
                >
                  {line.result}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="border-t border-[#ddd] pt-1">
          <div className="overflow-x-auto text-base min-h-[24px]">
            {expr ? (
              <MathDisplay latex={displayLatex} />
            ) : (
              <span style={{ color: "#aaa" }}>|</span>
            )}
            <span
              className="inline-block w-[2px] h-4 ml-0.5 align-middle animate-pulse"
              style={{ background: "#e91e8c" }}
              aria-hidden
            />
          </div>
          {hint && (
            <div
              className="mt-1 inline-block text-[11px] px-2 py-0.5 rounded"
              style={{ background: "#e8e8e8", color: "#333", fontFamily: "system-ui, sans-serif" }}
            >
              {hint}
            </div>
          )}
        </div>
      </div>

      {/* Soft keys */}
      <div className="grid grid-cols-5 gap-1">
        {TOP.map((k) => (
          <button
            key={k.label}
            type="button"
            onClick={() => handleKey(k)}
            className="relative h-8 text-[10px] font-semibold rounded-md bg-[#3a3a3a] text-[#eee] active:bg-[#2a2a2a]"
          >
            {k.second && (
              <span
                className="absolute -top-0.5 left-0 right-0 text-center"
                style={{ fontSize: 6, color: "#7eb6ff" }}
              >
                {k.second}
              </span>
            )}
            {k.label}
          </button>
        ))}
      </div>

      {/* Undo / D-pad */}
      <div className="flex items-center justify-between px-1">
        <div className="flex gap-2">
          <button
            type="button"
            aria-label="Undo"
            onClick={undo}
            className="w-9 h-9 rounded-full bg-[#3a3a3a] text-white text-sm"
          >
            ↺
          </button>
          <button
            type="button"
            aria-label="Redo"
            onClick={redo}
            className="w-9 h-9 rounded-full bg-[#3a3a3a] text-white text-sm"
          >
            ↻
          </button>
        </div>
        <div className="flex flex-col items-center">
          <button
            type="button"
            aria-label="Cursor up"
            className="w-9 h-6 rounded-t-full bg-[#ececec] text-black text-xs"
            onClick={() => setCursorPad((c) => c + 1)}
          >
            ▲
          </button>
          <div className="flex">
            <button
              type="button"
              aria-label="Cursor left"
              className="w-7 h-9 rounded-l-full bg-[#ececec] text-black text-xs"
              onClick={() => setCursorPad((c) => c + 1)}
            >
              ◀
            </button>
            <div className="w-9 h-9 bg-[#ddd] rounded-full" />
            <button
              type="button"
              aria-label="Cursor right"
              className="w-7 h-9 rounded-r-full bg-[#ececec] text-black text-xs"
              onClick={() => setCursorPad((c) => Math.max(0, c - 1))}
            >
              ▶
            </button>
          </div>
          <button
            type="button"
            aria-label="Cursor down"
            className="w-9 h-6 rounded-b-full bg-[#ececec] text-black text-xs"
            onClick={() => setCursorPad(0)}
          >
            ▼
          </button>
        </div>
      </div>

      {/* Main keypad */}
      <div className="flex flex-col gap-1">
        {GRID.map((row, ri) => (
          <div key={ri} className="grid grid-cols-5 gap-1">
            {row.map((k) => {
              const active2nd = second && k.label === "2nd";
              const activeAlpha = alpha && k.label === "ALPHA";
              const tone = active2nd
                ? "blue"
                : activeAlpha
                  ? "green"
                  : k.tone ?? "dark";
              return (
                <button
                  key={k.label + ri}
                  type="button"
                  aria-label={k.label}
                  onClick={() => handleKey(k)}
                  className={`relative h-9 text-[11px] font-semibold select-none active:scale-95 ${TONE_CLS[tone]}`}
                >
                  {(k.second || k.alpha) && (
                    <span
                      className="absolute top-0 left-0 right-0 text-center leading-none flex justify-center gap-1"
                      style={{ fontSize: 6 }}
                    >
                      {k.second && (
                        <span style={{ color: second ? "#9ec5ff" : "#5a7aaa" }}>
                          {k.second}
                        </span>
                      )}
                      {k.alpha && (
                        <span style={{ color: alpha ? "#7dff9a" : "#4a8a5a" }}>
                          {k.alpha}
                        </span>
                      )}
                    </span>
                  )}
                  {second && k.second && ["SIN", "COS", "TAN", "LOG", "LN", "x²"].includes(k.label)
                    ? k.second
                    : k.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <p className="text-[10px] text-center" style={{ color: "#666" }}>
        Pro · 2nd / ALPHA · natural notation · lists · normalpdf · matrices — math.js
      </p>
    </div>
  );
}
