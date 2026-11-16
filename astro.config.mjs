// @ts-check
import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import mdx from '@astrojs/mdx';
import remarkPyCell from './src/lib/remark-pycell.mjs';

// GitHub Pages project site: https://danielfinol.github.io/ds-tutorial/
// The PWA is hand-rolled: public/manifest.webmanifest + src/pages/sw.js.ts (generated service worker).
export default defineConfig({
  site: 'https://danielfinol.github.io',
  base: '/ds-tutorial',
  trailingSlash: 'ignore',
  integrations: [mdx()],
  markdown: {
    // The unified processor is needed for the remark plugin that keeps code-cell indentation exact.
    processor: unified({ remarkPlugins: [remarkPyCell] }),
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' } },
  },
});
