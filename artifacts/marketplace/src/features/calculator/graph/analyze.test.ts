import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeExpression,
  findZeros,
  numericalDerivative,
  numericalIntegral,
  sampleFunction,
} from "./analyze";
import { compileFunction } from "../engine/evaluate";

test("samples sin(x)", () => {
  const fn = compileFunction("sin(x)", "RAD")!;
  const pts = sampleFunction(fn, 0, Math.PI, 100);
  assert.ok(pts.length > 50);
  assert.ok(Math.abs(pts[0].y) < 1e-10);
});

test("finds zeros of sin near kπ", () => {
  const fn = compileFunction("sin(x)", "RAD")!;
  const zeros = findZeros(fn, -0.5, 6.5);
  assert.ok(zeros.some((z) => Math.abs(z) < 1e-3));
  assert.ok(zeros.some((z) => Math.abs(z - Math.PI) < 1e-3));
});

test("derivative of x^2 at 3", () => {
  const fn = compileFunction("x^2", "RAD")!;
  const d = numericalDerivative(fn, 3);
  assert.ok(Math.abs(d - 6) < 1e-4);
});

test("integral of x from 0 to 1", () => {
  const fn = compileFunction("x", "RAD")!;
  const I = numericalIntegral(fn, 0, 1);
  assert.ok(Math.abs(I - 0.5) < 1e-4);
});

test("analyze sin(x) reports period hint", () => {
  const a = analyzeExpression("sin(x)", {
    xMin: -2 * Math.PI,
    xMax: 2 * Math.PI,
    yMin: -2,
    yMax: 2,
  });
  assert.ok(a);
  assert.equal(a!.periodHint, "2π");
  assert.ok(a!.zeros.length >= 3);
});
