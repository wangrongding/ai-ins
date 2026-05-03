function clearOverlay() {
  if (!currentTarget) {
    return
  }

  const target = document.querySelector(`[${targetAttribute}]`)
  if (target instanceof HTMLElement) {
    delete target.dataset.aiInsTarget
  }

  currentTarget = undefined
}

function cleanUp() {
  clearOverlay()
}

function closeAiInsPanel() {
  if (!aiInsPanel) {
    return
  }

  aiInsPanel.remove()
  aiInsPanel = undefined
  panelRefs = undefined
  updateDockButton()
}

function getSourceElement(element) {
  return element.closest(`[${sourceAttribute}]`)
}

function getSourcePath(element) {
  const path = element.getAttribute(sourceAttribute)
  return path || undefined
}

function getSourceRange(element) {
  const range = element.getAttribute(sourceRangeAttribute)
  return range || undefined
}

function getElementName(element) {
  const tag = element.tagName.toLowerCase()
  const id = element.id ? `#${element.id}` : ''
  const className = [...element.classList].slice(0, 2).map((name) => `.${name}`).join('')
  return `${tag}${id}${className}`
}

function getLayersForElement(element) {
  let instance = getSourceElement(element)
  const layers = []

  while (instance && instance instanceof HTMLElement) {
    const path = getSourcePath(instance)
    if (path) {
      layers.push({ name: getElementName(instance), path, range: getSourceRange(instance) })
    }

    instance = instance.parentElement?.closest(`[${sourceAttribute}]`)
  }

  return layers
}

function getPreferredLayer(layers) {
  return layers[0]
}

function getDisplayPath(layerPath) {
  if (layerPath.startsWith(`${root}/`)) {
    return layerPath.slice(root.length + 1)
  }

  return layerPath
}

function getProvider(providerId) {
  return providers.find((provider) => provider.id === providerId) || providers.find((provider) => provider.enabled) || providers[0]
}

function isMacPlatform() {
  const platform = navigator.userAgentData?.platform || navigator.platform || ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

function isOpenSourceShortcut(event) {
  return isMacPlatform() ? event.altKey && event.metaKey : event.ctrlKey && event.altKey
}

function readStoredProviderId() {
  try {
    const storedProviderId = window.localStorage.getItem(providerStorageKey)
    if (storedProviderId && providers.some((provider) => provider.id === storedProviderId && provider.enabled)) {
      return storedProviderId
    }
  } catch {
    // Ignore storage restrictions in embedded browsers.
  }

  return defaultAgentProviderId
}

function saveStoredProviderId(providerId) {
  try {
    window.localStorage.setItem(providerStorageKey, providerId)
  } catch {
    // Ignore storage restrictions in embedded browsers.
  }
}

function readStoredProxy() {
  try {
    return window.localStorage.getItem(proxyStorageKey) || ''
  } catch {
    return ''
  }
}

function saveStoredProxy(proxy) {
  try {
    if (proxy) {
      window.localStorage.setItem(proxyStorageKey, proxy)
    } else {
      window.localStorage.removeItem(proxyStorageKey)
    }
  } catch {
    // Ignore storage restrictions in embedded browsers.
  }
}

function readDockPosition() {
  try {
    const rawPosition = window.localStorage.getItem(dockPositionStorageKey)
    const position = rawPosition ? JSON.parse(rawPosition) : null
    if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) {
      return position
    }
  } catch {
    // Ignore malformed storage values.
  }
}

function saveDockPosition(position) {
  try {
    window.localStorage.setItem(dockPositionStorageKey, JSON.stringify(position))
  } catch {
    // Ignore storage restrictions in embedded browsers.
  }
}

function clampDockPosition(position, element = dockButton) {
  const margin = 8
  const rect = element?.getBoundingClientRect()
  const width = rect?.width || 180
  const height = rect?.height || 36
  const maxX = Math.max(margin, window.innerWidth - width - margin)
  const maxY = Math.max(margin, window.innerHeight - height - margin)

  return {
    x: Math.min(Math.max(margin, position.x), maxX),
    y: Math.min(Math.max(margin, position.y), maxY),
  }
}

function applyDockPosition(position = readDockPosition()) {
  if (!dockButton || !position) {
    return
  }

  const nextPosition = clampDockPosition(position)
  dockButton.style.left = `${nextPosition.x}px`
  dockButton.style.top = `${nextPosition.y}px`
  dockButton.style.right = 'auto'
  dockButton.style.bottom = 'auto'
  saveDockPosition(nextPosition)
}

function installDockDrag() {
  if (!dockButton) {
    return
  }

  dockButton.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return
    }

    const rect = dockButton.getBoundingClientRect()
    dockPointerState = {
      didDrag: false,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    }
    dockButton.setPointerCapture?.(event.pointerId)
  })

  dockButton.addEventListener('pointermove', (event) => {
    if (!dockPointerState || dockPointerState.pointerId !== event.pointerId) {
      return
    }

    const nextPosition = clampDockPosition({
      x: event.clientX - dockPointerState.offsetX,
      y: event.clientY - dockPointerState.offsetY,
    })
    const movedDistance = Math.abs(event.clientX - dockPointerState.startX) + Math.abs(event.clientY - dockPointerState.startY)

    if (movedDistance > 4) {
      dockPointerState.didDrag = true
      suppressDockClick = true
      dockButton.classList.add('wbx-ai-ins-dock-dragging')
    }

    event.preventDefault()
    dockButton.style.left = `${nextPosition.x}px`
    dockButton.style.top = `${nextPosition.y}px`
    dockButton.style.right = 'auto'
    dockButton.style.bottom = 'auto'
  })

  dockButton.addEventListener('pointerup', (event) => {
    if (!dockPointerState || dockPointerState.pointerId !== event.pointerId) {
      return
    }

    const didDrag = dockPointerState.didDrag
    dockButton.releasePointerCapture?.(event.pointerId)
    dockButton.classList.remove('wbx-ai-ins-dock-dragging')
    dockPointerState = undefined

    if (didDrag) {
      const rect = dockButton.getBoundingClientRect()
      saveDockPosition(clampDockPosition({ x: rect.left, y: rect.top }))
      window.setTimeout(() => {
        suppressDockClick = false
      }, 0)
    }
  })

  dockButton.addEventListener('pointercancel', (event) => {
    if (!dockPointerState || dockPointerState.pointerId !== event.pointerId) {
      return
    }

    dockButton.releasePointerCapture?.(event.pointerId)
    dockButton.classList.remove('wbx-ai-ins-dock-dragging')
    dockPointerState = undefined
    suppressDockClick = false
  })
}
