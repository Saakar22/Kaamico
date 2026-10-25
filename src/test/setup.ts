import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// `connection()` marks a route as request-time and only works inside the Next.js
// runtime. Route handlers called directly from tests are always request-time.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: async () => {},
}))

afterEach(() => {
  cleanup()
})
