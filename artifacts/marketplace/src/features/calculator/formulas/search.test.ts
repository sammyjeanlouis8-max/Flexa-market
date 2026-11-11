import assert from "node:assert/strict";
import test from "node:test";
import { searchFormulas } from "./search";
import { FORMULA_COUNT, FORMULA_DATABASE } from "./database";
import { evaluateWithVariables } from "../engine/evaluate";

test("formula count is positive and stable shape", () => {
  assert.ok(FORMULA_COUNT >= 40);
  assert.equal(FORMULA_DATABASE.length, FORMULA_COUNT);
  for (const f of FORMULA_DATABASE) {
    assert.ok(f.id);
    assert.ok(f.name);
    assert.ok(f.expression);
    assert.ok(f.latex);
    assert.ok(f.description);
    assert.ok(f.reference);
    assert.ok(Array.isArray(f.variables));
    assert.ok(f.example);
    assert.ok(Array.isArray(f.keywords));
  }
});

test("search quadratic formula (English)", () => {
  const hits = searchFormulas("Quadratic formula");
  assert.ok(hits.length > 0);
  assert.equal(hits[0].formula.id, "math-quadratic");
});

test("search kinetic energy natural language", () => {
  const hits = searchFormulas("How to calculate kinetic energy?");
  assert.ok(hits.length > 0);
  assert.equal(hits[0].formula.id, "phys-kinetic-energy");
});

test("search triangle area", () => {
  const hits = searchFormulas("Find the area of a triangle");
  assert.ok(hits.some((h) => h.formula.id === "math-triangle-area"));
});

test("search molar mass / moles", () => {
  const hits = searchFormulas("Calculate molar mass");
  assert.ok(hits.some((h) => h.formula.id === "chem-moles-from-mass"));
});

test("search law of cosines", () => {
  const hits = searchFormulas("Law of cosines");
  assert.equal(hits[0].formula.id, "trig-law-of-cosines");
});

test("Haitian Creole kinetic search", () => {
  const hits = searchFormulas("kalkile enèji sinetik");
  assert.ok(hits.some((h) => h.formula.id === "phys-kinetic-energy"));
});

test("French quadratic search", () => {
  const hits = searchFormulas("formule quadratique");
  assert.ok(hits.some((h) => h.formula.id === "math-quadratic"));
});

test("Spanish cosines search", () => {
  const hits = searchFormulas("ley de los cosenos");
  assert.ok(hits.some((h) => h.formula.id === "trig-law-of-cosines"));
});

test("example computations match verified results", () => {
  const ke = FORMULA_DATABASE.find((f) => f.id === "phys-kinetic-energy")!;
  const r = evaluateWithVariables(ke.compute!, ke.example.inputs);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value, 9);

  const tri = FORMULA_DATABASE.find((f) => f.id === "math-triangle-area")!;
  const t = evaluateWithVariables(tri.compute!, tri.example.inputs);
  assert.equal(t.ok, true);
  if (t.ok) assert.equal(t.value, 20);

  const py = FORMULA_DATABASE.find((f) => f.id === "math-pythagorean")!;
  const p = evaluateWithVariables(py.compute!, py.example.inputs);
  assert.equal(p.ok, true);
  if (p.ok) assert.equal(p.value, 5);
});
