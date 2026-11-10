import { useState } from "react";
import { Link } from "wouter";
import { Calculator as CalcIcon, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/auth";
import {
  FormulasMode,
  GraphMode,
  ModeTabs,
  NormalMode,
  ScientificMode,
  type CalculatorMode,
  type HistoryEntry,
} from "@/features/calculator";

/**
 * Flexa Market Advanced Calculator — website only.
 * Four modes: Normal | Scientific | Graph | Formulas
 */
export default function CalculatorPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<CalculatorMode>("normal");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [graphSeed, setGraphSeed] = useState("sin(x)");

  const pushHistory = (entry: HistoryEntry) => {
    setHistory((prev) => [entry, ...prev].slice(0, 50));
  };

  // Dev-only UI preview (?preview=1) — production still requires auth.
  const allowPreview =
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("preview") === "1";

  if (!user && !allowPreview) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-4">
        <div className="text-center">
          <CalcIcon className="w-10 h-10 mx-auto mb-3 text-[#39ff14]" aria-hidden />
          <p className="text-gray-400 text-sm mb-4">Konekte pou itilize kalkilatè a.</p>
          <Link href="/auth/login">
            <button
              type="button"
              className="flex items-center gap-2 mx-auto bg-orange-500 text-white font-semibold px-5 py-2.5 rounded-xl"
            >
              <ChevronRight className="h-4 w-4" />
              Konekte
            </button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      className="w-full overflow-x-hidden"
      style={{
        background: "linear-gradient(180deg, #050505 0%, #0c0c0c 40%, #101410 100%)",
        minHeight: "calc(100dvh - 56px)",
      }}
    >
      <div className="mx-auto w-full max-w-lg px-3 pt-3 pb-8">
        <header className="mb-3 flex items-center gap-2">
          <CalcIcon className="w-6 h-6 text-[#39ff14]" aria-hidden />
          <h1 className="text-xl font-bold text-white tracking-tight">Calculator</h1>
        </header>

        <div className="mb-4">
          <ModeTabs
            mode={mode}
            onChange={(m) => {
              setMode(m);
            }}
          />
        </div>

        <div
          role="tabpanel"
          aria-label={`${mode} calculator`}
          className="transition-opacity duration-200"
        >
          {mode === "normal" && (
            <NormalMode history={history} onHistory={pushHistory} />
          )}
          {mode === "scientific" && (
            <ScientificMode
              onHistory={pushHistory}
              onOpenGraph={(expr) => {
                setGraphSeed(expr.includes("x") ? expr : "sin(x)");
                setMode("graph");
              }}
            />
          )}
          {mode === "graph" && <GraphMode initialExpr={graphSeed} />}
          {mode === "formulas" && <FormulasMode />}
        </div>

        <p className="mt-6 text-center text-[10px]" style={{ color: "#555" }}>
          Flexa Market Advanced Calculator · math.js + KaTeX · no eval() · verified formula subset
        </p>
      </div>
    </div>
  );
}
