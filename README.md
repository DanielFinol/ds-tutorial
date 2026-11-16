# Data Science at Work

An interactive, exercise-driven tutorial in the practical skills of a working data scientist. It assumes you know the theory and basic Python; it teaches the tools, habits and gotchas of the day job. Every code cell runs **in the browser** (Python via [Pyodide](https://pyodide.org), SQL via DuckDB), with no server and no sign-up, and the site works offline once installed as a PWA.

**Live site:** https://danielfinol.github.io/ds-tutorial/

## What's in it

Fifteen lessons, all built on one fictional company's data (an online retailer, "Bramble"), each a sequence of realistic tasks with automatically checked exercises, hints and solutions. Tools that can't run in a browser are covered in "On your machine" labs with exact commands.

| Module | Lessons |
| --- | --- |
| Working with data | First ticket · SQL · pandas · Cleaning a messy export · Parquet, DuckDB and Polars |
| Analysis and experiments | Analysis that answers the question · A/B tests · Regression for business questions |
| Predictive modelling | Features, leakage and pipelines · Gradient boosting and tuning · Evaluating for a decision · Forecasting |
| Shipping your work | LLMs in the data workflow · From notebook to project · Shipping and monitoring |

## Stack

| Piece | Choice |
| --- | --- |
| Site generator | [Astro 7](https://astro.build), static output, lessons in MDX |
| Python runtime | Pyodide (loaded from `cdn.jsdelivr.net`) in a Web Worker |
| Code editor | CodeMirror 6 |
| Practice data | `src/lib/py/dsw.py`: generated deterministically in Python; also served at `/dsw.py` for the local labs |
| Offline / install | Generated service worker (`src/pages/sw.js.ts`) + web manifest |
| Tests | Playwright end-to-end against the production build: every cell of every lesson is run |
| Hosting | GitHub Pages via GitHub Actions |

## Develop

Requires Node ≥ 22.23 and pnpm 10.

```bash
pnpm install
pnpm dev            # http://localhost:4321/ds-tutorial/
pnpm build          # type-check + static build into dist/
pnpm test:e2e       # Playwright (needs a fresh `pnpm build`)
```

For a fast loop while writing lessons, `scripts/check_lessons.py` runs lesson code natively (it needs a Python environment with pandas, duckdb, polars, pyarrow, scikit-learn, statsmodels, lightgbm, matplotlib, pydantic and pytest):

```bash
python scripts/check_lessons.py -v 07      # lessons whose file name starts with 07
```

The browser test is the real gate: Pyodide is 32-bit WebAssembly and some packages are built with fewer features there (see `CLAUDE.md`).

## Writing a lesson

Add `src/content/lessons/NN-slug.mdx`:

```mdx
---
title: "My lesson"
description: "One-sentence summary."
module: "Working with data"
order: 16
minutes: 30
tools: ["pandas"]
---
import PyCell from '../../components/PyCell.astro';
import Lab from '../../components/Lab.astro';

<PyCell code={`
import dsw
orders = dsw.load("orders")
orders.head()
`} />

<PyCell
  code={`answer = ...`}
  check={`assert answer == len(orders), "Hint shown to the learner"`}
  hint="Use `len(...)`."
  solution={`answer = len(orders)`}
/>

<PyCell lang="sql" code={`SELECT count(*) AS n FROM orders`} />

<Lab title="Do it locally" time="10 min">
Commands for tools that can't run in a browser.
</Lab>
```

- Cells on one page share a Python namespace; running a cell first runs any earlier cells that haven't run.
- The last expression is displayed; DataFrames render as tables; matplotlib figures render as images.
- An exercise has a `check` (assertions run after the learner's code; the assertion message is the feedback) and a `solution`. The test suite requires that the starter code does **not** pass and the solution **does**.
- SQL cells run in DuckDB; the result is stored in `result` for checks. Call `dsw.register_duckdb()` in an earlier cell.

## Deploying

Pushes to `main` run `.github/workflows/deploy.yml` (GitHub Pages, source: GitHub Actions).
