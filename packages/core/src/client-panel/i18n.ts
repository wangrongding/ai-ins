import { de } from './i18n.de'
import { en } from './i18n.en'
import { es } from './i18n.es'
import { fr } from './i18n.fr'
import { ja } from './i18n.ja'
import { ko } from './i18n.ko'
import { ptBR } from './i18n.pt-BR'
import { ru } from './i18n.ru'
import { zhTW } from './i18n.zh-TW'
import { type MessageCatalog, type MessageKey, zhCN } from './i18n.zh-CN'

export type { MessageKey }

const catalogs = {
  en,
  'zh-CN': zhCN,
  'zh-TW': zhTW,
  ja,
  ko,
  es,
  fr,
  de,
  'pt-BR': ptBR,
  ru,
} satisfies Record<string, MessageCatalog>

export type Locale = keyof typeof catalogs
export type LocalePreference = 'auto' | Locale

/** Picker order: English first, then by number of speakers among developers. */
export const locales = Object.keys(catalogs) as Locale[]

/** Language names are shown in their own language, so they are never translated. */
export const localeNames: Record<Locale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  ja: '日本語',
  ko: '한국어',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  'pt-BR': 'Português (Brasil)',
  ru: 'Русский',
}

const defaultLocale: Locale = 'en'
const localeStorageKey = 'ai-ins-locale'
const listeners = new Set<() => void>()

function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && value in catalogs
}

/** Follow the browser unless the user picked a language. */
function readStoredPreference(): LocalePreference {
  try {
    const value = window.localStorage.getItem(localeStorageKey)
    return isLocale(value) ? value : 'auto'
  } catch {
    return 'auto'
  }
}

function matchLocale(language: string): Locale | undefined {
  const tag = language.toLowerCase()
  if (tag.startsWith('zh')) {
    // Traditional script, or regions that use it, get zh-TW; other Chinese gets zh-CN.
    return /^zh-(?:hant|tw|hk|mo)\b/u.test(tag) ? 'zh-TW' : 'zh-CN'
  }
  if (tag.startsWith('pt')) return 'pt-BR'
  const primary = tag.split('-')[0]
  return locales.find((locale) => locale === primary)
}

/** First browser language we have a catalog for; English when none matches. */
export function detectBrowserLocale(): Locale {
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const language of languages) {
    const match = matchLocale(language)
    if (match) return match
  }
  return defaultLocale
}

let preference = readStoredPreference()
let locale: Locale = preference === 'auto' ? detectBrowserLocale() : preference

export function getLocale() {
  return locale
}

export function getLocalePreference() {
  return preference
}

export function setLocalePreference(next: LocalePreference) {
  preference = next
  locale = next === 'auto' ? detectBrowserLocale() : next
  try {
    window.localStorage.setItem(localeStorageKey, next)
  } catch {
    // Ignore storage restrictions in embedded browsers.
  }

  for (const listener of listeners) listener()
}

export function onLocaleChange(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export type MessageParams = Record<string, number | string>

export function t(key: MessageKey, params?: MessageParams) {
  const message = (catalogs[locale] as MessageCatalog)[key] ?? en[key]
  const template =
    typeof message === 'string'
      ? message
      : (message[new Intl.PluralRules(locale).select(Number(params?.count ?? 0)) as keyof typeof message] ?? message.other)

  return params ? template.replace(/\{(\w+)\}/gu, (match, name: string) => (name in params ? String(params[name]) : match)) : template
}

/** Message keys arrive as plain strings from the server; only known ones are translated. */
export function isMessageKey(value: unknown): value is MessageKey {
  return typeof value === 'string' && value in zhCN
}

declare global {
  var aiInsI18n: { getLocale: typeof getLocale; t: typeof t } | undefined
}

// The non-React client scripts (run-events.js, …) share this translator.
globalThis.aiInsI18n = { getLocale, t }
