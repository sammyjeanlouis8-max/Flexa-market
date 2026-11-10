import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import {
  analyzeExpression,
  numericalDerivative,
  numericalIntegral,
  sampleFunction,
} from "../graph/analyze";
import { compileFunction, evaluateExpression, math } from "../engine/evaluate";
import type { GraphViewport } from "../types";

type Tool = "graph" | "table" | "matrix" | "stat" | "equation" | "calculus" | "solve" | "prob";

const TOOLS: { id: Tool; label: string }[] = [
  { id: "graph", label: "Graph" },
  { id: "table", label: "Table" },
  { id: "matrix", label: "Matrix" },
  { id: "stat", label: "Stat" },
  { id: "equation", label: "Equation" },
  { id: "calculus", label: "Calculus" },
  { id: "solve", label: "Solve" },
  { id: "prob", label: "Prob." },
];

interface Props {
  initialExpr?: string;
}

export function GraphMode({ initialExpr = "sin(x)" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [expr, setExpr] = useState(initialExpr);
  const [editExpr, setEditExpr] = useState(initialExpr);
  const [editing, setEditing] = useState(false);
  const [tool, setTool] = useState<Tool>("graph");
  const [viewport, setViewport] = useState<GraphViewport>({
    xMin: -2 * Math.PI,
    xMax: 2 * Math.PI,
    yMin: -2,
    yMax: 2,
  });
  const [dragging, setDragging] = useState<{ x: number; y: number } | null>(null);
  const [secondExpr, setSecondExpr] = useState("");

  useEffect(() => {
    if (initialExpr) {
      setExpr(initialExpr);
      setEditExpr(initialExpr);
    }
  }, [initialExpr]);

  const analysis = useMemo(
    () => analyzeExpression(expr, viewport, "RAD"),
    [expr, viewport],
  );

  // Draw graph
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, cssW, cssH);

    const { xMin, xMax, yMin, yMax } = viewport;
    const sx = (x: number) => ((x - xMin) / (xMax - xMin)) * cssW;
    const sy = (y: number) => cssH - ((y - yMin) / (yMax - yMin)) * cssH;

    // Grid
    ctx.strokeStyle = "#1a3d1a";
    ctx.lineWidth = 1;
    const xStep = Math.PI / 2;
    for (let x = Math.ceil(xMin / xStep) * xStep; x <= xMax; x += xStep) {
      ctx.beginPath();
      ctx.moveTo(sx(x), 0);
      ctx.lineTo(sx(x), cssH);
      ctx.stroke();
    }
    const yStep = 0.5;
    for (let y = Math.ceil(yMin / yStep) * yStep; y <= yMax; y += yStep) {
      ctx.beginPath();
      ctx.moveTo(0, sy(y));
      ctx.lineTo(cssW, sy(y));
      ctx.stroke();
    }

    // Axes
    ctx.strokeStyle = "#39ff14";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx(xMin), sy(0));
    ctx.lineTo(sx(xMax), sy(0));
    ctx.moveTo(sx(0), sy(yMin));
    ctx.lineTo(sx(0), sy(yMax));
    ctx.stroke();

    // Labels
    ctx.fillStyle = "#6a9a6a";
    ctx.font = "10px monospace";
    const ticks = [-2, -1, 1, 2].map((k) => k * Math.PI);
    for (const t of ticks) {
      if (t < xMin || t > xMax) continue;
      const label =
        Math.abs(t + 2 * Math.PI) < 1e-6
          ? "-2π"
          : Math.abs(t + Math.PI) < 1e-6
            ? "-π"
            : Math.abs(t - Math.PI) < 1e-6
              ? "π"
              : Math.abs(t - 2 * Math.PI) < 1e-6
                ? "2π"
                : t.toFixed(1);
      ctx.fillText(label, sx(t) + 2, sy(0) - 4);
    }
    ctx.fillText("x", cssW - 12, sy(0) - 6);
    ctx.fillText("y", sx(0) + 4, 12);

    const fn = compileFunction(expr, "RAD");
    if (fn) {
      const pts = sampleFunction(fn, xMin, xMax, 600);
      ctx.strokeStyle = "#39ff14";
      ctx.lineWidth = 2;
      ctx.beginPath();
      let started = false;
      for (const p of pts) {
        if (!Number.isFinite(p.y) || p.y < yMin - 5 || p.y > yMax + 5) {
          started = false;
          continue;
        }
        if (!started) {
          ctx.moveTo(sx(p.x), sy(p.y));
          started = true;
        } else {
          ctx.lineTo(sx(p.x), sy(p.y));
        }
      }
      ctx.stroke();
    }

    if (secondExpr.trim()) {
      const fn2 = compileFunction(secondExpr, "RAD");
      if (fn2) {
        const pts = sampleFunction(fn2, xMin, xMax, 600);
        ctx.strokeStyle = "#ff8a00";
        ctx.lineWidth = 2;
        ctx.beginPath();
        let started = false;
        for (const p of pts) {
          if (!Number.isFinite(p.y)) {
            started = false;
            continue;
          }
          if (!started) {
            ctx.moveTo(sx(p.x), sy(p.y));
            started = true;
          } else ctx.lineTo(sx(p.x), sy(p.y));
        }
        ctx.stroke();
      }
    }
  }, [expr, secondExpr, viewport]);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDragging({ x: e.clientX, y: e.clientY });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const dx = e.clientX - dragging.x;
    const dy = e.clientY - dragging.y;
    setDragging({ x: e.clientX, y: e.clientY });
    const xRange = viewport.xMax - viewport.xMin;
    const yRange = viewport.yMax - viewport.yMin;
    const dxu = (-dx / rect.width) * xRange;
    const dyu = (dy / rect.height) * yRange;
    setViewport((v) => ({
      xMin: v.xMin + dxu,
      xMax: v.xMax + dxu,
      yMin: v.yMin + dyu,
      yMax: v.yMax + dyu,
    }));
  };
  const onPointerUp = () => setDragging(null);

  const zoom = (factor: number) => {
    setViewport((v) => {
      const cx = (v.xMin + v.xMax) / 2;
      const cy = (v.yMin + v.yMax) / 2;
      const hx = ((v.xMax - v.xMin) / 2) * factor;
      const hy = ((v.yMax - v.yMin) / 2) * factor;
      return { xMin: cx - hx, xMax: cx + hx, yMin: cy - hy, yMax: cy + hy };
    });
  };

  const applyExpr = () => {
    setExpr(editExpr.trim() || "sin(x)");
    setEditing(false);
    setTool("graph");
  };

  const tableRows = useMemo(() => {
    const fn = compileFunction(expr, "RAD");
    if (!fn) return [];
    const rows: Array<{ x: number; y: number }> = [];
    for (let i = -5; i <= 5; i++) {
      const x = (i * Math.PI) / 4;
      const y = fn(x);
      rows.push({ x, y });
    }
    return rows;
  }, [expr]);

  const matrixResult = useMemo(() => {
    try {
      const A = math.matrix([
        [1, 2],
        [3, 4],
      ]);
      const det = math.det(A);
      const inv = math.inv(A);
      return { det: math.format(det, { precision: 8 }), inv: math.format(inv, { precision: 6 }) };
    } catch (e) {
      return { det: "—", inv: String(e) };
    }
  }, []);

  const statResult = useMemo(() => {
    const data = [2, 4, 4, 4, 5, 5, 7, 9];
    return {
      mean: math.format(math.mean(data), { precision: 6 }),
      std: math.format(math.std(data), { precision: 6 }),
      median: math.format(math.median(data), { precision: 6 }),
    };
  }, []);

  const fn = compileFunction(expr, "RAD");
  const calcDeriv = fn ? numericalDerivative(fn, Math.PI / 4) : NaN;
  const calcInt = fn ? numericalIntegral(fn, 0, Math.PI) : NaN;

  return (
    <div className="w-full max-w-md mx-auto flex flex-col gap-3">
      <div
        className="rounded-xl overflow-hidden relative"
        style={{ border: "1px solid #1a3d1a", background: "#0a0a0a" }}
      >
        <canvas
          ref={canvasRef}
          className="w-full touch-none"
          style={{ height: 220, display: "block" }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        />
        <div className="absolute top-2 right-2 flex gap-1">
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => zoom(0.7)}
            className="w-8 h-8 rounded-lg text-sm font-bold"
            style={{ background: "#1a1a1a", color: "#39ff14", border: "1px solid #2a2a2a" }}
          >
            +
          </button>
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => zoom(1.4)}
            className="w-8 h-8 rounded-lg text-sm font-bold"
            style={{ background: "#1a1a1a", color: "#39ff14", border: "1px solid #2a2a2a" }}
          >
            −
          </button>
        </div>
      </div>

      <div
        className="flex items-center gap-2 rounded-xl px-3 py-2"
        style={{ background: "#141414", border: "1px solid #2a2a2a" }}
      >
        {editing ? (
          <>
            <span className="text-[#39ff14] text-sm">f(x)=</span>
            <input
              value={editExpr}
              onChange={(e) => setEditExpr(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyExpr()}
              className="flex-1 bg-transparent text-white text-sm outline-none"
              aria-label="Function expression"
              autoFocus
            />
            <button
              type="button"
              onClick={applyExpr}
              className="text-xs px-2 py-1 rounded"
              style={{ background: "#39ff14", color: "#000" }}
            >
              Plot
            </button>
          </>
        ) : (
          <>
            <span className="flex-1 text-sm text-white font-mono">
              f(x) = {expr}
            </span>
            <button
              type="button"
              aria-label="Edit function"
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-lg"
              style={{ background: "#222", color: "#39ff14" }}
            >
              <Pencil className="w-4 h-4" />
            </button>
          </>
        )}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {TOOLS.map((t) => {
          const active = tool === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTool(t.id)}
              className="h-12 rounded-xl text-xs font-semibold"
              style={{
                background: active ? "#39ff14" : "#1a1a1a",
                color: active ? "#000" : "#ccc",
                border: active ? "1px solid #39ff14" : "1px solid #2a2a2a",
              }}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      <div
        className="rounded-xl p-3 text-sm"
        style={{ background: "#121212", border: "1px solid #222", color: "#ddd" }}
      >
        {tool === "graph" && analysis && (
          <div className="space-y-1">
            <div className="font-semibold text-[#39ff14] mb-1">Key Results</div>
            <div>
              <span style={{ color: "#888" }}>Zeros: </span>
              {analysis.zeros.length
                ? analysis.zeros.map((z) => z.toPrecision(4)).join(", ")
                : "none in window"}
            </div>
            <div>
              <span style={{ color: "#888" }}>y-intercept: </span>
              {analysis.yIntercept ?? "—"}
            </div>
            <div>
              <span style={{ color: "#888" }}>Max: </span>
              {analysis.localMax[0]
                ? `y=${analysis.localMax[0].y} at x=${analysis.localMax[0].x}`
                : "—"}
            </div>
            <div>
              <span style={{ color: "#888" }}>Min: </span>
              {analysis.localMin[0]
                ? `y=${analysis.localMin[0].y} at x=${analysis.localMin[0].x}`
                : "—"}
            </div>
            <div>
              <span style={{ color: "#888" }}>Period hint: </span>
              {analysis.periodHint ?? "not detected"}
            </div>
          </div>
        )}

        {tool === "table" && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "#39ff14" }}>
                  <th className="text-left py-1">x</th>
                  <th className="text-left py-1">f(x)</th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((r, i) => (
                  <tr key={i} className="border-t border-[#222]">
                    <td className="py-1 font-mono">{r.x.toPrecision(4)}</td>
                    <td className="py-1 font-mono">
                      {Number.isFinite(r.y) ? r.y.toPrecision(6) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tool === "matrix" && (
          <div className="space-y-1 text-xs">
            <div>Demo matrix A = [[1,2],[3,4]]</div>
            <div>det(A) = {matrixResult.det}</div>
            <div>inv(A) = {matrixResult.inv}</div>
            <div style={{ color: "#888" }}>Enter custom matrices in Scientific via det([[…]]).</div>
          </div>
        )}

        {tool === "stat" && (
          <div className="space-y-1 text-xs">
            <div>Sample data: [2,4,4,4,5,5,7,9]</div>
            <div>mean = {statResult.mean}</div>
            <div>std (pop) = {statResult.std}</div>
            <div>median = {statResult.median}</div>
          </div>
        )}

        {tool === "equation" && (
          <div className="space-y-2 text-xs">
            <label className="block">
              Second curve g(x) for intersections
              <input
                value={secondExpr}
                onChange={(e) => setSecondExpr(e.target.value)}
                placeholder="e.g. 0.5"
                className="mt-1 w-full rounded-lg px-2 py-1.5 bg-[#1a1a1a] border border-[#333] text-white"
              />
            </label>
            {secondExpr && analysis && (
              <div>
                Intersections approx:{" "}
                {analyzeExpression(`(${expr})-(${secondExpr})`, viewport, "RAD")
                  ?.zeros.map((z) => z.toPrecision(4))
                  .join(", ") || "none"}
              </div>
            )}
          </div>
        )}

        {tool === "calculus" && (
          <div className="space-y-1 text-xs">
            <div>
              f′(π/4) ≈ {Number.isFinite(calcDeriv) ? calcDeriv.toPrecision(6) : "—"}
            </div>
            <div>
              ∫₀^π f(x) dx ≈ {Number.isFinite(calcInt) ? calcInt.toPrecision(6) : "—"}
            </div>
            <div style={{ color: "#888" }}>
              Numerical derivative (central difference) and Simpson integral — not symbolic CAS.
            </div>
          </div>
        )}

        {tool === "solve" && (
          <SolvePanel />
        )}

        {tool === "prob" && (
          <div className="space-y-1 text-xs">
            <div>
              normalpdf(0) ={" "}
              {evaluateExpression("normalpdf(0)", "RAD").ok
                ? (evaluateExpression("normalpdf(0)", "RAD") as { formatted: string }).formatted
                : "—"}
            </div>
            <div>
              normalcdf(-1,1) ≈{" "}
              {evaluateExpression("normalcdf(-1,1)", "RAD").ok
                ? (evaluateExpression("normalcdf(-1,1)", "RAD") as { formatted: string }).formatted
                : "—"}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SolvePanel() {
  const [a, setA] = useState("1");
  const [b, setB] = useState("-3");
  const [c, setC] = useState("2");
  const result = useMemo(() => {
    const ev = evaluateExpression(
      `(-(${b})+sqrt((${b})^2-4*(${a})*(${c})))/(2*(${a}))`,
      "RAD",
    );
    const ev2 = evaluateExpression(
      `(-(${b})-sqrt((${b})^2-4*(${a})*(${c})))/(2*(${a}))`,
      "RAD",
    );
    if (!ev.ok) return ev.error;
    if (!ev2.ok) return ev2.error;
    return `x₁=${ev.formatted}, x₂=${ev2.formatted}`;
  }, [a, b, c]);

  return (
    <div className="space-y-2 text-xs">
      <div>Quadratic ax²+bx+c=0</div>
      <div className="grid grid-cols-3 gap-2">
        {[
          ["a", a, setA],
          ["b", b, setB],
          ["c", c, setC],
        ].map(([label, val, set]) => (
          <label key={label as string} className="block">
            {label as string}
            <input
              value={val as string}
              onChange={(e) => (set as (s: string) => void)(e.target.value)}
              className="mt-1 w-full rounded px-2 py-1 bg-[#1a1a1a] border border-[#333] text-white"
            />
          </label>
        ))}
      </div>
      <div className="text-[#39ff14]">{result}</div>
    </div>
  );
}
