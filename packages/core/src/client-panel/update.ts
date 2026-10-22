import { t } from './i18n'
import type { AgentProvider, PermissionMode } from './types'

/** Mirrors `AiInsUpdateInfo` from the server (`src/update-check.ts`). */
export type UpdateInfo = {
  changelogUrl: string
  checkedAt?: number
  current: string
  disabledReason?: 'ci' | 'env' | 'local' | 'option'
  latest?: string
  skipped?: boolean
  status: 'available' | 'disabled' | 'unknown' | 'up-to-date'
  upgrade?: { command: string; directory: string; packageManager: string; packages: string[] }
}

export type UpgradePermission = {
  /** Permission the upgrade turn asks for; undefined when the provider's own flags fix it. */
  mode?: PermissionMode
  /** `ask`: raised from "edit" so the install command can run after the user approves it. */
  raised?: 'ask' | 'full'
}

/**
 * Installing a package runs a command (and needs the network), which "edit"
 * denies. Raise just this turn to "ask" where the agent can ask; an agent with
 * no "ask" level needs "full", which the caller confirms first.
 */
export function getUpgradePermission(provider: AgentProvider | undefined, requested: PermissionMode): UpgradePermission {
  const supported = provider?.permissionModes ?? []
  if (!supported.length) return {}
  const fallbacks: Record<PermissionMode, PermissionMode[]> = { ask: ['ask', 'edit'], edit: ['edit', 'ask'], full: ['full', 'edit', 'ask'] }
  const actual = fallbacks[requested].find((mode) => supported.includes(mode))
  if (actual && actual !== 'edit') return { mode: actual }
  if (supported.includes('ask')) return { mode: 'ask', raised: 'ask' }
  if (supported.includes('full')) return { mode: 'full', raised: 'full' }
  return { mode: actual }
}

/** What the upgrade conversation asks the agent to do; shown as the user's first message. */
export function buildUpgradePrompt(update: UpdateInfo) {
  const params = { changelog: update.changelogUrl, current: update.current, latest: update.latest || 'latest' }
  if (!update.upgrade) return t('update.agentPromptNoPlan', params)
  return t('update.agentPrompt', { ...params, command: update.upgrade.command })
}
