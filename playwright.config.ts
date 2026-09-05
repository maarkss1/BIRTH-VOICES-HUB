import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'html',
  webServer: {
    command: 'npm run start',
    url: 'http://127.0.0.1:3000/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      // Exercise the compiled Vite artifact over the local HTTP origin without introducing any
      // switch that can disable Secure cookies in production. Production still derives cookie
      // security solely from NODE_ENV=production.
      NODE_ENV: 'e2e',
      SERVE_STATIC_BUILD: 'true',
      PORT: '3000',
    },
  },
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Opt-in only: some sandboxes cache an older Chromium revision than the one this
        // Playwright version expects for its headless-shell fast path, and cannot reach
        // playwright.dev to download a matching one (network egress policy). Pointing at a
        // pre-cached full-Chromium binary via this env var sidesteps that specific mismatch
        // without touching normal CI/local behavior, which never sets it and keeps using
        // Playwright's own managed browser download.
        ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
          ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } }
          : {}),
      },
    },
  ],
});
