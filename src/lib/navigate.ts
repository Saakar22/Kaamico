/**
 * Loads `path` as a full page. Used after signing in or out: the session changed, so
 * nothing cached by the client router may be reused, and a client navigation followed
 * by router.refresh() can be cancelled by the refresh while the target still compiles.
 * The returned promise never settles, so callers keep showing their loading state
 * until the browser leaves the page.
 */
export function hardNavigate(path: string): Promise<never> {
  window.location.replace(path)
  return new Promise<never>(() => {})
}
