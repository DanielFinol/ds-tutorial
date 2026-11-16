# Data Science at Work

An interactive, exercise-driven tutorial in the practical skills of a working data scientist. It assumes you know the theory and basic Python; it teaches the tools, habits and gotchas of the day job. Every code cell runs **in the browser** (Python via [Pyodide](https://pyodide.org), SQL via DuckDB), with no server and no sign-up, and the site works offline once installed as a PWA.

**Live site:** https://danielfinol.github.io/ds-tutorial/ · **En español:** https://danielfinol.github.io/ds-tutorial/es/

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

## Translations

The site is available in English and Spanish (`/es/`). Lesson code is single-sourced: a translation only supplies text.

- `i18n/es/<lesson>.txt` holds the Spanish text of every prose block, hint, feedback message and code comment, keyed by a hash of the English text.
- `scripts/i18n.mjs` (run automatically by `pnpm dev` and `pnpm build`) combines the English lesson with its translation file and writes `src/content/lessons/es/<lesson>.mdx`. Those generated files are not committed.
- If English text changes, the build fails and prints the segments that need translating, with their new keys. To see all English segments and keys: `node scripts/i18n.mjs extract some-folder`.
- Interface strings (buttons, navigation, runtime messages) live in `src/lib/i18n.ts`. Feedback from `dsw.same` is translated in `dsw.py` (`_t`).
- Code, data, table and column names, and optional fenced code blocks in the labs stay in English.

To add a language: add it to `LANGS` in `scripts/i18n.mjs` and `src/lib/i18n.ts`, add the interface strings, create `src/pages/<lang>/`, and write the `i18n/<lang>/*.txt` files.

## Deploying

Pushes to `main` run `.github/workflows/deploy.yml` (GitHub Pages, source: GitHub Actions).
