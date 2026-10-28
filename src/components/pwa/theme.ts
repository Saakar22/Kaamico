/** Light / dark preference. "system" follows the device; the others are stored per browser. */
export type ThemeChoice = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'kmc-theme'

/**
 * Runs in <head> before the page paints: a stored Light or Dark choice becomes
 * <html data-theme>, which the tokens in styles/tokens.css key off. Storage may be
 * unavailable (private mode); then the device setting applies.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='light'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') delete root.dataset.theme
  else root.dataset.theme = choice
  try {
    if (choice === 'system') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, choice)
  } catch {
    // The choice still applies to this page; it just is not remembered.
  }
}
