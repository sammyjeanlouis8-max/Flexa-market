import assert from "node:assert/strict";
import test from "node:test";
import { solveProblem } from "./problemSolver";

test("solves quadratic equation", () => {
  const r = solveProblem("2x^2-3x-2=0");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.match(r.result, /2/);
    assert.match(r.result, /-0\.5|−0\.5|-\/?1\/?2/);
  }
});

test("solves kinetic energy with values", () => {
  const r = solveProblem("kinetic energy m=2 v=3");
  assert.equal(r.ok, true);
  if (r.ok) assert.match(r.result, /^9/);
});

test("solves triangle area NL", () => {
  const r = solveProblem("area of a triangle 10 4");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.result, "20");
});

test("direct math expression", () => {
  const r = solveProblem("calculate 12*8+4");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.result.replace(/,/g, ""), "100");
});

test("unsupported problem does not invent answer", () => {
  const r = solveProblem("prove the Riemann hypothesis");
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.error.length > 0);
});

test("empty input", () => {
  const r = solveProblem("  ");
  assert.equal(r.ok, false);
});
