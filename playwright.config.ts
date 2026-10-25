import { defineConfig, devices } from '@playwright/test'

// Local runs read SEED_ADMIN_PASSWORD etc. from .env.local; CI sets them directly.
try {
  process.loadEnvFile('.env.local')
} catch {
  // ignore
}

const PORT = Number(process.env.PORT ?? 3000)
const baseURL = `http://localhost:${PORT}`
// `npm run test:e2e:build` (and CI) test the production build: closest to real use, and
// it writes nothing to .next while serving (OneDrive-synced folders can lock those files).
const useBuild =
  !!process.env.CI ||
  process.env.E2E_SERVER === 'start' ||
  process.env.npm_lifecycle_event === 'test:e2e:build'

export default defineConfig({
  testDir: './e2e',
  // Pre-compiles routes when testing against `next dev`.
  globalSetup: useBuild ? undefined : './e2e/global-setup.ts',
  fullyParallel: true,
  // `next dev` renders unoptimised (with extra validation passes) in one process; ~10
  // parallel browsers pushed page renders to 5–10 s and timed tests out. Builds stay parallel.
  workers: useBuild ? undefined : 2,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // The first visit to a page in `next dev` includes compilation.
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: useBuild ? `npm run start -- --port ${PORT}` : `npm run dev -- --port ${PORT}`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // A local production server still runs simulated OTP/payments, which `next start`
    // (NODE_ENV=production) only allows for explicit demos.
    env:
      useBuild && !process.env.CI
        ? {
            ALLOW_SIMULATION_IN_PRODUCTION: 'true',
            ENABLE_UI_GALLERY: 'true',
            CRON_SECRET: process.env.CRON_SECRET || 'local-e2e-cron-secret-0123456789abcdef',
          }
        : undefined,
  },
})
