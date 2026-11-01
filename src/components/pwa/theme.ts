/**
 * Light / dark preference, stored per browser. Kaamico is light unless the person picks
 * Dark, or "system" to follow the device.
 */
export type ThemeChoice = 'system' | 'light' | 'dark'

export const THEME_STORAGE_KEY = 'kmc-theme'

/**
 * Runs in <head> before the page paints: a stored Dark or "system" choice becomes
 * <html data-theme>, which the tokens in styles/tokens.css key off. With no choice, or
 * storage unavailable (private mode), the page stays light.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t==='system'||t==='dark')document.documentElement.dataset.theme=t}catch(e){}`

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'system' || stored === 'dark' ? stored : 'light'
  } catch {
    return 'light'
  }
}

export function applyThemeChoice(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'light') delete root.dataset.theme
  else root.dataset.theme = choice
  try {
    if (choice === 'light') localStorage.removeItem(THEME_STORAGE_KEY)
    else localStorage.setItem(THEME_STORAGE_KEY, choice)
  } catch {
    // The choice still applies to this page; it just is not remembered.
  }
}
