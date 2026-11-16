// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// GitHub Pages project site: https://danielfinol.github.io/ds-tutorial/
// The PWA is hand-rolled: public/manifest.webmanifest + src/pages/sw.js.ts (generated service worker).
export default defineConfig({
  site: 'https://danielfinol.github.io',
  base: '/ds-tutorial',
  trailingSlash: 'ignore',
  integrations: [mdx()],
  markdown: { shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } } },
});
