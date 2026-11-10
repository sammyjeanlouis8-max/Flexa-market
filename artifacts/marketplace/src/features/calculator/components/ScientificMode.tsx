import { useCallback, useMemo, useState } from "react";
import { evaluateExpression, math } from "../engine/evaluate";
import type { AngleMode, HistoryEntry } from "../types";
import { MathDisplay } from "./MathDisplay";

interface SciKey {
  label: string;
  second?: string;
  alpha?: string;
  insert?: string;
  secondInsert?: string;
  alphaInsert?: string;
  action?: string;
  tone?: "blue" | "green" | "dark" | "white" | "enter" | "num";
}

const TOP: SciKey[] = [
  { label: "Y=", action: "Y=" },
  { label: "WINDOW", action: "WINDOW" },
  { label: "ZOOM", action: "ZOOM" },
  { label: "TRACE", action: "TRACE" },
  { label: "GRAPH", action: "GRAPH" },
];

const GRID: SciKey[][] = [
  [
    { label: "2ND", action: "2ND", tone: "blue" },
    { label: "MODE", action: "MODE" },
    { label: "DEL", action: "DEL" },
    { label: "ALPHA", action: "ALPHA", tone: "green" },
    { label: "X,T,θ,n", insert: "x", alphaInsert: "n" },
  ],
  [
    { label: "STAT", insert: "mean(", secondInsert: "std(" },
    { label: "MATH", insert: "nCr(", secondInsert: "nPr(" },
    { label: "APPS", insert: "normalpdf(" },
    { label: "PRGM", insert: "solve(" },
    { label: "VARS", insert: "ans" },
  ],
  [
    { label: "CLEAR", action: "CLEAR" },
    { label: "x⁻¹", insert: "^(-1)", secondInsert: "!" },
    { label: "SIN", second: "SIN⁻¹", insert: "sin(", secondInsert: "asin(" },
    { label: "COS", second: "COS⁻¹", insert: "cos(", secondInsert: "acos(" },
    { label: "TAN", second: "TAN⁻¹", insert: "tan(", secondInsert: "atan(" },
  ],
  [
    { label: "^", second: "π", insert: "^", secondInsert: "π" },
    { label: "x²", second: "√", insert: "^2", secondInsert: "sqrt(" },
    { label: ",", insert: "," },
    { label: "(", insert: "(" },
    { label: ")", insert: ")" },
  ],
  [
    { label: "LOG", second: "10ˣ", insert: "log10(", secondInsert: "10^(" },
    { label: "LN", second: "eˣ", insert: "log(", secondInsert: "exp(" },
    { label: "7", insert: "7", tone: "num" },
    { label: "8", insert: "8", tone: "num" },
    { label: "9", insert: "9", tone: "num" },
  ],
  [
    { label: "STO→", action: "STO" },
    { label: "ON", action: "CLEAR" },
    { label: "4", insert: "4", tone: "num" },
    { label: "5", insert: "5", tone: "num" },
    { label: "6", insert: "6", tone: "num" },
  ],
  [
    { label: "−", insert: "-", secondInsert: "ans" },
    { label: "÷", insert: "÷" },
    { label: "1", insert: "1", tone: "num" },
    { label: "2", insert: "2", tone: "num" },
    { label: "3", insert: "3", tone: "num" },
  ],
  [
    { label: "+", insert: "+" },
    { label: "×", insert: "×" },
    { label: "0", insert: "0", tone: "num" },
    { label: ".", insert: "." },
    { label: "(−)", action: "NEG" },
  ],
  [
    { label: "EE", insert: "*10^" },
    { label: "i", insert: "i", alphaInsert: "i" },
    { label: "MATRIX", insert: "det([" },
    { label: "PROB", insert: "normalcdf(" },
    { label: "ENTER", action: "ENTER", tone: "enter" },
  ],
];

const TONE_CLS: Record<string, string> = {
  blue: "bg-[#1e4fd6] text-white",
  green: "bg-[#1faa3a] text-white",
  dark: "bg-[#2a2a2a] text-[#e8e8e8]",
  white: "bg-[#ececec] text-black",
  enter: "bg-[#d0d0d0] text-black font-bold",
  num: "bg-[#3a3a3a] text-white",
};

interface Props {
  onHistory: (entry: HistoryEntry) => void;
  onOpenGraph?: (expr: string) => void;
}

export function ScientificMode({ onHistory, onOpenGraph }: Props) {
  const [lines, setLines] = useState<string[]>([
    "Flexa Scientific Ready",
  ]);
  const [expr, setExpr] = useState("");
  const [angle, setAngle] = useState<AngleMode>("DEG");
  const [second, setSecond] = useState(false);
  const [alpha, setAlpha] = useState(false);
  const [ans, setAns] = useState(0);
  const [memory, setMemory] = useState<Record<string, number>>({});
  const [hint, setHint] = useState<string | null>(null);
  const [cursorPad, setCursorPad] = useState(0);

  const pushLine = (s: string) => {
    setLines((prev) => [...prev.slice(-8), s]);
  };

  const insertText = useCallback((text: string) => {
    setExpr((prev) => {
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
    } else if (text.startsWith("det([")) {
      setHint("det([[a,b],[c,d]])");
    } else {
      setHint(null);
    }
  }, [cursorPad]);

  const evaluate = () => {
    const scope = { ans, ...memory };
    const ev = evaluateExpression(expr || String(ans), angle, scope);
    if (ev.ok) {
      pushLine(expr);
      pushLine(`→ ${ev.formatted}`);
      const num = typeof ev.value === "number" ? ev.value : Number(String(ev.value).replace(/,/g, ""));
      if (Number.isFinite(num)) setAns(num);
      onHistory({
        id: `${Date.now()}`,
        expression: expr,
        result: ev.formatted,
        at: Date.now(),
      });
      setExpr(ev.formatted.replace(/,/g, ""));
    } else {
      pushLine(`ERR: ${ev.error}`);
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
      pushLine(`Angle: ${angle === "DEG" ? "RAD" : "DEG"}`);
      setSecond(false);
      setAlpha(false);
      return;
    }
    if (key.action === "DEL") {
      setExpr((prev) => prev.slice(0, -1));
      setSecond(false);
      setAlpha(false);
      return;
    }
    if (key.action === "CLEAR") {
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
      // Store ans into A
      setMemory((m) => ({ ...m, A: ans }));
      pushLine(`Ans → A (${ans})`);
      setSecond(false);
      setAlpha(false);
      return;
    }
    if (key.action === "GRAPH" || key.action === "Y=") {
      onOpenGraph?.(expr || "sin(x)");
      setSecond(false);
      setAlpha(false);
      return;
    }
    if (key.action === "WINDOW" || key.action === "ZOOM" || key.action === "TRACE") {
      pushLine(`${key.action}: use Graph tab for interactive view`);
      setSecond(false);
      setAlpha(false);
      return;
    }

    let text = key.insert ?? "";
    if (second && key.secondInsert) text = key.secondInsert;
    else if (alpha && key.alphaInsert) text = key.alphaInsert;
    if (text) insertText(text);
    setSecond(false);
    setAlpha(false);
  };

  const displayLatex = useMemo(() => {
    // Lightweight display conversion for common patterns
    try {
      const node = math.parse(
        expr
          .replace(/×/g, "*")
          .replace(/÷/g, "/")
          .replace(/π/g, "pi") || "0",
      );
      return node.toTex();
    } catch {
      return expr || "0";
    }
  }, [expr]);

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-2">
      {/* Natural notation screen */}
      <div
        className="rounded-md px-3 py-2 overflow-auto"
        style={{
          background: "#f4f6f0",
          color: "#111",
          minHeight: 128,
          maxHeight: 160,
          fontFamily: "KaTeX_Main, Times New Roman, serif",
          boxShadow: "inset 0 2px 6px rgba(0,0,0,0.25)",
        }}
      >
        <div className="text-[10px] mb-1 flex justify-between" style={{ color: "#555" }}>
          <span>{angle} {second ? "2nd" : ""} {alpha ? "ALPHA" : ""}</span>
          <span>Ans={ans}</span>
        </div>
        <div className="space-y-0.5 text-xs mb-2" style={{ color: "#333" }}>
          {lines.slice(-4).map((l, i) => (
            <div key={i} className="break-all">{l}</div>
          ))}
        </div>
        <div className="text-base overflow-x-auto">
          <MathDisplay latex={displayLatex} />
        </div>
        {hint && (
          <div className="text-[11px] mt-1" style={{ color: "#1a5fb4" }}>
            {hint}
          </div>
        )}
      </div>

      {/* Top soft keys */}
      <div className="grid grid-cols-5 gap-1">
        {TOP.map((k) => (
          <button
            key={k.label}
            type="button"
            onPointerDown={(e) => {
              e.preventDefault();
              handleKey(k);
            }}
            className="h-7 text-[10px] font-semibold rounded-sm bg-[#2f2f2f] text-[#ddd] active:bg-[#222]"
          >
            {k.label}
          </button>
        ))}
      </div>

      {/* D-pad row hint */}
      <div className="flex items-center justify-end gap-2 px-1">
        <div className="flex flex-col items-center">
          <button
            type="button"
            aria-label="Up"
            className="w-8 h-6 rounded-t-full bg-[#e8e8e8] text-black text-xs"
            onClick={() => setCursorPad((c) => c + 1)}
          >
            ▲
          </button>
          <div className="flex">
            <button
              type="button"
              aria-label="Left"
              className="w-6 h-8 rounded-l-full bg-[#e8e8e8] text-black text-xs"
              onClick={() => setCursorPad((c) => c + 1)}
            >
              ◀
            </button>
            <div className="w-8 h-8 bg-[#ddd] rounded-full" />
            <button
              type="button"
              aria-label="Right"
              className="w-6 h-8 rounded-r-full bg-[#e8e8e8] text-black text-xs"
              onClick={() => setCursorPad((c) => Math.max(0, c - 1))}
            >
              ▶
            </button>
          </div>
          <button
            type="button"
            aria-label="Down"
            className="w-8 h-6 rounded-b-full bg-[#e8e8e8] text-black text-xs"
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
              const active2nd = second && k.label === "2ND";
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
                  onPointerDown={(e) => {
                    e.preventDefault();
                    handleKey(k);
                  }}
                  className={`relative h-9 rounded-md text-[11px] font-semibold select-none active:scale-95 ${TONE_CLS[tone]}`}
                >
                  {k.second && (
                    <span
                      className="absolute top-0.5 left-0 right-0 text-center leading-none"
                      style={{ fontSize: 7, color: second ? "#7eb6ff" : "#5a7aaa" }}
                    >
                      {k.second}
                    </span>
                  )}
                  {second && k.second ? k.second : k.label}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <p className="text-[10px] text-center" style={{ color: "#666" }}>
        SHIFT/2ND · ALPHA · DEG/RAD · matrices · stats · complex · nCr/nPr — math.js engine
      </p>
    </div>
  );
}
