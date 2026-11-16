import { defineConfig, devices } from '@playwright/test';

// Tests run against the production build (`pnpm build` first), served by `astro preview`.
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000, // first Python run downloads Pyodide + packages
  expect: { timeout: 90_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:4321/ds-tutorial/',
    trace: 'off',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /smoke/ },
  ],
  webServer: {
    command: 'pnpm preview --port 4321 --ignore-lock',
    url: 'http://localhost:4321/ds-tutorial/',
    reuseExistingServer: !process.env.CI,
  },
});
