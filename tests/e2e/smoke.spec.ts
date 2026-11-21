import { expect, test } from '@playwright/test';

test('home lists all lessons and links to the first one', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Data Science at Work' })).toBeVisible();
  await expect(page.locator('a.lesson-card')).toHaveCount(15);
  await expect(page.locator('body')).not.toContainText('2026');
  await page.getByRole('link', { name: 'Start' }).click();
  await expect(page).toHaveURL(/lessons\/01-first-ticket\/$/);
});

test('no horizontal scroll', async ({ page }) => {
  for (const path of ['./', 'lessons/02-sql/', 'lessons/15-shipping/']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});

test('PWA manifest, service worker and data module are served', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(href!)).json();
  expect(manifest.short_name).toBe('DS at Work');
  const sw = await (await request.get('sw.js')).text();
  expect(sw).toContain('lessons/01-first-ticket/');
  expect(sw).toContain('es/lessons/01-first-ticket/');
  expect(await (await request.get('dsw.py')).text()).toContain('def churn_snapshot');
});

test('lessons work offline once the service worker is installed', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    // wait until pre-caching has finished and the SW controls the page
    if (!navigator.serviceWorker.controller)
      await new Promise((r) => navigator.serviceWorker.addEventListener('controllerchange', r, { once: true }));
  });
  await context.setOffline(true);
  await page.goto('lessons/07-ab-testing/'); // never visited: must come from the pre-cache
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Running and reading A/B tests');
  await context.setOffline(false);
});

test('Spanish version: home, language switch and lesson pages', async ({ page }) => {
  await page.goto('es/');
  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('heading', { level: 1, name: 'Ciencia de datos en el trabajo' })).toBeVisible();
  await expect(page.locator('a.lesson-card')).toHaveCount(15);
  await page.getByRole('link', { name: 'Empezar' }).click();
  await expect(page).toHaveURL(/es\/lessons\/01-first-ticket\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tu primer ticket');
  await expect(page.getByRole('button', { name: 'Ejecutar ▶' }).first()).toBeVisible();

  // the switcher leads to the same lesson in the other language, and back
  await page.getByRole('link', { name: 'English' }).click();
  await expect(page).toHaveURL(/\/ds-tutorial\/lessons\/01-first-ticket\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Your first ticket');
  await page.getByRole('link', { name: 'Español' }).click();
  await expect(page).toHaveURL(/es\/lessons\/01-first-ticket\/$/);
});

test('every page links to the author landing page', async ({ page }) => {
  for (const path of ['./', 'lessons/03-pandas/', 'es/', 'es/lessons/03-pandas/']) {
    await page.goto(path);
    const link = page.locator('.author-bar a');
    await expect(link, path).toBeVisible();
    await expect(link, path).toHaveAttribute('href', 'https://danielfinol.github.io/');
    await expect(link, path).toContainText('Daniel E. Finol-González');
  }
});
