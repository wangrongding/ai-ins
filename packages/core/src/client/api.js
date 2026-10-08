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

async function answerAgentPermission(runId, requestId, decision) {
  const query = `run=${encodeURIComponent(runId)}&request=${encodeURIComponent(requestId)}&decision=${encodeURIComponent(decision)}`
  const response = await fetch(`${base}__ai-ins-agent/permission?${query}`, { method: 'POST' })

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
