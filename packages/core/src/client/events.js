window.addEventListener('blur', cleanUp)

window.addEventListener('keyup', (event) => {
  if (!event.altKey) {
    cleanUp()
  }
})

window.addEventListener('mousemove', (event) => {
  if (!event.altKey) {
    cleanUp()
    return
  }

  if (!(event.target instanceof HTMLElement) || event.target.closest('.wbx-dev-inspect-dialog, .wbx-dev-inspect-dock')) {
    clearOverlay()
    return
  }

  const sourceTarget = getSourceElement(event.target)
  if (!(sourceTarget instanceof HTMLElement)) {
    clearOverlay()
    return
  }

  if (sourceTarget === currentTarget) {
    return
  }

  clearOverlay()
  currentTarget = sourceTarget
  currentTarget.dataset.devInspectTarget = 'true'
})

window.addEventListener(
  'click',
  (event) => {
    if (!event.altKey) {
      return
    }

    const target = event.target
    if (!(target instanceof HTMLElement) || target.closest('.wbx-dev-inspect-dialog, .wbx-dev-inspect-dock')) {
      return
    }

    const sourceTarget = getSourceElement(target)
    if (!(sourceTarget instanceof HTMLElement)) {
      cleanUp()
      return
    }

    const layers = getLayersForElement(sourceTarget)
    const preferredLayer = getPreferredLayer(layers)
    if (!preferredLayer) {
      cleanUp()
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation?.()

    if (isOpenSourceShortcut(event)) {
      void openInEditor(preferredLayer.path).finally(cleanUp)
      return
    }

    showAgentPanel(preferredLayer, layers)
    cleanUp()
  },
  true,
)

window.addEventListener('resize', () => {
  applyDockPosition()
})

void hydrateAgentRuns()
