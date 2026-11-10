import { useCallback, useState } from "react";
import { Delete } from "lucide-react";
import { evaluateExpression } from "../engine/evaluate";
import type { AngleMode, HistoryEntry } from "../types";
import { ScientificProMode } from "./ScientificProMode";

/**
 * Scientific mode with two layouts:
 * - Classic — phone-style SHIFT/memory pad (default)
 * - Pro — TI-84 natural-notation pad (2nd / ALPHA / paper display)
 */

type BtnKind =
  | { t: "digit"; v: string }
  | { t: "op"; v: string }
  | { t: "fn"; v: string }
  | { t: "const"; v: string }
  | { t: "paren"; v: "(" | ")" }
  | { t: "special"; v: string };

interface BtnDef {
  label: React.ReactNode;
  sub?: string;
  kind: BtnKind;
  color?: "orange" | "dark" | "sci" | "mem" | "shift" | "num";
}

const BUTTONS: BtnDef[] = [
  // Row 1: SHIFT + memory
  { label: "SHIFT", kind: { t: "special", v: "SHIFT" }, color: "shift" },
  { label: "MC", kind: { t: "special", v: "MC" }, color: "mem" },
  { label: "M+", kind: { t: "special", v: "M+" }, color: "mem" },
  { label: "M−", kind: { t: "special", v: "M-" }, color: "mem" },
  { label: "MR", kind: { t: "special", v: "MR" }, color: "mem" },

  // Row 2: trig / log
  { label: "sin", sub: "sin⁻¹", kind: { t: "fn", v: "sin(" }, color: "sci" },
  { label: "cos", sub: "cos⁻¹", kind: { t: "fn", v: "cos(" }, color: "sci" },
  { label: "tan", sub: "tan⁻¹", kind: { t: "fn", v: "tan(" }, color: "sci" },
  { label: "ln", sub: "eˣ", kind: { t: "fn", v: "ln(" }, color: "sci" },
  { label: "log", sub: "10ˣ", kind: { t: "fn", v: "log(" }, color: "sci" },

  // Row 3: powers / roots / parens
  { label: "x²", sub: "√", kind: { t: "fn", v: "²" }, color: "sci" },
  { label: "x³", sub: "∛", kind: { t: "fn", v: "³" }, color: "sci" },
  { label: "xʸ", sub: "ʸ√x", kind: { t: "op", v: "^" }, color: "sci" },
  { label: "(", kind: { t: "paren", v: "(" }, color: "sci" },
  { label: ")", kind: { t: "paren", v: ")" }, color: "sci" },

  // Row 4: constants / misc
  { label: "π", kind: { t: "const", v: "π" }, color: "sci" },
  { label: "e", kind: { t: "const", v: "e" }, color: "sci" },
  { label: "%", kind: { t: "op", v: "%" }, color: "sci" },
  { label: "x!", kind: { t: "fn", v: "!" }, color: "sci" },
  { label: "abs", kind: { t: "fn", v: "abs(" }, color: "sci" },

  // Row 5: 7 8 9 DEL AC
  { label: "7", kind: { t: "digit", v: "7" }, color: "num" },
  { label: "8", kind: { t: "digit", v: "8" }, color: "num" },
  { label: "9", kind: { t: "digit", v: "9" }, color: "num" },
  { label: <Delete className="w-3.5 h-3.5" />, kind: { t: "special", v: "DEL" }, color: "dark" },
  { label: "AC", kind: { t: "special", v: "AC" }, color: "orange" },

  // Row 6: 4 5 6 × ÷
  { label: "4", kind: { t: "digit", v: "4" }, color: "num" },
  { label: "5", kind: { t: "digit", v: "5" }, color: "num" },
  { label: "6", kind: { t: "digit", v: "6" }, color: "num" },
  { label: "×", kind: { t: "op", v: "×" }, color: "dark" },
  { label: "÷", kind: { t: "op", v: "÷" }, color: "dark" },

  // Row 7: 1 2 3 + −
  { label: "1", kind: { t: "digit", v: "1" }, color: "num" },
  { label: "2", kind: { t: "digit", v: "2" }, color: "num" },
  { label: "3", kind: { t: "digit", v: "3" }, color: "num" },
  { label: "+", kind: { t: "op", v: "+" }, color: "dark" },
  { label: "−", kind: { t: "op", v: "−" }, color: "dark" },

  // Row 8: 0 . +/- EXP =
  { label: "0", kind: { t: "digit", v: "0" }, color: "num" },
  { label: ".", kind: { t: "digit", v: "." }, color: "num" },
  { label: "+/−", kind: { t: "special", v: "+/-" }, color: "dark" },
  { label: "EXP", kind: { t: "special", v: "EXP" }, color: "dark" },
  { label: "=", kind: { t: "special", v: "=" }, color: "orange" },
];

const SHIFT_MAP: Record<string, string> = {
  "sin(": "asin(",
  "cos(": "acos(",
  "tan(": "atan(",
  "ln(": "exp(",
  "log(": "10^(",
  "²": "√(",
  "³": "∛(",
  "^": "nthRoot(",
};

const COLOR_CLASS: Record<string, string> = {
  orange:
    "bg-orange-500 active:bg-orange-600 text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.35)]",
  dark: "bg-[#3a3a3a] active:bg-[#2a2a2a] text-white shadow-[inset_0_-2px_0_rgba(0,0,0,0.35)]",
  num: "bg-[#2a2a2a] active:bg-[#1e1e1e] text-white shadow-[inset_0_-2px_0_rgba(0,0,0,0.35)]",
  sci: "bg-[#252535] active:bg-[#1e1e2c] text-[#c8c8f0] shadow-[inset_0_-2px_0_rgba(0,0,0,0.35)]",
  mem: "bg-[#1e2a1e] active:bg-[#182018] text-[#7ec87e] shadow-[inset_0_-2px_0_rgba(0,0,0,0.35)]",
  shift:
    "bg-[#2a1e00] active:bg-[#1e1600] text-orange-400 shadow-[inset_0_-2px_0_rgba(0,0,0,0.35)]",
};

interface Props {
  onHistory: (entry: HistoryEntry) => void;
  onOpenGraph?: (expr: string) => void;
}

export function ScientificMode({ onHistory, onOpenGraph }: Props) {
  const [layout, setLayout] = useState<"classic" | "pro">("classic");

  return (
    <div
      className="w-full h-full min-h-0 flex flex-col gap-1.5"
      data-testid="scientific-mode"
    >
      {/* Compact layout switcher — keeps the pad visible on short phones */}
      <div
        className="rounded-lg px-2 py-1 flex items-center gap-2 flex-shrink-0"
        style={{ background: "#141414", border: "1px solid #2a2a2a" }}
      >
        <span className="text-[10px] whitespace-nowrap flex-shrink-0" style={{ color: "#888" }}>
          Layout
        </span>
        <div
          className="grid grid-cols-2 gap-1 flex-1 min-w-0"
          role="tablist"
          aria-label="Scientific layout"
        >
          {(
            [
              { id: "classic", label: "Classic" },
              { id: "pro", label: "Pro (TI-84)" },
            ] as const
          ).map((tab) => {
            const active = layout === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setLayout(tab.id)}
                className="px-2 py-1 rounded-md text-center active:scale-[0.98] transition-transform text-xs font-bold"
                style={{
                  background: active ? "#39ff14" : "#1a1a1a",
                  color: active ? "#0a0a0a" : "#ddd",
                  border: active ? "1px solid #39ff14" : "1px solid #333",
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {layout === "pro" ? (
          <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
            <ScientificProMode onHistory={onHistory} onOpenGraph={onOpenGraph} />
          </div>
        ) : (
          <ScientificClassicPad onHistory={onHistory} />
        )}
      </div>
    </div>
  );
}

function ScientificClassicPad({ onHistory }: { onHistory: (entry: HistoryEntry) => void }) {
  const [expr, setExpr] = useState("");
  const [memory, setMemory] = useState(0);
  const [hasMemory, setHasMemory] = useState(false);
  const [angle, setAngle] = useState<AngleMode>("DEG");
  const [shiftOn, setShiftOn] = useState(false);
  const [isResult, setIsResult] = useState(false);
  const [ans, setAns] = useState(0);

  const preview = evaluateExpression(expr || "0", angle, { ans });
  let displayResult = "0";
  if (expr) {
    displayResult = preview.ok ? preview.formatted : isResult ? "Error" : "…";
  }
  const displayExpr = (expr || "0").replace(/\*/g, "×").replace(/\//g, "÷");

  const append = useCallback(
    (s: string) => {
      setIsResult(false);
      setExpr((prev) => prev + s);
    },
    [],
  );

  const handleBtn = (btn: BtnDef) => {
    const k = btn.kind;

    if (k.t === "special" && k.v === "SHIFT") {
      setShiftOn((s) => !s);
      return;
    }
    const useShift = shiftOn;
    setShiftOn(false);

    if (k.t === "digit") {
      setExpr((prev) => {
        if (isResult && k.v !== ".") {
          setIsResult(false);
          return k.v;
        }
        setIsResult(false);
        if (prev === "0" && k.v !== ".") return k.v;
        return prev + k.v;
      });
      return;
    }

    if (k.t === "op" || k.t === "const" || k.t === "paren") {
      if (isResult) setIsResult(false);
      let v = k.v;
      if (useShift && k.t === "op" && v === "^") v = "nthRoot(";
      append(v);
      return;
    }

    if (k.t === "fn") {
      if (isResult) setIsResult(false);
      let fn = k.v;
      if (useShift && SHIFT_MAP[fn]) fn = SHIFT_MAP[fn];
      if (fn === "²") {
        append("^2");
        return;
      }
      if (fn === "³") {
        append("^3");
        return;
      }
      if (fn === "!") {
        append("!");
        return;
      }
      if (fn === "√(") {
        append("sqrt(");
        return;
      }
      if (fn === "∛(") {
        append("cbrt(");
        return;
      }
      if (fn === "ln(") {
        append("log(");
        return;
      }
      if (fn === "log(") {
        append("log10(");
        return;
      }
      if (fn === "abs(") {
        append("abs(");
        return;
      }
      append(fn);
      return;
    }

    if (k.t === "special") {
      switch (k.v) {
        case "AC":
          setExpr("");
          setIsResult(false);
          break;
        case "DEL":
          setExpr((prev) => {
            if (!prev) return prev;
            const endings = [
              "asin(",
              "acos(",
              "atan(",
              "sin(",
              "cos(",
              "tan(",
              "log10(",
              "log(",
              "sqrt(",
              "cbrt(",
              "nthRoot(",
              "abs(",
              "exp(",
              "10^(",
              "×10^",
            ];
            for (const end of endings) {
              if (prev.endsWith(end)) return prev.slice(0, -end.length);
            }
            return prev.slice(0, -1);
          });
          setIsResult(false);
          break;
        case "=": {
          const ev = evaluateExpression(expr || "0", angle, { ans });
          if (ev.ok) {
            const num =
              typeof ev.value === "number"
                ? ev.value
                : Number(String(ev.value).replace(/,/g, ""));
            if (Number.isFinite(num)) setAns(num);
            setExpr(ev.formatted.replace(/,/g, ""));
            setIsResult(true);
            onHistory({
              id: `${Date.now()}`,
              expression: expr,
              result: ev.formatted,
              at: Date.now(),
            });
          } else {
            setIsResult(true);
          }
          break;
        }
        case "+/-":
          setExpr((prev) => {
            if (!prev || prev === "0") return prev;
            if (prev.startsWith("-(") && prev.endsWith(")")) {
              return prev.slice(2, -1);
            }
            if (prev.startsWith("-")) return prev.slice(1);
            return `-(${prev})`;
          });
          break;
        case "EXP":
          append("×10^");
          break;
        case "M+": {
          const v = evaluateExpression(expr || "0", angle, { ans });
          if (v.ok) {
            const n = typeof v.value === "number" ? v.value : Number(String(v.value).replace(/,/g, ""));
            if (Number.isFinite(n)) {
              setMemory((m) => m + n);
              setHasMemory(true);
            }
          }
          break;
        }
        case "M-": {
          const v = evaluateExpression(expr || "0", angle, { ans });
          if (v.ok) {
            const n = typeof v.value === "number" ? v.value : Number(String(v.value).replace(/,/g, ""));
            if (Number.isFinite(n)) {
              setMemory((m) => m - n);
              setHasMemory(true);
            }
          }
          break;
        }
        case "MR":
          if (isResult) setIsResult(false);
          append(String(memory));
          break;
        case "MC":
          setMemory(0);
          setHasMemory(false);
          break;
      }
    }
  };

  const resultColor =
    !expr || preview.ok ? "#c8e6c0" : "#e07070";
  const resultSizeFit =
    String(displayResult).length > 11
      ? 18
      : String(displayResult).length > 8
        ? 24
        : 30;

  return (
    <div className="flex items-stretch justify-center w-full h-full min-h-0">
      <div
        className="w-full h-full min-h-0 flex flex-col rounded-2xl overflow-hidden"
        style={{
          background: "#111",
          maxWidth: 360,
          boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
        }}
        data-testid="scientific-classic-pad"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-2.5 pt-1.5 pb-0.5 flex-shrink-0">
          <span className="text-white font-bold text-sm tracking-wide">Scientific</span>
          <div className="flex items-center gap-2">
            {hasMemory && (
              <span className="text-[#7ec87e] text-xs font-bold" aria-label="Memory set">
                M
              </span>
            )}
            <button
              type="button"
              onClick={() => setAngle((a) => (a === "DEG" ? "RAD" : "DEG"))}
              className="px-2 py-0.5 rounded text-[11px] font-bold border"
              style={{
                color: angle === "DEG" ? "#f97316" : "#7ec8e3",
                borderColor: angle === "DEG" ? "#f97316" : "#7ec8e3",
                background: "transparent",
              }}
              aria-label={`Angle mode ${angle}`}
            >
              {angle}
            </button>
          </div>
        </div>

        {/* Display — compact so the 8-row pad fits above the bottom nav */}
        <div
          className="mx-1.5 rounded-lg px-2.5 pt-1.5 pb-1.5 mb-1 flex flex-col items-end justify-end flex-shrink-0"
          style={{
            background: "#1a2318",
            minHeight: 48,
            boxShadow: "inset 0 2px 8px rgba(0,0,0,0.6)",
          }}
        >
          <div
            className="w-full text-right break-all leading-snug mb-0.5"
            style={{
              color: "#6a9a6a",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 11,
              minHeight: 14,
            }}
          >
            {displayExpr.length > 30 ? "…" + displayExpr.slice(-29) : displayExpr}
          </div>
          <div
            className="w-full text-right font-bold leading-none"
            style={{
              color: resultColor,
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: resultSizeFit,
            }}
          >
            {displayResult}
          </div>
        </div>

        {/* Button grid — minmax(0,1fr) lets rows shrink inside the viewport */}
        <div
          className="px-1.5 pb-1.5 grid grid-cols-5"
          style={{
            flex: 1,
            gap: 3,
            gridTemplateRows: "repeat(8, minmax(0, 1fr))",
            minHeight: 0,
          }}
        >
          {BUTTONS.map((btn, i) => {
            const isShiftActive =
              shiftOn && btn.kind.t === "special" && btn.kind.v === "SHIFT";
            const colorKey = btn.color ?? "num";
            const colorClass = isShiftActive
              ? "bg-orange-500 text-white shadow-[inset_0_-2px_0_rgba(0,0,0,0.4)]"
              : COLOR_CLASS[colorKey];

            let mainLabel = btn.label;
            if (shiftOn && btn.kind.t === "fn" && btn.sub) {
              mainLabel = btn.sub;
            }
            if (shiftOn && btn.kind.t === "op" && btn.kind.v === "^" && btn.sub) {
              mainLabel = btn.sub;
            }

            return (
              <button
                key={i}
                type="button"
                aria-label={typeof btn.label === "string" ? btn.label : btn.kind.v}
                onClick={() => handleBtn(btn)}
                onPointerDown={(e) => {
                  if (e.pointerType === "touch") {
                    e.preventDefault();
                    handleBtn(btn);
                  }
                }}
                className={`
                  relative flex flex-col items-center justify-center
                  rounded-md select-none active:scale-95
                  transition-transform duration-75 w-full h-full min-h-0
                  ${colorClass}
                `}
              >
                {btn.sub && (
                  <span
                    className="absolute top-0 left-0 right-0 text-center leading-none pointer-events-none"
                    style={{
                      fontSize: 6,
                      color: shiftOn ? "#f97316" : "rgba(255,255,255,0.3)",
                    }}
                  >
                    {btn.sub}
                  </span>
                )}
                <span
                  className="font-semibold leading-none"
                  style={{
                    fontSize:
                      typeof mainLabel === "string" && mainLabel.length > 3 ? 10 : 13,
                  }}
                >
                  {mainLabel}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
