import { t } from './i18n'

/**
 * Desktop notifications for things that need the user while they are looking
 * elsewhere: a turn finished, failed, or is waiting for a permission answer.
 * Opt-in from settings; the browser asks for permission on the first enable.
 */
const notifyStorageKey = 'ai-ins-notify'

export type NotifySupport = 'default' | 'denied' | 'granted' | 'unsupported'

export function getNotifySupport(): NotifySupport {
  if (typeof Notification === 'undefined' || !window.isSecureContext) return 'unsupported'
  return Notification.permission
}

export function readNotifyEnabled() {
  try {
    return window.localStorage.getItem(notifyStorageKey) === 'on' && getNotifySupport() === 'granted'
  } catch {
    return false
  }
}

function saveNotifyEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(notifyStorageKey, enabled ? 'on' : 'off')
    globalThis.aiInsRememberSetting?.(notifyStorageKey, enabled ? 'on' : 'off')
  } catch {
    // Ignore storage restrictions in embedded browsers.
  }
}

/** Turn notifications on or off; asks the browser first when needed. Resolves to the new state. */
export async function setNotifyEnabled(enabled: boolean) {
  if (!enabled) {
    saveNotifyEnabled(false)
    return false
  }

  let support = getNotifySupport()
  if (support === 'default') {
    support = await Notification.requestPermission()
  }

  const granted = support === 'granted'
  saveNotifyEnabled(granted)
  return granted
}

export type NotifyKind = 'done' | 'failed' | 'waiting'

const titleKeys = { done: 'notify.done', failed: 'notify.failed', waiting: 'notify.waiting' } as const

/**
 * Show one notification, unless the user is already looking at the panel.
 * The tag makes every open tab's copy of the same event collapse into one.
 */
export function notifyRunEvent(kind: NotifyKind, options: { body: string; panelOpen: boolean; provider: string; tag: string; onClick: () => void }) {
  if (!readNotifyEnabled()) return
  const looking = document.visibilityState === 'visible' && document.hasFocus() && options.panelOpen
  if (looking) return

  try {
    const notification = new Notification(t(titleKeys[kind], { provider: options.provider }), {
      body: options.body.length > 120 ? `${options.body.slice(0, 120)}…` : options.body,
      tag: options.tag,
    })
    notification.onclick = () => {
      window.focus()
      options.onClick()
      notification.close()
    }
  } catch {
    // Some browsers only allow notifications from a service worker; skip quietly.
  }
}
