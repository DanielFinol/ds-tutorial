import { expect, test, type Locator, type Page } from '@playwright/test';

// Behaviour of the interactive cells (these download Pyodide from cdn.jsdelivr.net).
const cell = (page: Page, i: number) => page.locator('py-cell').nth(i);
const run = (c: Locator) => c.evaluate((el: any) => el.run());
const setCode = (c: Locator, code: string) => c.evaluate((el: any, v) => el.setCode(v), code);

test('running a later cell first runs the earlier ones; exercises are graded', async ({ page }) => {
  await page.goto('lessons/01-first-ticket/');
  const exercise = page.locator('py-cell[data-check]').first();
  await exercise.getByRole('button', { name: /Run/ }).click(); // starter code, earlier cells not run yet
  await expect(exercise.getByRole('button', { name: /Run/ })).toBeEnabled();
  await expect(cell(page, 0).locator('.cell-out table')).toBeVisible(); // earlier cell ran automatically
  await expect(exercise.locator('.cell-out')).not.toHaveClass(/passed/);

  await exercise.locator('summary', { hasText: 'Solution' }).click();
  await exercise.getByRole('button', { name: 'Copy into editor' }).click();
  await exercise.getByRole('button', { name: /Run/ }).click();
  await expect(exercise.locator('.cell-out')).toHaveClass(/passed/);
  await expect(exercise).toHaveClass(/is-passed/);
});

test('shows readable Python errors without runtime internals', async ({ page }) => {
  await page.goto('lessons/01-first-ticket/');
  const c = cell(page, 0);
  await setCode(c, '1 / 0');
  await run(c);
  await expect(c.locator('.cell-out .error')).toContainText('ZeroDivisionError');
  await expect(c.locator('.cell-out .error')).not.toContainText('_pyodide');
});

test('edits and solved state survive a reload; Reset restores the starter code', async ({ page }) => {
  await page.goto('lessons/01-first-ticket/');
  const c = cell(page, 0);
  await setCode(c, 'print("my edit")');
  await page.waitForTimeout(700); // debounce of the autosave
  await page.reload();
  await expect.poll(() => cell(page, 0).evaluate((el: any) => el.getCode())).toBe('print("my edit")');
  await cell(page, 0).getByRole('button', { name: 'Reset' }).click();
  await expect.poll(() => cell(page, 0).evaluate((el: any) => el.getCode())).toContain('dsw.tables()');
});

test('SQL cells run in DuckDB and plots render', async ({ page }) => {
  await page.goto('lessons/02-sql/');
  await run(cell(page, 0));
  await run(cell(page, 2));
  await expect(cell(page, 2).locator('.cell-out table')).toBeVisible();
  await page.goto('lessons/06-eda/');
  await run(cell(page, 1));
  await expect(cell(page, 1).locator('.cell-out img')).toBeVisible();
});

test('lesson is marked complete on the home page', async ({ page }) => {
  await page.goto('lessons/02-sql/');
  await page.getByRole('button', { name: 'Mark as complete' }).click();
  await page.goto('./');
  await expect(page.locator('a.lesson-card[data-lesson="02-sql"]')).toHaveClass(/done/);
  await expect(page.getByRole('link', { name: 'Continue' })).toBeVisible();
});
