import assert from "node:assert/strict";
import test from "node:test";
import { evaluateExpression, compileFunction, normalizeExpression } from "./evaluate";

test("addition / multiplication", () => {
  const r = evaluateExpression("125 × 8", "DEG");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 1000);
});

test("division by zero", () => {
  const r = evaluateExpression("1÷0", "DEG");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "div_zero");
});

test("percent", () => {
  const r = evaluateExpression("50%", "DEG");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 0.5);
});

test("parentheses", () => {
  const r = evaluateExpression("(2+3)×4", "DEG");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 20);
});

test("sin 90 degrees", () => {
  const r = evaluateExpression("sin(90)", "DEG");
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(Math.abs(Number(r.value) - 1) < 1e-10);
});

test("sin π/2 radians", () => {
  const r = evaluateExpression("sin(pi/2)", "RAD");
  assert.equal(r.ok, true);
  if (r.ok) assert.ok(Math.abs(Number(r.value) - 1) < 1e-10);
});

test("sqrt domain error for negative", () => {
  const r = evaluateExpression("sqrt(-1)", "RAD");
  // math.js may return complex — accept either complex string or domain failure
  if (r.ok) {
    assert.ok(String(r.formatted).includes("i") || String(r.value).includes("i"));
  } else {
    assert.ok(r.code === "domain" || r.code === "unknown");
  }
});

test("factorial", () => {
  const r = evaluateExpression("factorial(5)", "DEG");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 120);
});

test("nCr", () => {
  const r = evaluateExpression("nCr(5,2)", "DEG");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 10);
});

test("nPr", () => {
  const r = evaluateExpression("nPr(5,2)", "DEG");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 20);
});

test("log10", () => {
  const r = evaluateExpression("log10(1000)", "DEG");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 3);
});

test("complex i", () => {
  const r = evaluateExpression("i*i", "RAD");
  assert.equal(r.ok, true);
  if (r.ok) {
    const n = typeof r.value === "number" ? r.value : Number(String(r.formatted).replace(/,/g, ""));
    if (Number.isFinite(n)) assert.ok(Math.abs(n + 1) < 1e-10);
    else assert.ok(String(r.formatted).includes("-1") || String(r.value).includes("-1"));
  }
});

test("scientific notation power", () => {
  const r = evaluateExpression("2^10", "DEG");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 1024);
});

test("normalizeExpression maps unicode ops", () => {
  assert.equal(normalizeExpression("3×4÷2", "RAD"), "3*4/2");
});

test("compileFunction sin(x)", () => {
  const fn = compileFunction("sin(x)", "RAD");
  assert.ok(fn);
  assert.ok(Math.abs(fn!(Math.PI / 2) - 1) < 1e-10);
});

test("invalid syntax", () => {
  const r = evaluateExpression("((1+2", "DEG");
  assert.equal(r.ok, false);
});

test("never uses empty as success", () => {
  const r = evaluateExpression("   ", "DEG");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.code, "empty");
});
