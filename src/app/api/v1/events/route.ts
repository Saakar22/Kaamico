import { connection } from 'next/server'
import { getEnv } from '@/config/env'
import { AppError } from '@/lib/errors'
import { route } from '@/lib/http'
import { requireApiActor } from '@/modules/auth/actor'
import { subscribe, type LiveEvent } from '@/modules/realtime/hub'

const HEARTBEAT_MS = 25_000

/**
 * Server-sent events for the signed-in person: `booking` (a booking they are part of
 * changed) and `notification` (they have a new one). Ids only; the page re-reads the data.
 * Comments every 25 s keep proxies from closing the connection.
 */
export const GET = route(async (request) => {
  await connection()
  if (getEnv().REALTIME_MODE !== 'sse') {
    throw new AppError('SERVICE_UNAVAILABLE', 'Live updates are off; the app polls instead')
  }
  const actor = await requireApiActor(request)
  const encoder = new TextEncoder()
  let cleanup = () => {}
  let forward: (event: LiveEvent) => void = () => {}
  // Listening before the stream opens: nothing after "ready" can be missed.
  const unsubscribe = await subscribe(actor.userId, (event) => forward(event))
  if (!unsubscribe) {
    // The browser treats this as "not live" and keeps polling.
    throw new AppError('SERVICE_UNAVAILABLE', 'Live updates are unavailable right now')
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (text: string) => {
        try {
          controller.enqueue(encoder.encode(text))
        } catch {
          cleanup()
        }
      }
      forward = (event: LiveEvent) =>
        send(
          `event: ${event.type}\ndata: ${JSON.stringify({ bookingId: event.bookingId ?? null })}\n\n`,
        )
      const heartbeat = setInterval(() => send(': keep-alive\n\n'), HEARTBEAT_MS)
      cleanup = () => {
        clearInterval(heartbeat)
        unsubscribe()
      }
      request.signal.addEventListener('abort', () => {
        cleanup()
        try {
          controller.close()
        } catch {
          // already closed
        }
      })
      // Tell the browser how long to wait before reconnecting, and that it is live.
      send('retry: 5000\nevent: ready\ndata: {}\n\n')
    },
    cancel() {
      cleanup()
    },
  })

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store, no-transform',
      connection: 'keep-alive',
      // Stops nginx-style proxies from buffering the stream.
      'x-accel-buffering': 'no',
    },
  })
})
