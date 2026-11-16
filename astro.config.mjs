// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';

// GitHub Pages project site: https://danielfinol.github.io/ds-tutorial/
// The PWA is hand-rolled: public/manifest.webmanifest + public/sw.js (+ src/pages/precache.json.ts).
export default defineConfig({
  site: 'https://danielfinol.github.io',
  base: '/ds-tutorial',
  trailingSlash: 'ignore',
  integrations: [mdx()],
});
