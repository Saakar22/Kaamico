import type { Messages } from './messages/en'

/** Dot paths to every string in the dictionary, e.g. `home.stepsTitle`. */
type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>
}[keyof T & string]

export type MessageKey = Leaves<Messages>
export type MessageVars = Record<string, string | number>
export type Translate = (key: MessageKey, vars?: MessageVars) => string

/**
 * Looks a key up and fills `{name}` placeholders. A missing key (impossible while the
 * dictionaries type-check) falls back to the key itself rather than crashing a page.
 */
export function createTranslator(messages: Messages): Translate {
  return (key, vars) => {
    let node: unknown = messages
    for (const part of key.split('.')) node = (node as Record<string, unknown> | undefined)?.[part]
    if (typeof node !== 'string') return key
    return vars ? node.replace(/\{(\w+)\}/g, (m, name: string) => String(vars[name] ?? m)) : node
  }
}
