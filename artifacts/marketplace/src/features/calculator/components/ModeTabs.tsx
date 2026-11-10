import type { CalculatorMode } from "../types";

const TABS: { id: CalculatorMode; label: string }[] = [
  { id: "normal", label: "Normal" },
  { id: "scientific", label: "Scientific" },
  { id: "graph", label: "Graph" },
  { id: "formulas", label: "Formulas" },
];

interface Props {
  mode: CalculatorMode;
  onChange: (mode: CalculatorMode) => void;
}

export function ModeTabs({ mode, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="Calculator modes"
      className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      {TABS.map((tab) => {
        const active = mode === tab.id;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(tab.id)}
            className="flex-shrink-0 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#39ff14]"
            style={{
              background: active ? "#39ff14" : "#1a1a1a",
              color: active ? "#0a0a0a" : "#c8c8c8",
              border: active ? "1px solid #39ff14" : "1px solid #2a2a2a",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
