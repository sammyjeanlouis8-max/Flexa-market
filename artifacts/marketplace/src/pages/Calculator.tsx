import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/auth";
import { Link } from "wouter";
import { ChevronRight, Delete } from "lucide-react";

// ── Safe math evaluator ────────────────────────────────────────────────────
function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0 || n > 170) return NaN;
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}

function safeEval(expr: string, deg: boolean): { value: string; ok: boolean } {
  if (!expr || expr === "-") return { value: "0", ok: false };
  try {
    let s = expr
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      // ² ³ powers (must come before π/e substitution)
      .replace(/\(([^)]+)\)²/g, "(($1)**2)")
      .replace(/\(([^)]+)\)³/g, "(($1)**3)")
      .replace(/(\d+(?:\.\d+)?)²/g, "($1**2)")
      .replace(/(\d+(?:\.\d+)?)³/g, "($1**3)")
      .replace(/π/g, `(${Math.PI})`)
      .replace(/(?<![a-zA-Z])e(?![a-zA-Z\d])/g, `(${Math.E})`)
      .replace(/\^/g, "**")
      // % as percent-of (divide by 100)
      .replace(/(\d+(?:\.\d+)?)%/g, "($1/100)")
      // implicit multiplication: 2π → 2*(π), 3( → 3*(
      .replace(/(\d)\(/g, "$1*(")
      // factorial
      .replace(/(\d+(?:\.\d+)?)!/g, (_: string, n: string) => `FACT(${n})`);

    // Replace trig/log (inverses before direct)
    s = s
      .replace(/sin⁻¹\(/g, "__ASIN(")
      .replace(/cos⁻¹\(/g, "__ACOS(")
      .replace(/tan⁻¹\(/g, "__ATAN(")
      .replace(/sin\(/g, "__SIN(")
      .replace(/cos\(/g, "__COS(")
      .replace(/tan\(/g, "__TAN(")
      .replace(/log₁₀\(/g, "__LOG10(")
      .replace(/log\(/g, "__LOG10(")
      .replace(/ln\(/g, "__LN(")
      .replace(/√\(/g, "__SQRT(")
      .replace(/∛\(/g, "__CBRT(")
      .replace(/abs\(/g, "__ABS(");

    const toRad = deg ? (x: number) => (x * Math.PI) / 180 : (x: number) => x;
    const fromRad = deg ? (x: number) => (x * 180) / Math.PI : (x: number) => x;

    /* eslint-disable no-new-func */
    const fn = new Function(
      "__SIN","__COS","__TAN","__ASIN","__ACOS","__ATAN",
      "__LOG10","__LN","__SQRT","__CBRT","__ABS","FACT",
      `"use strict"; return (${s})`,
    );

    const result = fn(
      (x: number) => Math.sin(toRad(x)),
      (x: number) => Math.cos(toRad(x)),
      (x: number) => Math.tan(toRad(x)),
      (x: number) => fromRad(Math.asin(x)),
      (x: number) => fromRad(Math.acos(x)),
      (x: number) => fromRad(Math.atan(x)),
      Math.log10, Math.log, Math.sqrt, Math.cbrt, Math.abs,
      factorial,
    );

    if (typeof result !== "number") return { value: "Error", ok: false };
    if (!isFinite(result)) return { value: isNaN(result) ? "Undef" : "∞", ok: false };

    const abs = Math.abs(result);
    let formatted: string;
    if (abs === 0) {
      formatted = "0";
    } else if (abs >= 1e10 || (abs < 0.0001 && abs > 0)) {
      formatted = result.toExponential(5).replace(/\.?0+(e)/, "$1");
    } else {
      formatted = parseFloat(result.toPrecision(10)).toString();
    }
    return { value: formatted, ok: true };
  } catch {
    return { value: "0", ok: false };
  }
}

// ── Button types ──────────────────────────────────────────────────────────
type BtnKind =
  | { t: "digit";   v: string }
  | { t: "op";      v: string }
  | { t: "fn";      v: string }
  | { t: "const";   v: string }
  | { t: "paren";   v: "(" | ")" }
  | { t: "special"; v: string };

interface BtnDef {
  label: React.ReactNode;
  sub?: string;
  kind: BtnKind;
  color?: "orange" | "dark" | "sci" | "mem" | "shift";
}

const BUTTONS: BtnDef[] = [
  // Row 1: SHIFT + memory
  { label: "SHIFT", kind: { t: "special", v: "SHIFT" }, color: "shift" },
  { label: "MC",    kind: { t: "special", v: "MC"    }, color: "mem"   },
  { label: "M+",    kind: { t: "special", v: "M+"    }, color: "mem"   },
  { label: "M−",    kind: { t: "special", v: "M-"    }, color: "mem"   },
  { label: "MR",    kind: { t: "special", v: "MR"    }, color: "mem"   },

  // Row 2: trig
  { label: "sin", sub: "sin⁻¹", kind: { t: "fn", v: "sin(" }, color: "sci" },
  { label: "cos", sub: "cos⁻¹", kind: { t: "fn", v: "cos(" }, color: "sci" },
  { label: "tan", sub: "tan⁻¹", kind: { t: "fn", v: "tan(" }, color: "sci" },
  { label: "ln",  sub: "eˣ",    kind: { t: "fn", v: "ln("  }, color: "sci" },
  { label: "log", sub: "10ˣ",   kind: { t: "fn", v: "log(" }, color: "sci" },

  // Row 3: powers / roots
  { label: "x²",  sub: "√",  kind: { t: "fn",    v: "²"   }, color: "sci" },
  { label: "x³",  sub: "∛",  kind: { t: "fn",    v: "³"   }, color: "sci" },
  { label: "xʸ",  sub: "",   kind: { t: "op",    v: "^"   }, color: "sci" },
  { label: "(",              kind: { t: "paren",  v: "("   }, color: "sci" },
  { label: ")",              kind: { t: "paren",  v: ")"   }, color: "sci" },

  // Row 4: constants / misc
  { label: "π",   kind: { t: "const", v: "π"   }, color: "sci" },
  { label: "e",   kind: { t: "const", v: "e"   }, color: "sci" },
  { label: "%",   kind: { t: "op",    v: "%"   }, color: "sci" },
  { label: "x!",  kind: { t: "fn",    v: "!"   }, color: "sci" },
  { label: "abs", kind: { t: "fn",    v: "abs(" }, color: "sci" },

  // Row 5: 7 8 9 DEL AC
  { label: "7", kind: { t: "digit", v: "7" } },
  { label: "8", kind: { t: "digit", v: "8" } },
  { label: "9", kind: { t: "digit", v: "9" } },
  { label: <Delete className="w-4 h-4" />, kind: { t: "special", v: "DEL" }, color: "dark" },
  { label: "AC", kind: { t: "special", v: "AC" }, color: "orange" },

  // Row 6: 4 5 6 × ÷
  { label: "4", kind: { t: "digit", v: "4" } },
  { label: "5", kind: { t: "digit", v: "5" } },
  { label: "6", kind: { t: "digit", v: "6" } },
  { label: "×", kind: { t: "op",    v: "×" }, color: "dark" },
  { label: "÷", kind: { t: "op",    v: "÷" }, color: "dark" },

  // Row 7: 1 2 3 + −
  { label: "1", kind: { t: "digit", v: "1" } },
  { label: "2", kind: { t: "digit", v: "2" } },
  { label: "3", kind: { t: "digit", v: "3" } },
  { label: "+", kind: { t: "op",    v: "+" }, color: "dark" },
  { label: "−", kind: { t: "op",    v: "-" }, color: "dark" },

  // Row 8: 0 . +/- EXP =
  { label: "0",   kind: { t: "digit",   v: "0"   } },
  { label: ".",   kind: { t: "digit",   v: "."   } },
  { label: "+/−", kind: { t: "special", v: "+/-" }, color: "dark" },
  { label: "EXP", kind: { t: "special", v: "EXP" }, color: "dark" },
  { label: "=",   kind: { t: "special", v: "="   }, color: "orange" },
];

const SHIFT_MAP: Record<string, string> = {
  "sin(": "sin⁻¹(",
  "cos(": "cos⁻¹(",
  "tan(": "tan⁻¹(",
  "²":    "√(",
  "³":    "∛(",
  "ln(":  "eˣ(",
};

const COLOR_MAP: Record<string, string> = {
  orange: "bg-orange-500 active:bg-orange-600 text-white shadow-[inset_0_-3px_0_rgba(0,0,0,0.4)]",
  dark:   "bg-[#3a3a3a] active:bg-[#2a2a2a] text-white shadow-[inset_0_-2px_0_rgba(0,0,0,0.4)]",
  sci:    "bg-[#252535] active:bg-[#1e1e2c] text-[#c8c8f0] shadow-[inset_0_-2px_0_rgba(0,0,0,0.4)]",
  mem:    "bg-[#1e2a1e] active:bg-[#182018] text-[#7ec87e] shadow-[inset_0_-2px_0_rgba(0,0,0,0.4)]",
  shift:  "bg-[#2a1e00] active:bg-[#1e1600] text-orange-400 shadow-[inset_0_-2px_0_rgba(0,0,0,0.4)]",
  normal: "bg-[#2a2a2a] active:bg-[#1e1e1e] text-white shadow-[inset_0_-2px_0_rgba(0,0,0,0.4)]",
};

// ── Component ──────────────────────────────────────────────────────────────
export default function CalculatorPage() {
  const { user } = useAuth();

  const [expr,       setExpr]       = useState("");
  const [memory,     setMemory]     = useState(0);
  const [hasMemory,  setHasMemory]  = useState(false);
  const [degMode,    setDegMode]    = useState(true);
  const [shiftOn,    setShiftOn]    = useState(false);
  const [isResult,   setIsResult]   = useState(false);
  const [lastAns,    setLastAns]    = useState("0");

  const preview       = safeEval(expr || "0", degMode);
  const displayResult = expr ? preview.value : "0";
  const displayExpr   = (expr || "0")
    .replace(/\*/g, "×").replace(/\//g, "÷");

  const appendToExpr = useCallback((s: string) => {
    setIsResult(false);
    setExpr(prev => prev + s);
  }, []);

  const handleBtn = useCallback((btn: BtnDef, shift: boolean) => {
    const k = btn.kind;

    if (k.t === "special" && k.v === "SHIFT") {
      setShiftOn(s => !s);
      return;
    }
    setShiftOn(false);

    if (k.t === "digit") {
      setExpr(prev => {
        if (isResult && k.v !== ".") { setIsResult(false); return k.v; }
        setIsResult(false);
        if (prev === "0" && k.v !== ".") return k.v;
        return prev + k.v;
      });
      return;
    }

    if (k.t === "op" || k.t === "const" || k.t === "paren") {
      if (isResult) setIsResult(false);
      appendToExpr(k.v);
      return;
    }

    if (k.t === "fn") {
      if (isResult) setIsResult(false);
      let fn = k.v;
      if (shift && SHIFT_MAP[fn]) fn = SHIFT_MAP[fn];
      if (fn === "²") { appendToExpr("²"); return; }
      if (fn === "³") { appendToExpr("³"); return; }
      if (fn === "!") { appendToExpr("!"); return; }
      if (fn === "√(") { appendToExpr("√("); return; }
      if (fn === "∛(") { appendToExpr("∛("); return; }
      if (fn === "eˣ(") { appendToExpr("e^("); return; }
      appendToExpr(fn);
      return;
    }

    if (k.t === "special") {
      switch (k.v) {
        case "AC":
          setExpr(""); setIsResult(false);
          break;

        case "DEL":
          setExpr(prev => {
            if (!prev) return prev;
            const endings = ["sin⁻¹(","cos⁻¹(","tan⁻¹(","sin(","cos(","tan(","log(","ln(","√(","∛(","abs(","×10^"];
            for (const end of endings) {
              if (prev.endsWith(end)) return prev.slice(0, -end.length);
            }
            return prev.slice(0, -1);
          });
          setIsResult(false);
          break;

        case "=": {
          const ev = safeEval(expr || "0", degMode);
          if (ev.ok) {
            setLastAns(ev.value);
            setExpr(ev.value);
            setIsResult(true);
          }
          break;
        }

        case "+/-":
          setExpr(prev => {
            if (!prev || prev === "0") return prev;
            return prev.startsWith("-") ? prev.slice(1) : "-" + prev;
          });
          break;

        case "EXP":
          appendToExpr("×10^");
          break;

        case "M+": {
          const v = safeEval(expr || "0", degMode);
          if (v.ok) { setMemory(m => m + parseFloat(v.value)); setHasMemory(true); }
          break;
        }
        case "M-": {
          const v = safeEval(expr || "0", degMode);
          if (v.ok) { setMemory(m => m - parseFloat(v.value)); setHasMemory(true); }
          break;
        }
        case "MR":
          if (isResult) setIsResult(false);
          appendToExpr(String(memory));
          break;
        case "MC":
          setMemory(0); setHasMemory(false);
          break;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      void lastAns;
    }
  }, [expr, degMode, isResult, lastAns, memory, appendToExpr]);

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-center">
          <div className="text-4xl mb-3">🖩</div>
          <p className="text-gray-400 text-sm mb-4">Konekte pou itilize kalkilatè a.</p>
          <Link href="/auth/login">
            <button className="flex items-center gap-2 mx-auto bg-orange-500 text-white font-semibold px-5 py-2.5 rounded-xl">
              <ChevronRight className="h-4 w-4" />Konekte
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex justify-center"
      style={{ background: "#0d0d0d", height: "calc(100dvh - 56px)", overflow: "hidden" }}
    >
      <div
        className="w-full flex flex-col"
        style={{ background: "#111", maxWidth: 420 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-3 pt-2 pb-1 flex-shrink-0">
          <span className="text-white font-bold text-base tracking-wide">Scientific</span>
          <div className="flex items-center gap-2">
            {hasMemory && <span className="text-[#7ec87e] text-xs font-bold">M</span>}
            <button
              onClick={() => setDegMode(d => !d)}
              className="px-2 py-0.5 rounded text-xs font-bold border"
              style={{
                color: degMode ? "#f97316" : "#7ec8e3",
                borderColor: degMode ? "#f97316" : "#7ec8e3",
                background: "transparent",
              }}
            >
              {degMode ? "DEG" : "RAD"}
            </button>
          </div>
        </div>

        {/* Display */}
        <div
          className="mx-2 rounded-xl px-3 pt-2 pb-3 mb-2 flex flex-col items-end justify-end flex-shrink-0"
          style={{
            background: "#1a2318",
            minHeight: 76,
            boxShadow: "inset 0 2px 8px rgba(0,0,0,0.6)",
          }}
        >
          <div
            className="w-full text-right break-all leading-snug mb-0.5"
            style={{ color: "#6a9a6a", fontFamily: "monospace", fontSize: 12, minHeight: 16 }}
          >
            {displayExpr.length > 30 ? "…" + displayExpr.slice(-29) : displayExpr}
          </div>
          <div
            className="w-full text-right font-bold leading-none"
            style={{
              color: preview.ok || !expr ? "#c8e6c0" : "#e07070",
              fontFamily: "monospace",
              fontSize: displayResult.length > 11 ? 22
                      : displayResult.length > 8  ? 28 : 36,
            }}
          >
            {displayResult}
          </div>
        </div>

        {/* Button grid — fills remaining height */}
        <div
          className="px-2 pb-2 grid grid-cols-5"
          style={{
            flex: 1,
            gap: 4,
            gridTemplateRows: "repeat(8, 1fr)",
            minHeight: 0,
          }}
        >
          {BUTTONS.map((btn, i) => {
            const isShiftActive = shiftOn && btn.kind.t === "special" && btn.kind.v === "SHIFT";
            const colorKey   = btn.color ?? "normal";
            const colorClass = isShiftActive
              ? "bg-orange-500 text-white shadow-[inset_0_-2px_0_rgba(0,0,0,0.4)]"
              : COLOR_MAP[colorKey];

            let mainLabel = btn.label;
            if (shiftOn && btn.kind.t === "fn" && SHIFT_MAP[btn.kind.v]) {
              mainLabel = btn.sub || btn.label;
            }

            return (
              <button
                key={i}
                onPointerDown={(e) => {
                  e.preventDefault();
                  handleBtn(btn, shiftOn);
                }}
                className={`
                  relative flex flex-col items-center justify-center
                  rounded-xl select-none active:scale-95
                  transition-transform duration-75 w-full h-full
                  ${colorClass}
                `}
              >
                {btn.sub && (
                  <span
                    className="absolute top-0.5 left-0 right-0 text-center leading-none"
                    style={{
                      fontSize: 7,
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
                      typeof mainLabel === "string" && mainLabel.length > 3 ? 11 : 15,
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
