// usage: node dump.mjs <lesson-id>  -> prints each cell's output (dev aid)
import { chromium } from '@playwright/test';
const b = await chromium.launch(); const p = await b.newPage();
await p.goto(`http://localhost:4321/ds-tutorial/lessons/${process.argv[2]}/`);
const cells = p.locator('py-cell'); const n = await cells.count();
for (let i = 0; i < n; i++) { const c = cells.nth(i); const t0 = Date.now(); await c.evaluate((el) => el.run());
  console.log(`--- cell ${i + 1} (${((Date.now() - t0) / 1000).toFixed(1)}s)\n` + (await c.locator('.cell-out').innerText()).slice(0, 1800)); }
await b.close();
