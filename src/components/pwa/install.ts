/** Chromium's install prompt event (not in the DOM typings). */
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((l) => l())

/**
 * Keeps the browser's install prompt so a button can show it later (Chromium only;
 * Safari and Firefox install from their own menus). Called once from PwaSetup.
 */
export function captureInstallPrompt(): () => void {
  const onPrompt = (event: Event) => {
    event.preventDefault()
    deferred = event as InstallPromptEvent
    notify()
  }
  const onInstalled = () => {
    deferred = null
    notify()
  }
  window.addEventListener('beforeinstallprompt', onPrompt)
  window.addEventListener('appinstalled', onInstalled)
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt)
    window.removeEventListener('appinstalled', onInstalled)
  }
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const canPromptInstall = () => deferred !== null

/** Shows the browser's install dialog; true if the person installed. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred
  if (!event) return false
  deferred = null
  notify()
  await event.prompt()
  return (await event.userChoice).outcome === 'accepted'
}
