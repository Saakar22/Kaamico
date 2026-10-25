import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Loads DATABASE_URL_TEST etc. for integration tests; CI sets them directly.
try {
  process.loadEnvFile('.env.local')
} catch {
  // No .env.local: database tests are skipped unless the variables are already set.
}

const testDatabaseUrl = process.env.DATABASE_URL_TEST

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside the react-server condition; it is a no-op under test.
      'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    // Starting a fork per core all at once made slow (jsdom) workers time out on startup.
    maxWorkers: '50%',
    setupFiles: ['./src/test/setup.ts'],
    env: {
      LOG_LEVEL: 'silent',
      APP_URL: 'http://localhost:3000',
      AUTH_SECRET: 'test-auth-secret-0123456789-abcdefghijklmnop',
      // Rate limits are part of what the tests verify, so keep production values.
      RATE_LIMIT_MULTIPLIER: '1',
      OTP_MODE: 'simulated',
      // Application code under test talks to the test database, never the dev one.
      ...(testDatabaseUrl ? { DATABASE_URL: testDatabaseUrl } : {}),
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          // Component tests opt into jsdom with a `// @vitest-environment jsdom` comment.
          environment: 'node',
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/**/*.int.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'db',
          environment: 'node',
          include: ['src/**/*.int.test.ts'],
          // Files share one database and truncate it, so they run one at a time.
          fileParallelism: false,
          // Rebuilds the test database from migrations once per run (skipped without DATABASE_URL_TEST).
          globalSetup: ['./src/test/db-global-setup.ts'],
        },
      },
    ],
  },
})
