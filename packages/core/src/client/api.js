/**
 * Errors the panel shows the user come back as `{ error: <message key>, params }`
 * so they are translated here; anything else is shown as the server sent it.
 */
async function readResponseError(response) {
  const body = await response.text()
  try {
    const payload = JSON.parse(body)
    if (payload && typeof payload.error === 'string') {
      const message = globalThis.aiInsI18n?.t(payload.error, payload.params)
      if (message && message !== payload.error) {
        return new Error(message)
      }
    }
  } catch {
    // Plain-text error body.
  }

  return new Error(body)
}

async function openInEditor(layerPath) {
  const response = await fetch(`${base}__open-in-editor?file=${encodeURIComponent(layerPath)}`)

  if (response.ok) {
    return
  }

  throw await readResponseError(response)
}

async function revealInFolder(layerPath) {
  const response = await fetch(`${base}__reveal-in-folder?file=${encodeURIComponent(layerPath)}`)

  if (response.ok) {
    return
  }

  throw await readResponseError(response)
}

async function runAiInsAgent(layer, layers, providerId, prompt, proxyMode, proxy, resumeRunId, permissionMode) {
  const response = await fetch(`${base}__ai-ins-agent`, {
    body: JSON.stringify({
      file: layer?.path,
      layers,
      page: window.location.href,
      permissionMode,
      prompt,
      provider: providerId,
      proxy,
      proxyMode,
      resumeRunId,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    throw await readResponseError(response)
  }

  return response.json()
}

async function loadAgentRuns(version) {
  const query = version ? `?version=${encodeURIComponent(version)}` : ''
  const response = await fetch(`${base}__ai-ins-agent/runs${query}`)

  if (!response.ok) {
    throw await readResponseError(response)
  }

  return response.json()
}

async function loadAgentRun(runId) {
  const response = await fetch(`${base}__ai-ins-agent/runs?id=${encodeURIComponent(runId)}`)

  if (response.status === 404) {
    return { run: null }
  }

  if (!response.ok) {
    throw await readResponseError(response)
  }

  return response.json()
}

async function loadAgentFileDiff(runId, turnIndex, path) {
  const query = `id=${encodeURIComponent(runId)}&turn=${encodeURIComponent(turnIndex)}&file=${encodeURIComponent(path)}`
  const response = await fetch(`${base}__ai-ins-agent/runs?${query}`)

  if (!response.ok) {
    throw await readResponseError(response)
  }

  return response.json()
}

async function answerAgentPermission(runId, requestId, decision) {
  const query = `run=${encodeURIComponent(runId)}&request=${encodeURIComponent(requestId)}&decision=${encodeURIComponent(decision)}`
  const response = await fetch(`${base}__ai-ins-agent/permission?${query}`, { method: 'POST' })

  if (!response.ok) {
    throw await readResponseError(response)
  }

  return response.json()
}

async function loadWorkspaceChanges() {
  const response = await fetch(`${base}__ai-ins-agent/changes`)

  if (!response.ok) {
    throw await readResponseError(response)
  }

  return response.json()
}

async function loadWorkspaceFileDiff(path, staged) {
  const response = await fetch(`${base}__ai-ins-agent/changes?file=${encodeURIComponent(path)}&staged=${staged ? 1 : 0}`)

  if (!response.ok) {
    throw await readResponseError(response)
  }

  return response.json()
}

async function stageWorkspaceFiles(paths, staged) {
  const response = await fetch(`${base}__ai-ins-agent/changes?action=${staged ? 'stage' : 'unstage'}`, {
    body: JSON.stringify({ paths }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  })

  if (!response.ok) {
    throw await readResponseError(response)
  }

  return response.json()
}

async function pinAgentRun(runId, pinned) {
  const response = await fetch(`${base}__ai-ins-agent/runs?id=${encodeURIComponent(runId)}&action=${pinned ? 'pin' : 'unpin'}`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw await readResponseError(response)
  }

  return response.json()
}

async function stopAgentRun(runId) {
  const response = await fetch(`${base}__ai-ins-agent/runs?id=${encodeURIComponent(runId)}&action=stop`, {
    method: 'POST',
  })

  if (!response.ok) {
    throw await readResponseError(response)
  }

  return response.json()
}

async function clearFinishedAgentRuns() {
  const response = await fetch(`${base}__ai-ins-agent/runs?scope=finished`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw await readResponseError(response)
  }

  return response.json()
}

async function deleteAgentRun(runId) {
  const response = await fetch(`${base}__ai-ins-agent/runs?id=${encodeURIComponent(runId)}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw await readResponseError(response)
  }

  return response.json()
}

/*
 * Panel settings live in ~/.ai-ins/settings.json, shared by every project,
 * port and browser. localStorage stays as the synchronous copy the panel
 * reads; every change goes to both, and the file wins when the page loads.
 */
const userSettingFields = {
  'ai-ins-locale': 'locale',
  'ai-ins-notify': 'notify',
  'ai-ins-panel-submit-shortcut': 'submitShortcut',
  'ai-ins-panel-theme': 'theme',
  'ai-ins-permission-mode': 'permissionMode',
  'ai-ins-provider': 'provider',
  'ai-ins-proxy': 'proxy',
  'ai-ins-proxy-mode': 'proxyMode',
}
let pendingUserSettings = {}
let userSettingsTimer

function toUserSettingValue(storageKey, value) {
  if (storageKey === 'ai-ins-notify') return value === 'on'
  return value || ''
}

function fromUserSettingValue(storageKey, value) {
  if (storageKey === 'ai-ins-notify') return value ? 'on' : 'off'
  return typeof value === 'string' ? value : ''
}

function flushUserSettings() {
  const patch = pendingUserSettings
  pendingUserSettings = {}
  userSettingsTimer = undefined
  if (!Object.keys(patch).length) return
  void fetch(`${base}__ai-ins-settings`, {
    body: JSON.stringify(patch),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
  }).catch((error) => console.warn('[ai-ins] save settings failed:', error))
}

/** Store a setting locally and queue it for the settings file. `null` / '' clears it. */
function rememberSetting(storageKey, value) {
  try {
    if (value) window.localStorage.setItem(storageKey, value)
    else window.localStorage.removeItem(storageKey)
  } catch {
    // Ignore storage restrictions in embedded browsers.
  }

  const field = userSettingFields[storageKey]
  if (!field) return
  pendingUserSettings[field] = toUserSettingValue(storageKey, value)
  window.clearTimeout(userSettingsTimer)
  userSettingsTimer = window.setTimeout(flushUserSettings, 300)
}

globalThis.aiInsRememberSetting = rememberSetting

/**
 * Pull the settings file into localStorage. Keys the file does not have yet
 * (first run, or older files) are filled from this browser, so nothing set
 * before the file existed is lost.
 */
async function loadUserSettings() {
  let payload
  try {
    const response = await fetch(`${base}__ai-ins-settings`)
    if (!response.ok) return
    payload = await response.json()
  } catch {
    return
  }

  const settings = payload.settings || {}
  let changed = false
  for (const [storageKey, field] of Object.entries(userSettingFields)) {
    let local = null
    try {
      local = window.localStorage.getItem(storageKey)
    } catch {
      // Ignore storage restrictions in embedded browsers.
    }

    if (field in settings) {
      const value = fromUserSettingValue(storageKey, settings[field])
      if (value !== (local || '')) {
        changed = true
        try {
          if (value) window.localStorage.setItem(storageKey, value)
          else window.localStorage.removeItem(storageKey)
        } catch {
          // Ignore storage restrictions in embedded browsers.
        }
      }
    } else if (local) {
      pendingUserSettings[field] = toUserSettingValue(storageKey, local)
    }
  }

  flushUserSettings()
  if (changed) globalThis.aiInsPanelRuntime?.applyUserSettings()
}
