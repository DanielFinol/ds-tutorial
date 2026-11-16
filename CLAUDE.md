# ds-tutorial

Interactive "Data Science in 2026" tutorial: an Astro 7 static site + PWA, hosted on GitHub Pages at base path `/ds-tutorial`.

## Commands
- `pnpm dev`: dev server at http://localhost:4321/ds-tutorial/
- `pnpm build`: `astro check` + build to `dist/` (must pass before committing)
- `pnpm test:e2e`: Playwright against `astro preview`; run `pnpm build` first. Python tests need network access to cdn.jsdelivr.net.

## Layout
- `src/content/lessons/*.mdx`: lessons (frontmatter schema in `src/content.config.ts`; quote string values)
- `src/components/PyCell.astro`: runnable/editable Python cell (`code`, optional `check`, `title`)
- `src/lib/py-worker.ts`: Pyodide in a Web Worker; `PYODIDE_VERSION` lives here
- `src/lib/py-client.ts`: main-thread API (`runPython`)
- `public/sw.js`, `public/manifest.webmanifest`, `src/pages/precache.json.ts`: offline/PWA
- `scripts/make-icons.mjs`: regenerates PWA PNG icons from `public/favicon.svg`

## Conventions
- Always build internal links with `url()` from `src/lib/paths.ts` (handles the base path).
- Lesson code must use only Pyodide-bundled packages and generate its data inline (no fetching).
- In MDX, Python goes inside JS template literals: avoid backticks and `${` in lesson code.
- Colours are CSS custom properties in `src/styles/global.css` with light and dark values; don't hard-code colours in components.
- Bump `VERSION` in `public/sw.js` only when caching logic changes.
- `@playwright/test` is pinned to 1.63.0 to match the Chromium preinstalled in Claude cloud sessions; CI installs its own browser.
