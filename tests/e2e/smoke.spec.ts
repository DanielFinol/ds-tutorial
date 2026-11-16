import { expect, test } from '@playwright/test';

test('home lists lessons and links to the first one', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1, name: 'Data Science in 2026' })).toBeVisible();
  await expect(page.locator('a.lesson-card')).toHaveCount(4);
  await expect(page.getByText('Coming soon').first()).toBeVisible();
  await page.getByRole('link', { name: 'Start learning' }).click();
  await expect(page).toHaveURL(/lessons\/01-welcome\/$/);
});

test('no horizontal scroll', async ({ page }) => {
  for (const path of ['./', 'lessons/02-dataframes/']) {
    await page.goto(path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, path).toBeLessThanOrEqual(1);
  }
});

test('PWA manifest and service worker are served', async ({ page, request }) => {
  await page.goto('./');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifest = await (await request.get(href!)).json();
  expect(manifest.short_name).toBe('DS 2026');
  expect((await request.get('sw.js')).ok()).toBe(true);
  const precache = await (await request.get('precache.json')).json();
  expect(precache.pages).toContain('lessons/01-welcome/');
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
  await page.goto('lessons/03-eda/'); // never visited: must come from the pre-cache
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Exploring data with plots');
  await context.setOffline(false);
});
