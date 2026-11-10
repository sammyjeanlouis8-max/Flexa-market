import { useCallback, useState } from "react";
import { Copy, Delete, History } from "lucide-react";
import { evaluateExpression } from "../engine/evaluate";
import type { HistoryEntry } from "../types";

type Key =
  | { label: string; action: string; tone?: "num" | "op" | "ac" | "fn"; span?: 2 }
  | { label: React.ReactNode; action: string; tone?: "num" | "op" | "ac" | "fn"; span?: 2 };

const KEYS: Key[][] = [
  [
    { label: "AC", action: "AC", tone: "ac" },
    { label: <Delete className="w-4 h-4" />, action: "DEL", tone: "fn" },
    { label: "%", action: "%", tone: "fn" },
    { label: "÷", action: "÷", tone: "op" },
  ],
  [
    { label: "7", action: "7", tone: "num" },
    { label: "8", action: "8", tone: "num" },
    { label: "9", action: "9", tone: "num" },
    { label: "×", action: "×", tone: "op" },
  ],
  [
    { label: "4", action: "4", tone: "num" },
    { label: "5", action: "5", tone: "num" },
    { label: "6", action: "6", tone: "num" },
    { label: "−", action: "−", tone: "op" },
  ],
  [
    { label: "1", action: "1", tone: "num" },
    { label: "2", action: "2", tone: "num" },
    { label: "3", action: "3", tone: "num" },
    { label: "+", action: "+", tone: "op" },
  ],
  [
    { label: "( )", action: "()", tone: "fn" },
    { label: "0", action: "0", tone: "num" },
    { label: ".", action: ".", tone: "num" },
    { label: "=", action: "=", tone: "op" },
  ],
];

const TONE: Record<string, string> = {
  num: "bg-[#2a2a2a] text-white active:bg-[#222]",
  op: "bg-[#ff8a00] text-white active:bg-[#e67a00]",
  ac: "bg-[#e53935] text-white active:bg-[#c62828]",
  fn: "bg-[#3a3a3a] text-white active:bg-[#303030]",
};

interface Props {
  history: HistoryEntry[];
  onHistory: (entry: HistoryEntry) => void;
}

export function NormalMode({ history, onHistory }: Props) {
  const [expr, setExpr] = useState("");
  const [display, setDisplay] = useState("0");
  const [isResult, setIsResult] = useState(false);
  const [parenOpen, setParenOpen] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  const append = useCallback((s: string) => {
    setExpr((prev) => {
      if (isResult && /[0-9.]/.test(s)) {
        setIsResult(false);
        return s;
      }
      setIsResult(false);
      return prev + s;
    });
  }, [isResult]);

  const handle = (action: string) => {
    switch (action) {
      case "AC":
        setExpr("");
        setDisplay("0");
        setIsResult(false);
        setParenOpen(0);
        break;
      case "DEL":
        setExpr((prev) => prev.slice(0, -1));
        setIsResult(false);
        break;
      case "%":
        append("%");
        break;
      case "()":
        setExpr((prev) => {
          const nextOpen = parenOpen;
          if (nextOpen > 0 && (/[0-9.)]$/.test(prev) || prev.endsWith("%"))) {
            setParenOpen((n) => Math.max(0, n - 1));
            setIsResult(false);
            return prev + ")";
          }
          setParenOpen((n) => n + 1);
          setIsResult(false);
          return prev + "(";
        });
        break;
      case "=": {
        const ev = evaluateExpression(expr || "0", "DEG");
        if (ev.ok) {
          setDisplay(ev.formatted);
          setExpr(String(ev.value));
          setIsResult(true);
          onHistory({
            id: `${Date.now()}`,
            expression: expr,
            result: ev.formatted,
            at: Date.now(),
          });
        } else {
          setDisplay(ev.error);
          setIsResult(true);
        }
        break;
      }
      case "+/-":
        setExpr((prev) => {
          if (!prev) return "-";
          if (prev.startsWith("-")) return prev.slice(1);
          return `-(${prev})`;
        });
        break;
      default:
        if ("÷×−+".includes(action)) {
          if (isResult) setIsResult(false);
          append(action);
        } else {
          append(action);
        }
    }
  };

  // Live preview
  const preview = expr ? evaluateExpression(expr, "DEG") : null;
  let big = "0";
  if (isResult) {
    big = display;
  } else if (preview?.ok) {
    big = preview.formatted;
  } else if (expr) {
    big = "…";
  }

  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(String(big));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full max-w-md mx-auto">
      <div
        className="rounded-2xl px-4 pt-4 pb-3"
        style={{ background: "#141414", border: "1px solid #242424" }}
      >
        <div className="flex items-start justify-between gap-2 mb-1">
          <div
            className="text-right flex-1 text-sm break-all"
            style={{ color: "#8a8a8a", minHeight: 20, fontFamily: "ui-monospace, monospace" }}
          >
            {expr || "0"}
          </div>
          <div className="flex gap-1 flex-shrink-0">
            <button
              type="button"
              aria-label="Copy result"
              onClick={copyResult}
              className="p-1.5 rounded-lg"
              style={{ background: "#222", color: copied ? "#39ff14" : "#aaa" }}
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              aria-label="History"
              onClick={() => setShowHistory((s) => !s)}
              className="p-1.5 rounded-lg"
              style={{ background: "#222", color: showHistory ? "#39ff14" : "#aaa" }}
            >
              <History className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div
          className="text-right font-bold tabular-nums leading-none break-all"
          style={{
            color: "#fff",
            fontSize: String(big).length > 12 ? 28 : String(big).length > 8 ? 36 : 44,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          }}
        >
          {big}
        </div>
        <button
          type="button"
          onClick={() => handle("+/-")}
          className="mt-2 text-xs px-2 py-1 rounded"
          style={{ background: "#222", color: "#aaa" }}
        >
          +/−
        </button>
      </div>

      {showHistory && (
        <div
          className="rounded-xl p-3 max-h-36 overflow-y-auto text-sm"
          style={{ background: "#121212", border: "1px solid #2a2a2a", color: "#ccc" }}
        >
          {history.length === 0 ? (
            <p style={{ color: "#666" }}>No history yet.</p>
          ) : (
            history.slice(0, 20).map((h) => (
              <button
                key={h.id}
                type="button"
                className="block w-full text-left py-1 border-b border-[#222] last:border-0"
                onClick={() => {
                  setExpr(h.result.replace(/,/g, ""));
                  setDisplay(h.result);
                  setIsResult(true);
                }}
              >
                <span style={{ color: "#888" }}>{h.expression}</span>
                <span className="float-right text-[#39ff14]">{h.result}</span>
              </button>
            ))
          )}
        </div>
      )}

      <div className="grid grid-cols-4 gap-2.5">
        {KEYS.flat().map((k, i) => (
          <button
            key={i}
            type="button"
            aria-label={typeof k.label === "string" ? k.label : k.action}
            onClick={() => handle(k.action)}
            onPointerDown={(e) => {
              // Prefer pointer for touch; prevent ghost click double-fire on touch devices.
              if (e.pointerType === "touch") {
                e.preventDefault();
                handle(k.action);
              }
            }}
            className={`h-14 rounded-2xl font-semibold text-xl flex items-center justify-center select-none active:scale-95 transition-transform ${TONE[k.tone ?? "num"]}`}
          >
            {k.label}
          </button>
        ))}
      </div>
    </div>
  );
}
