/** Developer pages under /dev/* (UI gallery, shell previews). Off in production unless opted in. */
export function isDevPagesEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' || process.env.ENABLE_UI_GALLERY === 'true'
}
