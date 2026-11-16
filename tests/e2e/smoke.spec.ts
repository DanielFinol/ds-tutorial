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
