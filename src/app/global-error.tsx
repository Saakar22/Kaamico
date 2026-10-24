'use client'

// Replaces the root layout when it fails, so it cannot rely on global CSS or fonts.
export default function GlobalError({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined

  return (
    <html lang="en-IN">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          fontFamily: 'system-ui, sans-serif',
          color: '#1b1f24',
          background: '#ffffff',
        }}
      >
        <title>Something went wrong · Kaamico</title>
        <main role="alert" style={{ textAlign: 'center', padding: 24, maxWidth: 420 }}>
          <h1 style={{ fontSize: 22 }}>Something went wrong</h1>
          <p style={{ color: '#4b5563' }}>Please try again in a moment.</p>
          {digest && (
            <p style={{ color: '#4b5563', fontSize: 12 }}>
              Reference: <code>{digest}</code>
            </p>
          )}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 12,
              height: 44,
              padding: '0 16px',
              border: 0,
              borderRadius: 10,
              background: '#0b6e4f',
              color: '#fff',
              fontSize: 16,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
