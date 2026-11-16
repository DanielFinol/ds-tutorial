import { expect, test } from '@playwright/test';
import { readdirSync } from 'node:fs';

// Runs every cell of every lesson, in order, in a real browser:
//  - plain cells must run without a Python error;
//  - exercises must NOT pass as shipped, and MUST pass with their solution.
const lessons = readdirSync('src/content/lessons')
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => f.replace(/\.mdx$/, ''))
  .sort();

test.describe.configure({ mode: 'parallel' });

for (const id of lessons) {
  test(`lesson ${id}: all cells run and all solutions pass`, async ({ page }) => {
    test.setTimeout(600_000);
    await page.goto(`lessons/${id}/`);
    const cells = page.locator('py-cell');
    const n = await cells.count();
    expect(n).toBeGreaterThan(0);

    for (let i = 0; i < n; i++) {
      const cell = cells.nth(i);
      const isExercise = (await cell.getAttribute('data-check')) !== null;
      const run = () => cell.evaluate((el: any) => el.run());
      const outText = async () => (await cell.locator('.cell-out').innerText()).slice(0, 1500);

      if (isExercise) {
        await run();
        expect(await cell.locator('.cell-out.passed').count(), `cell ${i + 1}: starter code must not pass its own check`).toBe(0);
        const solution = await cell.getAttribute('data-solution');
        expect(solution, `cell ${i + 1}: exercise needs a solution`).toBeTruthy();
        await cell.evaluate((el: any, code) => el.setCode(code), solution);
        await run();
        expect(await cell.locator('.cell-out.passed').count(), `cell ${i + 1}: solution should pass.\n${await outText()}`).toBe(1);
      } else {
        await run();
        expect(await cell.locator('.cell-out .error').count(), `cell ${i + 1} raised:\n${await outText()}`).toBe(0);
      }
    }
  });
}
