async function openInEditor(layerPath) {
  const response = await fetch(`${base}__open-in-editor?file=${encodeURIComponent(layerPath)}`)

  if (response.ok) {
    return
  }

  console.error('[inspect] open-in-editor failed:', await response.text())
}

async function runAgentInspectEdit(layer, layers, providerId, prompt, proxy) {
  const response = await fetch(`${base}__dev-inspect-agent`, {
    body: JSON.stringify({
      file: layer.path,
      layers,
      prompt,
      provider: providerId,
      proxy,
    }),
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return response.json()
}

async function loadAgentRuns() {
  const response = await fetch(`${base}__dev-inspect-agent/runs`)

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return response.json()
}

async function deleteAgentRun(runId) {
  const response = await fetch(`${base}__dev-inspect-agent/runs?id=${encodeURIComponent(runId)}`, {
    method: 'DELETE',
  })

  if (!response.ok) {
    throw new Error(await response.text())
  }

  return response.json()
}
