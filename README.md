# Data Science in 2026

An interactive tutorial that teaches modern data science by letting learners run **real Python in the browser**: pandas, NumPy, matplotlib and scikit-learn, via [Pyodide](https://pyodide.org). There's no server and no sign-up, and it works offline once installed as a PWA.

**Live site:** https://danielfinol.github.io/ds-tutorial/ (after the first deploy)

## Stack

| Piece | Choice |
| --- | --- |
| Site generator | [Astro 7](https://astro.build), static output, lessons in MDX |
| Python runtime | Pyodide (loaded from `cdn.jsdelivr.net`) in a Web Worker |
| Offline / install | Hand-written service worker (`public/sw.js`) + web manifest |
| Tests | Playwright end-to-end, against the production build |
| Hosting | GitHub Pages via GitHub Actions |

## Develop

Requires Node ≥ 22.23 and pnpm 10.

```bash
pnpm install
pnpm dev            # http://localhost:4321/ds-tutorial/
pnpm build          # type-check + static build into dist/
pnpm test:e2e       # Playwright (needs a fresh `pnpm build`)
```

The first Python run on a page downloads Pyodide and any imported packages. The service worker caches them, so later runs and offline use are fast.

## Writing a lesson

Add `src/content/lessons/NN-slug.mdx`:

```mdx
---
title: "My lesson"
description: "One-sentence summary."
module: "Foundations"
order: 5
minutes: 15
status: ready        # "draft" shows it as "Coming soon"
---
import PyCell from '../../components/PyCell.astro';

<PyCell code={`
import pandas as pd
pd.Series([1, 2, 3]).mean()
`} />

<PyCell
  code={`answer = ...`}
  check={`assert answer == 42, "Hint shown to the learner"`}
/>
```

- Cells on one page share a Python namespace, like notebook cells.
- The last expression is displayed; pandas objects render as HTML tables; matplotlib figures render as images.
- A `check` runs after the learner's code. If it raises, the `AssertionError` message is shown as a hint.
- Only packages [bundled with Pyodide](https://pyodide.org/en/stable/usage/packages-in-pyodide.html) are auto-loaded from imports. Generate data in code instead of fetching it.

## Deploying

Pushes to `main` run `.github/workflows/deploy.yml`. One-time setup: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
