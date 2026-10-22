/*
 * The pick highlight is its own fixed box drawn over the target, not an outline
 * on the target: the host's styles on the target or its ancestors (mask-image,
 * clip-path, overflow: hidden, outline: none !important…) would clip or hide
 * that. Where popovers are supported the box sits in the top layer, so it also
 * shows above the host's modals and popovers.
 */
let pickOverlay
let pickOverlayLabel
let pickOverlayFrame
let pickOverlayBox = ''

/*
 * Option / Alt + ↑ / ↓ walks the highlight from the element under the pointer
 * up to its ancestors and back. That reaches containers the pointer cannot:
 * ones whose children cover them, or whose own area is an Electron window-drag
 * region (`-webkit-app-region: drag`), which never gets mouse events.
 * `pickChain[0]` is the element under the pointer; `currentTarget` is
 * `pickChain[pickDepth]`.
 */
let pickChain = []
let pickDepth = 0

// Label height plus its gap: a box closer than this to the viewport edge gets the label inside.
const pickLabelSpace = 26
// How far the ring reaches outside the box (outline offset + width, matching style.css).
const pickRingOutset = 4

function getPickOverlay() {
  if (pickOverlay?.isConnected) {
    return pickOverlay
  }

  pickOverlay = document.createElement('div')
  pickOverlay.className = 'ai-ins-pick-overlay'
  pickOverlay.setAttribute('aria-hidden', 'true')
  if (typeof pickOverlay.showPopover === 'function') {
    pickOverlay.popover = 'manual'
  }
  pickOverlayLabel = document.createElement('div')
  pickOverlayLabel.className = 'ai-ins-pick-label'
  pickOverlay.append(pickOverlayLabel)
  // Outside <body>, so a transform or filter on the body cannot become its containing block.
  document.documentElement.append(pickOverlay)
  return pickOverlay
}

/**
 * The nearest pickable ancestor that has a box to highlight, stopping below
 * <body>: the page itself is not a component. Wrappers without a box
 * (`display: contents`) are skipped, since nothing would show; they still
 * appear in the layers sent with the pick.
 */
function getParentPickTarget(element) {
  let current = element
  while (true) {
    const parent = current.parentElement
    if (!parent || parent === document.body || parent === document.documentElement) {
      return undefined
    }

    const target = getPickTarget(parent)
    if (!(target instanceof Element) || target === document.body || target === document.documentElement) {
      return undefined
    }

    if (target.getClientRects().length) {
      return target
    }
    current = target
  }
}

function getPickLabelText(target) {
  const tag = target.tagName.toLowerCase()
  const path = getLayersForElement(target)[0]?.path
  const file = path ? path.split(/[\\/]/u).pop() : ''
  return file ? `${tag} · ${file}` : tag
}

function renderPickLabel(target) {
  const label = pickOverlayLabel
  const modifier = isMacPlatform() ? '⌥' : 'Alt+'
  const name = document.createElement('span')
  name.className = 'ai-ins-pick-label-name'
  name.textContent = getPickLabelText(target)
  const up = document.createElement('span')
  up.className = 'ai-ins-pick-label-key'
  up.textContent = `${modifier}↑`
  up.dataset.disabled = String(!getParentPickTarget(target))
  const down = document.createElement('span')
  down.className = 'ai-ins-pick-label-key'
  down.textContent = `${modifier}↓`
  down.dataset.disabled = String(pickDepth === 0)
  label.replaceChildren(name, up, down)
}

function showPickOverlay(target) {
  const overlay = getPickOverlay()
  overlay.style.display = ''
  overlay.style.borderRadius = getComputedStyle(target).borderRadius
  renderPickLabel(target)
  if (overlay.popover) {
    // Re-enter the top layer, above any modal or popover the host opened since the last pick.
    if (overlay.matches(':popover-open')) {
      overlay.hidePopover()
    }
    overlay.showPopover()
  }
  pickOverlayBox = ''
  window.cancelAnimationFrame(pickOverlayFrame)
  positionPickOverlay()
}

/** Above the box, else below it, else inside its top edge; kept within the viewport horizontally. */
function placePickLabel(rect) {
  const label = pickOverlayLabel
  const style = label.style
  style.top = ''
  style.bottom = ''
  if (rect.top >= pickLabelSpace) {
    style.bottom = `calc(100% + 6px)`
  } else if (rect.bottom + pickLabelSpace <= window.innerHeight) {
    style.top = `calc(100% + 6px)`
  } else {
    style.top = '4px'
  }

  const width = label.offsetWidth
  const minLeft = 4 - rect.left
  const maxLeft = window.innerWidth - 4 - width - rect.left
  style.left = `${Math.max(minLeft, Math.min(-2, maxLeft))}px`
}

/** Follow the target through scrolling, layout changes and transitions while the pick is shown. */
function positionPickOverlay() {
  pickOverlayFrame = undefined
  if (!currentTarget || !pickOverlay) {
    return
  }

  // The box sits in the top layer, above the panel too: never leave it over an open panel.
  if (!currentTarget.isConnected || aiInsPanel?.isConnected) {
    clearOverlay()
    return
  }

  const rect = currentTarget.getBoundingClientRect()
  const box = `${rect.left} ${rect.top} ${rect.width} ${rect.height} ${window.innerWidth} ${window.innerHeight}`
  if (box !== pickOverlayBox) {
    pickOverlayBox = box
    const style = pickOverlay.style
    style.visibility = rect.width || rect.height ? '' : 'hidden'
    style.transform = `translate(${rect.left}px, ${rect.top}px)`
    style.width = `${rect.width}px`
    style.height = `${rect.height}px`
    // The ring sits outside the box; at a viewport edge that part is off screen, so draw it inside instead.
    const edge = pickRingOutset
    const atEdge = rect.top < edge || rect.left < edge || rect.right > window.innerWidth - edge || rect.bottom > window.innerHeight - edge
    pickOverlay.dataset.inset = String(atEdge)
    placePickLabel(rect)
  }
  pickOverlayFrame = window.requestAnimationFrame(positionPickOverlay)
}

function hidePickOverlay() {
  window.cancelAnimationFrame(pickOverlayFrame)
  pickOverlayFrame = undefined
  if (!pickOverlay) {
    return
  }

  if (pickOverlay.popover && pickOverlay.matches(':popover-open')) {
    pickOverlay.hidePopover()
  }
  pickOverlay.style.display = 'none'
}

function highlightPickTarget(target) {
  if (currentTarget && currentTarget !== target) {
    delete currentTarget.dataset.aiInsTarget
  }
  currentTarget = target
  currentTarget.dataset.aiInsTarget = 'true'
  showPickOverlay(currentTarget)
}

/** The pointer moved: a new element under it starts the chain over; the same one keeps the level walked to. */
function hoverPickTarget(target) {
  if (target === pickChain[0] && currentTarget?.isConnected) {
    return
  }

  pickChain = [target]
  pickDepth = 0
  highlightPickTarget(target)
}

/** `1` goes to the parent, `-1` back to the child. Returns false when nothing is highlighted to walk from. */
function walkPickTarget(step) {
  if (!currentTarget?.isConnected) {
    return false
  }

  if (step > 0) {
    const parent = getParentPickTarget(currentTarget)
    if (!parent) {
      return true
    }
    // Re-derive the parent each time: the DOM may have changed since the chain was built.
    pickChain = [...pickChain.slice(0, pickDepth + 1), parent]
    pickDepth += 1
  } else {
    if (pickDepth === 0) {
      return true
    }
    pickDepth -= 1
    if (!pickChain[pickDepth]?.isConnected) {
      clearOverlay()
      return true
    }
  }

  highlightPickTarget(pickChain[pickDepth])
  return true
}

/** What a click picks: the walked-to level while the pointer is still over the element the walk started from. */
function getChosenPickTarget(target) {
  return target === pickChain[0] && currentTarget?.isConnected ? currentTarget : target
}

function clearOverlay() {
  pickChain = []
  pickDepth = 0
  if (!currentTarget) {
    return
  }

  hidePickOverlay()
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
  rememberSetting(providerStorageKey, providerId)
}

function readStoredProxy() {
  try {
    return window.localStorage.getItem(proxyStorageKey) || ''
  } catch {
    return ''
  }
}

function saveStoredProxy(proxy) {
  rememberSetting(proxyStorageKey, proxy)
}

function readStoredProxyMode() {
  try {
    return window.localStorage.getItem(proxyModeStorageKey) || ''
  } catch {
    return ''
  }
}

function saveStoredProxyMode(proxyMode) {
  rememberSetting(proxyModeStorageKey, proxyMode)
}

/*
 * The dock remembers which corner it was dragged towards and how far from
 * those two edges: { right | left, bottom | top }. A resize keeps it the same
 * distance from its edges, so a corner dock stays in the corner whatever the
 * window does. Without a saved anchor the stylesheet places it bottom-right.
 */
function readDockPosition() {
  try {
    const anchor = JSON.parse(window.localStorage.getItem(dockPositionStorageKey) || 'null')
    const horizontal = anchor && (Number.isFinite(anchor.left) || Number.isFinite(anchor.right))
    const vertical = anchor && (Number.isFinite(anchor.top) || Number.isFinite(anchor.bottom))
    if (horizontal && vertical) {
      return anchor
    }
  } catch {
    // Ignore malformed storage values.
  }
}

function saveDockPosition(anchor) {
  try {
    window.localStorage.setItem(dockPositionStorageKey, JSON.stringify(anchor))
  } catch {
    // Ignore storage restrictions in embedded browsers.
  }
}

function clampDockPosition(position, element = dockButton) {
  const margin = 8
  const rect = element?.getBoundingClientRect()
  const width = rect?.width || 36
  const height = rect?.height || 36
  const maxX = Math.max(margin, window.innerWidth - width - margin)
  const maxY = Math.max(margin, window.innerHeight - height - margin)

  return {
    x: Math.min(Math.max(margin, position.x), maxX),
    y: Math.min(Math.max(margin, position.y), maxY),
  }
}

/** Top-left point (from a drag) → distances from the two nearest edges. */
function toDockAnchor(position) {
  const rect = dockButton.getBoundingClientRect()
  const right = window.innerWidth - position.x - rect.width
  const bottom = window.innerHeight - position.y - rect.height
  return {
    ...(position.x + rect.width / 2 > window.innerWidth / 2 ? { right: Math.round(right) } : { left: Math.round(position.x) }),
    ...(position.y + rect.height / 2 > window.innerHeight / 2 ? { bottom: Math.round(bottom) } : { top: Math.round(position.y) }),
  }
}

/** Saved anchor → top-left point in the current window, kept on screen. Never writes back. */
function applyDockPosition(anchor = readDockPosition()) {
  if (!dockButton || !anchor) {
    return
  }

  const rect = dockButton.getBoundingClientRect()
  const x = Number.isFinite(anchor.right) ? window.innerWidth - rect.width - anchor.right : anchor.left
  const y = Number.isFinite(anchor.bottom) ? window.innerHeight - rect.height - anchor.bottom : anchor.top
  const nextPosition = clampDockPosition({ x, y })
  dockButton.style.left = `${nextPosition.x}px`
  dockButton.style.top = `${nextPosition.y}px`
  dockButton.style.right = 'auto'
  dockButton.style.bottom = 'auto'
}

/*
 * Magnet: while the dock is tucked, a pointer right by its tab (within
 * `dockPeekRadius`) makes the tab lean out. Kept small so that moving away
 * tucks it straight back. Written as a CSS variable once per frame; the
 * stylesheet does the rest.
 */
const dockPeekRadius = 32
let dockPeekFrame = 0
let dockPeekPointer

function updateDockPeek() {
  dockPeekFrame = 0
  if (!dockButton) return
  let peek = 0
  if (dockPeekPointer && dockButton.classList.contains('ai-ins-dock-tucked')) {
    const rect = dockButton.getBoundingClientRect()
    const toEdge = dockButton.dataset.edge === 'left' ? dockPeekPointer.x : window.innerWidth - dockPeekPointer.x
    const toMiddle = Math.max(0, Math.abs(dockPeekPointer.y - (rect.top + rect.height / 2)) - rect.height / 2)
    peek = Math.max(0, Math.min(1, 1 - Math.hypot(toEdge, toMiddle) / dockPeekRadius))
  }
  dockButton.style.setProperty('--ai-ins-dock-peek', peek.toFixed(3))
}

window.addEventListener(
  'pointermove',
  (event) => {
    dockPeekPointer = { x: event.clientX, y: event.clientY }
    if (!dockPeekFrame) dockPeekFrame = window.requestAnimationFrame(updateDockPeek)
  },
  { passive: true },
)

document.addEventListener('pointerleave', () => {
  dockPeekPointer = undefined
  if (!dockPeekFrame) dockPeekFrame = window.requestAnimationFrame(updateDockPeek)
})

function installDockDrag() {
  if (!dockButton) {
    return
  }

  dockButton.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) {
      return
    }

    const rect = dockButton.getBoundingClientRect()
    // A tucked dock is slid sideways by a transform; drag from where it really sits.
    const transform = getComputedStyle(dockButton).transform
    const shiftX = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).m41 : 0
    dockPointerState = {
      didDrag: false,
      offsetX: event.clientX - (rect.left - shiftX),
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
      dockButton.classList.add('ai-ins-dock-dragging')
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
    dockButton.classList.remove('ai-ins-dock-dragging')
    dockPointerState = undefined

    if (didDrag) {
      const rect = dockButton.getBoundingClientRect()
      saveDockPosition(toDockAnchor(clampDockPosition({ x: rect.left, y: rect.top })))
      // Dropped by an edge or away from one: re-decide whether it tucks.
      globalThis.aiInsPanelRuntime?.updateDockButton()
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
    dockButton.classList.remove('ai-ins-dock-dragging')
    dockPointerState = undefined
    suppressDockClick = false
  })
}
