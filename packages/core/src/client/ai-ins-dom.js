function clearOverlay() {
  if (!currentTarget) {
    return
  }

  for (const target of document.querySelectorAll(`[${targetAttribute}]`)) {
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

  if (typeof unmountAiInsPanel === 'function') {
    unmountAiInsPanel()
  } else {
    globalThis.aiInsPanelRuntime?.unmountAiInsPanel()
  }
  aiInsPanel.remove()
  aiInsPanel = undefined
  panelRefs = undefined
  globalThis.aiInsPanelRuntime?.updateDockButton()
}

// Astro dev（devToolbar 开启时）会给 .astro 模板里的元素输出
// data-astro-source-file="<绝对路径>" 与 data-astro-source-loc="<行>:<列>"，
// 作为 data-ai-ins-source 缺失时的回退，无需运行时改写 DOM。
const astroSourceFileAttribute = 'data-astro-source-file'
const astroSourceLocAttribute = 'data-astro-source-loc'
const sourceElementSelector = `[${sourceAttribute}], [${astroSourceFileAttribute}]`

function getSourceElement(element) {
  return element.closest(sourceElementSelector)
}

// —— React fiber 兜底 ——
// 注入属性覆盖不到的 DOM（不透传 props 的组件、portal 到 body 的第三方浮层等）
// 从 fiber 树读 _debugSource（React <=18 dev 的 jsxDEV 注入）反查源位置。
// React 19 移除了 _debugSource，此路径静默失效，仍由注入属性覆盖。

function getReactFiber(element) {
  for (const key of Object.keys(element)) {
    if (key.startsWith('__reactFiber$') || key.startsWith('__reactContainer$')) {
      return element[key]
    }
  }
}

function findReactFiber(element) {
  let node = element
  while (node) {
    const fiber = getReactFiber(node)
    if (fiber) {
      return fiber
    }
    node = node.parentElement
  }
}

function isWorkspaceSourceFileName(fileName) {
  return typeof fileName === 'string' && fileName.startsWith(`${root}/`) && !fileName.includes('/node_modules/') && !fileName.includes('\\node_modules\\')
}

function getFiberName(fiber) {
  const type = fiber.type
  if (typeof type === 'string') {
    return type
  }
  if (typeof type === 'function') {
    return type.displayName || type.name || 'anonymous'
  }
  if (type && typeof type === 'object') {
    // forwardRef/memo 等包装：往内层 render/type 找可读名字。
    return type.displayName || type.render?.displayName || type.render?.name || (type.type ? getFiberName({ type: type.type }) : 'anonymous')
  }
  return 'anonymous'
}

function getFiberLayers(element) {
  const layers = []
  const seenPaths = new Set()
  let fiber = findReactFiber(element)

  while (fiber) {
    const source = fiber._debugSource
    if (source && isWorkspaceSourceFileName(source.fileName)) {
      const path = `${source.fileName}:${source.lineNumber}:${source.columnNumber || 1}`
      if (!seenPaths.has(path)) {
        seenPaths.add(path)
        layers.push({ name: getFiberName(fiber), path })
      }
    }
    fiber = fiber.return
  }

  return layers
}

// 拾取入口：优先注入属性（含从组件调用点透传下来的），否则 fiber 兜底。
function getPickTarget(element) {
  const attributed = getSourceElement(element)
  if (attributed instanceof Element) {
    return attributed
  }

  return getFiberLayers(element).length ? element : undefined
}

function getSourcePath(element) {
  const path = element.getAttribute(sourceAttribute)
  if (path) {
    return path
  }

  // 依赖包（如主题、组件库）里的 .astro 不作为定位目标，交给外层应用侧元素。
  const astroFile = element.getAttribute(astroSourceFileAttribute)
  if (!astroFile || astroFile.includes('/node_modules/') || astroFile.includes('\\node_modules\\')) {
    return undefined
  }

  const astroLoc = element.getAttribute(astroSourceLocAttribute)
  return /^\d+:\d+$/u.test(astroLoc || '') ? `${astroFile}:${astroLoc}` : `${astroFile}:1:1`
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

  while (instance && instance instanceof Element) {
    const path = getSourcePath(instance)
    if (path) {
      layers.push({ name: getElementName(instance), path, range: getSourceRange(instance) })
    }

    instance = instance.parentElement?.closest(sourceElementSelector)
  }

  // 属性链完全没命中（portal / 不透传 props 的组件）时退回 fiber 解析。
  return layers.length ? layers : getFiberLayers(element)
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

function readStoredProxyMode() {
  try {
    return window.localStorage.getItem(proxyModeStorageKey) || ''
  } catch {
    return ''
  }
}

function saveStoredProxyMode(proxyMode) {
  try {
    if (proxyMode) {
      window.localStorage.setItem(proxyModeStorageKey, proxyMode)
    } else {
      window.localStorage.removeItem(proxyModeStorageKey)
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
