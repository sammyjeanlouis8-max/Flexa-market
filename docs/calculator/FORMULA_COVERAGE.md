# Flexa Market Advanced Calculator — Formula Coverage

**Scope:** Website calculator only (`artifacts/marketplace`).  
**Status:** Extensible verified subset — **not** a claim of complete scientific coverage.

## Engines

| Library | Role | License |
|---------|------|---------|
| [math.js](https://mathjs.org/) | Deterministic evaluation, matrices, stats, complex | Apache-2.0 |
| [KaTeX](https://katex.org/) | Math typesetting | MIT |

**Not used:** `eval()`, `new Function()`, paid external solve APIs.

## Categories (current)

| Category | Topics included | Count (approx.) |
|----------|-----------------|-----------------|
| Mathematics | Algebra, Geometry, Calculus, Linear algebra | ~14 |
| Trigonometry | Identities, solving triangles | ~4 |
| Statistics / Probability | Mean, variance, binomial, z-score | ~5 |
| Physics | Motion, forces, energy, electricity, magnetism, waves, optics, thermo | ~12 |
| Chemistry | Concentration, gas laws, stoichiometry, equilibrium, electrochemistry | ~11 |
| Engineering | Materials, fluids, electrical | ~7 |

Exact count is exported as `FORMULA_COUNT` from `formulas/database.ts`.

## Quality rules

Every formula record includes: unique `id`, name, category, expression, LaTeX, description, variables, example, authoritative `reference`, and search keywords (with optional EN/HT/FR/ES terms).

## Explicitly out of scope (for now)

- Exhaustive formula encyclopedias
- General symbolic CAS / arbitrary differential equations
- Unverified AI-invented identities
- Paid cloud math APIs

## Extension

Add records to `artifacts/marketplace/src/features/calculator/formulas/database.ts` with a cited reference; add solver patterns only when deterministic verification exists.
