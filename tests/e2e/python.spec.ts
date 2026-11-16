import { expect, test, type Locator, type Page } from '@playwright/test';

// These tests download Pyodide from cdn.jsdelivr.net.
const cell = (page: Page, i: number) => page.locator('py-cell').nth(i);
async function run(c: Locator) {
  await c.getByRole('button', { name: /Run/ }).click();
  await expect(c.getByRole('button', { name: /Run/ })).toBeEnabled();
  return c.locator('.cell-out');
}

test('runs Python, shares state between cells, and grades exercises', async ({ page }) => {
  await page.goto('lessons/01-welcome/');
  await expect(await run(cell(page, 0))).toContainText('Hello, data scientist!');
  await expect(await run(cell(page, 1))).toContainText('[18.5, 21.0');
  await expect(await run(cell(page, 2))).toContainText('Average: 21.52');

  const exercise = cell(page, 3);
  await expect(await run(exercise)).toContainText('Not quite');
  await exercise.locator('textarea').fill('hottest = max(temperatures_c)');
  const out = await run(exercise);
  await expect(out).toContainText('passes the check');
  await expect(out).toHaveClass(/passed/);
});

test('shows readable Python errors', async ({ page }) => {
  await page.goto('lessons/01-welcome/');
  const c = cell(page, 0);
  await c.locator('textarea').fill('1 / 0');
  const out = await run(c);
  await expect(out.locator('.error')).toContainText('ZeroDivisionError');
  await expect(out.locator('.error')).not.toContainText('_pyodide');
});

test('pandas renders tables and matplotlib renders plots', async ({ page }) => {
  await page.goto('lessons/03-eda/');
  await expect((await run(cell(page, 0))).locator('table')).toBeVisible();
  await expect((await run(cell(page, 1))).locator('img')).toBeVisible();
});

test('scikit-learn lesson exercise can be solved', async ({ page }) => {
  await page.goto('lessons/04-first-model/');
  for (const i of [0, 1, 2]) await expect(await run(cell(page, i))).not.toContainText('Error');
  const ex = cell(page, 3);
  await ex.locator('textarea').fill(
    [
      'from sklearn.ensemble import RandomForestRegressor',
      'rf = RandomForestRegressor(random_state=0).fit(X_train, y_train)',
      'rf_mae = mean_absolute_error(y_test, rf.predict(X_test))',
      'rf_mae',
    ].join('\n'),
  );
  await expect(await run(ex)).toContainText('passes the check');
});

test('progress is remembered', async ({ page }) => {
  await page.goto('lessons/02-dataframes/');
  await page.getByRole('button', { name: 'Mark as complete' }).click();
  await page.goto('./');
  await expect(page.locator('a.lesson-card[data-lesson="02-dataframes"]')).toHaveClass(/done/);
});
