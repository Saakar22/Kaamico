import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Loads DATABASE_URL_TEST etc. for integration tests; CI sets them directly.
try {
  process.loadEnvFile('.env.local')
} catch {
  // No .env.local: database tests are skipped unless the variables are already set.
}

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` throws outside the react-server condition; it is a no-op under test.
      'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
    },
  },
  test: {
    // Component tests opt into jsdom with a `// @vitest-environment jsdom` comment.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    // Rebuilds the test database from migrations once per run (skipped without DATABASE_URL_TEST).
    globalSetup: ['./src/test/db-global-setup.ts'],
    env: { LOG_LEVEL: 'silent' },
  },
})
