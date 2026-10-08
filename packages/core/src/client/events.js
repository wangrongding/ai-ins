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

  // Element 而非 HTMLElement：svg/path 等图形元素也常是事件目标。
  if (!(event.target instanceof Element) || event.target.closest('.ai-ins-dialog, .ai-ins-dock')) {
    clearOverlay()
    return
  }

  const sourceTarget = getPickTarget(event.target)
  if (!(sourceTarget instanceof Element)) {
    clearOverlay()
    return
  }

  if (sourceTarget === currentTarget) {
    return
  }

  clearOverlay()
  currentTarget = sourceTarget
  currentTarget.dataset.aiInsTarget = 'true'
})

window.addEventListener(
  'click',
  (event) => {
    if (!event.altKey) {
      return
    }

    const target = event.target
    if (!(target instanceof Element) || target.closest('.ai-ins-dialog, .ai-ins-dock')) {
      return
    }

    const sourceTarget = getPickTarget(target)
    if (!(sourceTarget instanceof Element)) {
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
      void openInEditor(preferredLayer.path)
        .catch((error) => {
          console.error('[ai-ins] open in editor failed:', error)
        })
        .finally(cleanUp)
      return
    }

    globalThis.aiInsPanelRuntime?.showAiInsPanel(preferredLayer, layers)
    cleanUp()
  },
  true,
)

window.addEventListener('resize', () => {
  applyDockPosition()
})

void hydrateAgentRuns()
