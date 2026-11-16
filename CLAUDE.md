# ds-tutorial

"Data Science at Work": an interactive, exercise-driven tutorial. Astro 7 static site + PWA, hosted on GitHub Pages at base path `/ds-tutorial`. Audience: people who know DS theory and basic Python and need workplace practice. Lessons are concrete tasks on one fictional company's data; avoid theory exposition and year references ("today's workplace", not a year).

## Commands
- `pnpm dev`: dev server at http://localhost:4321/ds-tutorial/
- `pnpm build`: `astro check` + build to `dist/` (must pass before committing)
- `pnpm test:e2e`: Playwright against `astro preview`; run `pnpm build` first. Needs network access to cdn.jsdelivr.net.
- `pnpm exec playwright test lessons -g "07-" --project=desktop --trace off`: one lesson in the browser
- `python scripts/check_lessons.py -v 07`: fast native check of lesson code (needs a Python env with the lesson packages)

## Layout
- `src/content/lessons/*.mdx`: lessons (frontmatter schema in `src/content.config.ts`; quote string values)
- `src/components/PyCell.astro` + `src/lib/cell.ts`: runnable cell (`code`, `check`, `solution`, `hint`, `title`, `lang="sql"`), CodeMirror editor
- `src/components/Lab.astro`: "On your machine" block for tools that can't run in a browser
- `src/lib/py/dsw.py`: practice data (tables, `churn_snapshot`, `FakeLLM`, `same`, `run_pytest`); installed into Pyodide by the worker and served at `/dsw.py`
- `src/lib/py-worker.ts`: Pyodide in a Web Worker; `PYODIDE_VERSION` and the `IMPLIED` package list live here
- `src/pages/sw.js.ts`, `public/manifest.webmanifest`: offline/PWA (the service worker is regenerated on every build)
- `tests/e2e/lessons.spec.ts`: runs every cell of every lesson; `cells.spec.ts`, `smoke.spec.ts`: behaviour

## Lesson conventions
- Every exercise needs `check` and `solution`; starter code must fail the check, the solution must pass (enforced by tests).
- Exercise starters must not destroy shared state (never `df = ...` on a variable later cells need). Prefer new names or functions.
- Checks recompute the expected answer in the check code (prefix helper names with `_`) instead of hard-coding numbers; use `dsw.same(result, expected)` to compare frames.
- Prose must match the numbers the code prints. If you change `dsw.py`, re-run every lesson and re-read the prose around outputs.
- In MDX, code goes in JS template literals: escape backslashes (`\\n`), backticks and `${` (write `\${`).
- Always build internal links with `url()` from `src/lib/paths.ts`.
- Colours are CSS custom properties in `src/styles/global.css` with light and dark values.

## Pyodide limits (verified)
- 32-bit: `np.repeat` counts and similar need `np.intp`.
- Polars: no `scan_*`, `write_parquet`, `to_pandas`; `read_parquet` needs `use_pyarrow=True`. Eager and lazy queries on in-memory frames work.
- pandas Parquet I/O works only because the worker patches a pyarrow call (`_ds_setup_pyarrow`).
- Not available: seaborn, shap, optuna, pandera, plotly. Available: duckdb, polars, pyarrow, statsmodels, scikit-learn, lightgbm, pydantic, pytest.
- `@playwright/test` is pinned to 1.63.0 to match the Chromium preinstalled in Claude cloud sessions; CI installs its own browser.
