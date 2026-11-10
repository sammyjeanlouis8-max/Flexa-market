import type { GraphAnalysis, GraphViewport } from "../types";
import { compileFunction } from "../engine/evaluate";

const SAMPLE = 800;

export function sampleFunction(
  fn: (x: number) => number,
  xMin: number,
  xMax: number,
  samples = SAMPLE,
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [];
  const step = (xMax - xMin) / samples;
  for (let i = 0; i <= samples; i++) {
    const x = xMin + step * i;
    const y = fn(x);
    if (Number.isFinite(y)) pts.push({ x, y });
  }
  return pts;
}

export function findZeros(
  fn: (x: number) => number,
  xMin: number,
  xMax: number,
): number[] {
  const zeros: number[] = [];
  const step = (xMax - xMin) / SAMPLE;
  let prevX = xMin;
  let prevY = fn(xMin);

  for (let i = 1; i <= SAMPLE; i++) {
    const x = xMin + step * i;
    const y = fn(x);
    if (!Number.isFinite(prevY) || !Number.isFinite(y)) {
      prevX = x;
      prevY = y;
      continue;
    }
    if (prevY === 0) {
      pushUnique(zeros, prevX);
    } else if (prevY * y < 0) {
      // Bisection refine
      let a = prevX;
      let b = x;
      let fa = prevY;
      for (let k = 0; k < 40; k++) {
        const m = (a + b) / 2;
        const fm = fn(m);
        if (!Number.isFinite(fm)) break;
        if (fa * fm <= 0) {
          b = m;
        } else {
          a = m;
          fa = fm;
        }
      }
      pushUnique(zeros, (a + b) / 2);
    }
    prevX = x;
    prevY = y;
  }
  return zeros;
}

function pushUnique(arr: number[], v: number, eps = 1e-4) {
  if (arr.some((x) => Math.abs(x - v) < eps)) return;
  arr.push(Number(v.toPrecision(8)));
}

export function findLocalExtrema(
  fn: (x: number) => number,
  xMin: number,
  xMax: number,
): { max: Array<{ x: number; y: number }>; min: Array<{ x: number; y: number }> } {
  const max: Array<{ x: number; y: number }> = [];
  const min: Array<{ x: number; y: number }> = [];
  const step = (xMax - xMin) / SAMPLE;
  const ys: number[] = [];
  const xs: number[] = [];
  for (let i = 0; i <= SAMPLE; i++) {
    const x = xMin + step * i;
    xs.push(x);
    ys.push(fn(x));
  }
  for (let i = 1; i < ys.length - 1; i++) {
    const a = ys[i - 1];
    const b = ys[i];
    const c = ys[i + 1];
    if (![a, b, c].every(Number.isFinite)) continue;
    if (b > a && b > c) max.push({ x: Number(xs[i].toPrecision(8)), y: Number(b.toPrecision(8)) });
    if (b < a && b < c) min.push({ x: Number(xs[i].toPrecision(8)), y: Number(b.toPrecision(8)) });
  }
  return { max: max.slice(0, 8), min: min.slice(0, 8) };
}

export function numericalDerivative(fn: (x: number) => number, x: number, h = 1e-6): number {
  const yp = fn(x + h);
  const ym = fn(x - h);
  if (!Number.isFinite(yp) || !Number.isFinite(ym)) return NaN;
  return (yp - ym) / (2 * h);
}

/** Composite Simpson's rule */
export function numericalIntegral(
  fn: (x: number) => number,
  a: number,
  b: number,
  n = 256,
): number {
  if (a === b) return 0;
  if (n % 2 === 1) n += 1;
  const h = (b - a) / n;
  let sum = fn(a) + fn(b);
  for (let i = 1; i < n; i++) {
    const y = fn(a + i * h);
    if (!Number.isFinite(y)) continue;
    sum += i % 2 === 0 ? 2 * y : 4 * y;
  }
  return (h / 3) * sum;
}

export function detectPeriodHint(expr: string): string | null {
  const e = expr.replace(/\s+/g, "").toLowerCase();
  if (/^sin\(x\)$/.test(e) || /^cos\(x\)$/.test(e)) return "2π";
  if (/^tan\(x\)$/.test(e)) return "π";
  const m = e.match(/sin\((\d+(?:\.\d+)?)\*?x\)/) || e.match(/cos\((\d+(?:\.\d+)?)\*?x\)/);
  if (m) {
    const k = Number(m[1]);
    if (k > 0) return `${(2 * Math.PI) / k} (≈ ${(2 * Math.PI / k).toPrecision(4)})`;
  }
  return null;
}

export function analyzeExpression(
  expr: string,
  viewport: GraphViewport,
  angle: "DEG" | "RAD" = "RAD",
): GraphAnalysis | null {
  const fn = compileFunction(expr, angle);
  if (!fn) return null;

  const zeros = findZeros(fn, viewport.xMin, viewport.xMax);
  const y0 = fn(0);
  const extrema = findLocalExtrema(fn, viewport.xMin, viewport.xMax);
  const mid = (viewport.xMin + viewport.xMax) / 2;
  const dy = numericalDerivative(fn, mid);
  const integral = numericalIntegral(fn, viewport.xMin, Math.min(viewport.xMax, viewport.xMin + Math.PI));

  return {
    zeros,
    yIntercept: Number.isFinite(y0) ? Number(y0.toPrecision(8)) : null,
    localMax: extrema.max,
    localMin: extrema.min,
    periodHint: detectPeriodHint(expr),
    derivativeAt: Number.isFinite(dy)
      ? { x: Number(mid.toPrecision(6)), dy: Number(dy.toPrecision(8)) }
      : undefined,
    integralApprox: {
      from: viewport.xMin,
      to: Math.min(viewport.xMax, viewport.xMin + Math.PI),
      value: Number(integral.toPrecision(8)),
    },
  };
}

export function findIntersections(
  exprA: string,
  exprB: string,
  viewport: GraphViewport,
  angle: "DEG" | "RAD" = "RAD",
): number[] {
  const a = compileFunction(exprA, angle);
  const b = compileFunction(exprB, angle);
  if (!a || !b) return [];
  return findZeros((x) => a(x) - b(x), viewport.xMin, viewport.xMax);
}
