import type { Instrumentation } from 'next'

// Node-only work lives in instrumentation-node.ts, so the Edge bundle never includes it.

export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { checkEnvironment } = await import('./instrumentation-node')
  checkEnvironment()
}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { logRequestError } = await import('./instrumentation-node')
  logRequestError(error, request, context)
}
