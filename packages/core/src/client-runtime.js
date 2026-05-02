const root = __WBX_ROOT__
const base = __WBX_BASE__
const defaultProxy = __WBX_AGENT_PROXY__
const agentProviders = __WBX_AGENT_PROVIDERS__
const defaultAgentProviderId = __WBX_DEFAULT_AGENT_PROVIDER__
const targetAttribute = 'data-dev-inspect-target'
const sourceAttribute = 'data-agent-source'
const sourceRangeAttribute = 'data-agent-source-range'
const dockPositionStorageKey = 'agent-dev-dev-inspect-dock-position'
const proxyStorageKey = 'agent-dev-dev-inspect-proxy'
const providerStorageKey = 'agent-dev-dev-inspect-provider'

let currentTarget
let dockButton
let dockPointerState
let draftTarget
let inspectPanel
let panelRefs
let selectedRunId
let suppressDockClick = false
let submitting = false

const runs = []
const runSubscriptions = new Map()
const providers = Array.isArray(agentProviders) && agentProviders.length ? agentProviders : [{ enabled: true, id: 'codex', label: 'Codex' }]

const style = document.createElement('style')
style.setAttribute('type', 'text/css')
style.setAttribute('data-vite-dev-id', 'agent-dev-dev-inspect')
style.textContent = `[${targetAttribute}] {
  outline: auto 1px !important;
  cursor: pointer !important;
}

.wbx-dev-inspect-dialog,
.wbx-dev-inspect-dialog *,
.wbx-dev-inspect-dock {
  box-sizing: border-box;
}

.wbx-dev-inspect-dialog {
  position: fixed;
  inset: 0;
  z-index: 2147483647;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 22px;
  background: rgba(3, 7, 18, 0.58);
  color: #e5e7eb;
  font-family:
    ui-sans-serif,
    system-ui,
    -apple-system,
    BlinkMacSystemFont,
    "Segoe UI",
    sans-serif;
}

.wbx-dev-inspect-panel {
  width: min(1060px, 100%);
  max-height: min(760px, calc(100vh - 44px));
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.13);
  border-radius: 18px;
  background:
    linear-gradient(180deg, rgba(18, 24, 34, 0.98), rgba(8, 12, 20, 0.98)),
    #0b0f17;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
}

.wbx-dev-inspect-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 58px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.wbx-dev-inspect-heading {
  min-width: 0;
}

.wbx-dev-inspect-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0;
  color: #f8fafc;
}

.wbx-dev-inspect-subtitle {
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 11px;
  color: #93a4b8;
}

.wbx-dev-inspect-body {
  display: grid;
  grid-template-columns: minmax(230px, 280px) minmax(0, 1fr);
  min-height: min(520px, calc(100vh - 103px));
  max-height: calc(min(760px, 100vh - 44px) - 59px);
}

.wbx-dev-inspect-sidebar {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border-right: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.025);
}

.wbx-dev-inspect-sidebar-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 12px 8px;
}

.wbx-dev-inspect-section-label {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  color: #cbd5e1;
}

.wbx-dev-inspect-count {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  padding: 2px 7px;
  color: #94a3b8;
  font-size: 10px;
}

.wbx-dev-inspect-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: calc(100% - 44px);
  overflow: auto;
  padding: 0 8px 12px;
}

.wbx-dev-inspect-run {
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.075);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.045);
  color: inherit;
  cursor: pointer;
  padding: 10px;
  text-align: left;
  font: inherit;
}

.wbx-dev-inspect-run:hover {
  border-color: rgba(148, 163, 184, 0.38);
  background: rgba(255, 255, 255, 0.07);
}

.wbx-dev-inspect-run-active {
  border-color: rgba(56, 189, 248, 0.58);
  background: rgba(14, 165, 233, 0.11);
}

.wbx-dev-inspect-run-top {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.wbx-dev-inspect-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #94a3b8;
}

.wbx-dev-inspect-dot-running,
.wbx-dev-inspect-dot-starting {
  background: #38bdf8;
  box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.13);
}

.wbx-dev-inspect-dot-done {
  background: #34d399;
}

.wbx-dev-inspect-dot-failed,
.wbx-dev-inspect-dot-disconnected {
  background: #fb7185;
}

.wbx-dev-inspect-run-title,
.wbx-dev-inspect-run-prompt,
.wbx-dev-inspect-run-meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wbx-dev-inspect-run-title {
  flex: 1;
  font-size: 12px;
  font-weight: 700;
  color: #f8fafc;
}

.wbx-dev-inspect-run-provider {
  flex: 0 0 auto;
  color: #9ca3af;
  font-size: 10px;
}

.wbx-dev-inspect-run-prompt {
  margin-top: 6px;
  color: #cbd5e1;
  font-size: 11px;
}

.wbx-dev-inspect-run-meta {
  margin-top: 5px;
  color: #7f8ea3;
  font-size: 10px;
}

.wbx-dev-inspect-main {
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 14px;
}

.wbx-dev-inspect-composer {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.035);
  padding: 12px;
}

.wbx-dev-inspect-form-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, 190px);
  gap: 10px;
}

.wbx-dev-inspect-field {
  min-width: 0;
}

.wbx-dev-inspect-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 700;
  color: #cbd5e1;
}

.wbx-dev-inspect-label-hint {
  flex-shrink: 0;
  color: #64748b;
  font-weight: 500;
}

.wbx-dev-inspect-select,
.wbx-dev-inspect-input,
.wbx-dev-inspect-textarea {
  width: 100%;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  outline: none;
  background: rgba(2, 6, 23, 0.42);
  color: #e2e8f0;
  font: inherit;
}

.wbx-dev-inspect-select,
.wbx-dev-inspect-input {
  height: 34px;
  padding: 0 10px;
  font-size: 12px;
}

.wbx-dev-inspect-select:focus,
.wbx-dev-inspect-input:focus,
.wbx-dev-inspect-textarea:focus {
  border-color: rgba(125, 211, 252, 0.48);
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.1);
}

.wbx-dev-inspect-textarea {
  display: block;
  min-height: 116px;
  margin-top: 10px;
  resize: vertical;
  padding: 11px 12px;
  font-size: 13px;
  line-height: 1.55;
}

.wbx-dev-inspect-target {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.055);
  padding: 8px 10px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 11px;
  color: #b6c5d8;
}

.wbx-dev-inspect-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 10px;
}

.wbx-dev-inspect-status {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: #94a3b8;
}

.wbx-dev-inspect-actions {
  display: flex;
  flex-shrink: 0;
  gap: 8px;
}

.wbx-dev-inspect-button {
  height: 32px;
  border: 0;
  border-radius: 10px;
  padding: 0 12px;
  background: rgba(255, 255, 255, 0.08);
  color: #e2e8f0;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
}

.wbx-dev-inspect-button:hover {
  background: rgba(255, 255, 255, 0.13);
}

.wbx-dev-inspect-button-primary {
  background: rgba(14, 165, 233, 0.9);
  color: #f8fafc;
}

.wbx-dev-inspect-button-primary:hover {
  background: rgba(56, 189, 248, 0.96);
}

.wbx-dev-inspect-button-danger {
  background: rgba(244, 63, 94, 0.14);
  color: #fecdd3;
}

.wbx-dev-inspect-button-danger:hover {
  background: rgba(244, 63, 94, 0.22);
}

.wbx-dev-inspect-button:disabled,
.wbx-dev-inspect-textarea:disabled,
.wbx-dev-inspect-input:disabled,
.wbx-dev-inspect-select:disabled {
  cursor: default;
  opacity: 0.58;
}

.wbx-dev-inspect-detail {
  margin-top: 12px;
  min-height: 180px;
}

.wbx-dev-inspect-detail-empty {
  display: flex;
  min-height: 180px;
  align-items: center;
  justify-content: center;
  border: 1px dashed rgba(148, 163, 184, 0.22);
  border-radius: 16px;
  color: #728197;
  font-size: 12px;
}

.wbx-dev-inspect-detail-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 12px;
  align-items: start;
  margin-bottom: 10px;
}

.wbx-dev-inspect-detail-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wbx-dev-inspect-detail-title {
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #f8fafc;
  font-size: 13px;
  font-weight: 750;
}

.wbx-dev-inspect-detail-subtitle {
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  color: #8da0b7;
  font-size: 11px;
}

.wbx-dev-inspect-pill {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  padding: 4px 9px;
  color: #cbd5e1;
  font-size: 11px;
}

.wbx-dev-inspect-prompt {
  margin: 0 0 10px;
  border-left: 2px solid rgba(56, 189, 248, 0.5);
  padding-left: 10px;
  color: #dbe4ef;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
}

.wbx-dev-inspect-output {
  position: relative;
  z-index: 1;
  display: block;
  width: 100%;
  max-height: 200px;
  min-height: 170px;
  margin: 0;
  overflow: auto;
  border: 0;
  border-radius: 14px;
  background: rgba(2, 6, 23, 0.72);
  color: #cbd5e1;
  padding: 12px 12px 58px;
  scroll-padding-bottom: 58px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace;
  font-size: 11px;
  line-height: 1.55;
}

.wbx-dev-inspect-output-wrap {
  position: relative;
  overflow: hidden;
  border-radius: 16px;
  padding: 2px;
  background: linear-gradient(90deg, rgba(148, 163, 184, 0.34), rgba(71, 85, 105, 0.3));
  box-shadow: 0 18px 54px rgba(0, 0, 0, 0.32);
}

.wbx-dev-inspect-output-wrap::before {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 0;
  border-radius: inherit;
  background: inherit;
}

.wbx-dev-inspect-output-wrap-active {
  background: transparent;
}

.wbx-dev-inspect-output-wrap-active::before {
  inset: -75%;
  border-radius: 999px;
  background: conic-gradient(from 0deg, #ff2d55, #ffcc00, #34c759, #00c7ff, #7c3aed, #ff2d55);
  animation: wbx-dev-inspect-rainbow-border 1.6s linear infinite;
}

.wbx-dev-inspect-output-wrap-done {
  background: #22c55e;
}

.wbx-dev-inspect-output-wrap-failed,
.wbx-dev-inspect-output-wrap-disconnected {
  background: #ef4444;
}

.wbx-dev-inspect-output-state {
  position: absolute;
  right: 10px;
  bottom: 10px;
  left: 10px;
  z-index: 2;
  display: flex;
  min-height: 32px;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  border: 1px solid rgba(148, 163, 184, 0.16);
  border-radius: 11px;
  background: rgba(8, 13, 23, 0.86);
  color: #aab7c7;
  padding: 0 10px;
  pointer-events: none;
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.28);
  font-size: 11px;
  line-height: 1;
}

.wbx-dev-inspect-output-state-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 999px;
  background: #94a3b8;
}

.wbx-dev-inspect-output-state-active {
  border-color: rgba(56, 189, 248, 0.24);
  color: #d8e7f6;
}

.wbx-dev-inspect-output-state-active .wbx-dev-inspect-output-state-dot {
  background: #38bdf8;
  animation: wbx-dev-inspect-pulse 1.35s ease-in-out infinite;
}

.wbx-dev-inspect-output-state-done .wbx-dev-inspect-output-state-dot {
  background: #34d399;
}

.wbx-dev-inspect-output-state-failed .wbx-dev-inspect-output-state-dot,
.wbx-dev-inspect-output-state-disconnected .wbx-dev-inspect-output-state-dot {
  background: #fb7185;
}

.wbx-dev-inspect-output-state-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wbx-dev-inspect-output-error {
  color: #fecdd3;
}

@keyframes wbx-dev-inspect-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(56, 189, 248, 0.28);
    transform: scale(0.92);
  }

  50% {
    box-shadow: 0 0 0 6px rgba(56, 189, 248, 0);
    transform: scale(1.08);
  }
}

@keyframes wbx-dev-inspect-rainbow-border {
  to {
    transform: rotate(1turn);
  }
}

.wbx-dev-inspect-dock {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 2147483646;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(280px, calc(100vw - 36px));
  height: 36px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(10, 15, 24, 0.92);
  color: #e2e8f0;
  cursor: grab;
  padding: 0 13px;
  box-shadow: 0 14px 38px rgba(0, 0, 0, 0.36);
  font: inherit;
  font-size: 12px;
  font-weight: 750;
  touch-action: none;
  user-select: none;
}

.wbx-dev-inspect-dock-dragging {
  cursor: grabbing;
}

.wbx-dev-inspect-dock::before {
  content: "";
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #34d399;
}

.wbx-dev-inspect-dock-running::before {
  background: #38bdf8;
  box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.13);
}

@media (max-width: 780px) {
  .wbx-dev-inspect-dialog {
    padding: 12px;
  }

  .wbx-dev-inspect-body {
    grid-template-columns: 1fr;
    min-height: 0;
  }

  .wbx-dev-inspect-sidebar {
    max-height: 190px;
    border-right: 0;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .wbx-dev-inspect-form-grid {
    grid-template-columns: 1fr;
  }
}
`
document.head.appendChild(style)

function createElement(tag, className, text) {
  const element = document.createElement(tag)
  if (className) {
    element.className = className
  }
  if (text !== undefined) {
    element.textContent = text
  }
  return element
}

function clearOverlay() {
  if (!currentTarget) {
    return
  }

  const target = document.querySelector(`[${targetAttribute}]`)
  if (target instanceof HTMLElement) {
    delete target.dataset.devInspectTarget
  }

  currentTarget = undefined
}

function cleanUp() {
  clearOverlay()
}

function closeAgentPanel() {
  if (!inspectPanel) {
    return
  }

  inspectPanel.remove()
  inspectPanel = undefined
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
    return window.localStorage.getItem(proxyStorageKey) || defaultProxy || ''
  } catch {
    return defaultProxy || ''
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
      dockButton.classList.add('wbx-dev-inspect-dock-dragging')
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
    dockButton.classList.remove('wbx-dev-inspect-dock-dragging')
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
    dockButton.classList.remove('wbx-dev-inspect-dock-dragging')
    dockPointerState = undefined
    suppressDockClick = false
  })
}

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

function getRunStatusLabel(status) {
  switch (status) {
    case 'starting':
      return '启动中'
    case 'running':
      return '运行中'
    case 'done':
      return '已完成'
    case 'failed':
      return '失败'
    case 'disconnected':
      return '连接断开'
    default:
      return '等待'
  }
}

function isRunWorking(run) {
  return run.status === 'starting' || run.status === 'running'
}

function getRunWorkStatus(run) {
  if (run.status === 'starting') {
    return `${run.providerLabel} 正在启动，马上开始处理这块代码`
  }

  if (run.status === 'running') {
    return run.statusMessage || `${run.providerLabel} 正在分析代码和整理改动`
  }

  if (run.status === 'done') {
    return `${run.providerLabel} 已完成`
  }

  if (run.status === 'failed') {
    return run.statusMessage || `${run.providerLabel} 执行失败`
  }

  if (run.status === 'disconnected') {
    return '进度连接断开，可以继续查看日志或刷新重连'
  }

  return '等待任务输出'
}

function getRunTitle(run) {
  return run.sourceName || getDisplayPath(run.sourcePath || '')
}

function formatRunTime(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function trimOutput(output) {
  return output.length > 70000 ? output.slice(-60000) : output
}

function appendRunOutput(run, message, tone) {
  const prefix = tone === 'stderr' ? '[stderr] ' : ''
  run.output = trimOutput(`${run.output}${prefix}${message}`)

  if (selectedRunId === run.id) {
    refreshRunDetail()
  }
}

function removeClientRun(runId) {
  const index = runs.findIndex((run) => run.id === runId)
  if (index === -1) {
    return
  }

  runSubscriptions.get(runId)?.close()
  runSubscriptions.delete(runId)
  runs.splice(index, 1)

  if (selectedRunId === runId) {
    selectedRunId = runs[0]?.id
  }

  refreshRunList()
  refreshRunDetail()
  updateDockButton()
}

async function deleteRun(run) {
  try {
    await deleteAgentRun(run.id)
    removeClientRun(run.id)
  } catch (error) {
    if (panelRefs) {
      panelRefs.status.textContent = error instanceof Error ? error.message : String(error)
    }
  }
}

function ensureDockButton() {
  if (dockButton || !runs.length || inspectPanel) {
    return
  }

  dockButton = createElement('button', 'wbx-dev-inspect-dock')
  dockButton.type = 'button'
  dockButton.addEventListener('click', (event) => {
    if (suppressDockClick) {
      event.preventDefault()
      event.stopPropagation()
      suppressDockClick = false
      return
    }

    showAgentPanel()
  })
  dockButton.style.visibility = 'hidden'
  installDockDrag()
  document.body.append(dockButton)
  updateDockButton()
  applyDockPosition()
  dockButton.style.visibility = ''
}

function updateDockButton() {
  if (inspectPanel) {
    dockButton?.remove()
    dockButton = undefined
    return
  }

  if (!runs.length) {
    dockButton?.remove()
    dockButton = undefined
    return
  }

  if (!dockButton) {
    ensureDockButton()
    return
  }

  const runningCount = runs.filter((run) => run.status === 'running' || run.status === 'starting').length
  dockButton.classList.toggle('wbx-dev-inspect-dock-running', runningCount > 0)
  dockButton.textContent = runningCount ? `${runningCount} 个任务运行中` : `${runs.length} 个 Inspect 任务`
  window.requestAnimationFrame(() => applyDockPosition())
}

function refreshRunList() {
  if (!panelRefs) {
    updateDockButton()
    return
  }

  panelRefs.runCount.textContent = String(runs.length)
  panelRefs.list.replaceChildren()

  if (!runs.length) {
    const empty = createElement('div', 'wbx-dev-inspect-detail-empty', '还没有任务')
    panelRefs.list.append(empty)
    refreshRunDetail()
    return
  }

  for (const run of runs) {
    const item = createElement('button', `wbx-dev-inspect-run${selectedRunId === run.id ? ' wbx-dev-inspect-run-active' : ''}`)
    item.type = 'button'

    const top = createElement('div', 'wbx-dev-inspect-run-top')
    top.append(
      createElement('span', `wbx-dev-inspect-dot wbx-dev-inspect-dot-${run.status}`),
      createElement('span', 'wbx-dev-inspect-run-title', getRunTitle(run)),
      createElement('span', 'wbx-dev-inspect-run-provider', run.providerLabel),
    )

    item.append(
      top,
      createElement('div', 'wbx-dev-inspect-run-prompt', run.prompt),
      createElement('div', 'wbx-dev-inspect-run-meta', `${getRunStatusLabel(run.status)} · ${formatRunTime(run.createdAt)}`),
    )
    item.addEventListener('click', () => {
      selectedRunId = run.id
      refreshRunList()
      refreshRunDetail()
    })
    panelRefs.list.append(item)
  }

  updateDockButton()
}

function refreshRunDetail() {
  if (!panelRefs) {
    return
  }

  const run = runs.find((candidate) => candidate.id === selectedRunId) || runs[0]
  panelRefs.detail.replaceChildren()

  if (!run) {
    panelRefs.detail.append(createElement('div', 'wbx-dev-inspect-detail-empty', '选择一个任务查看实时输出'))
    return
  }

  selectedRunId = run.id
  const header = createElement('div', 'wbx-dev-inspect-detail-head')
  const titleWrap = createElement('div')
  titleWrap.append(
    createElement('p', 'wbx-dev-inspect-detail-title', getRunTitle(run)),
    createElement(
      'div',
      'wbx-dev-inspect-detail-subtitle',
      `${run.providerLabel} · ${getDisplayPath(run.sourcePath)} · ${getDisplayPath(run.logPath)}`,
    ),
  )
  const detailActions = createElement('div', 'wbx-dev-inspect-detail-actions')
  const deleteButton = createElement('button', 'wbx-dev-inspect-button wbx-dev-inspect-button-danger', run.completed ? '删除' : '停止并删除')
  deleteButton.type = 'button'
  deleteButton.addEventListener('click', () => void deleteRun(run))
  detailActions.append(createElement('span', 'wbx-dev-inspect-pill', getRunStatusLabel(run.status)), deleteButton)
  header.append(titleWrap, detailActions)

  const prompt = createElement('p', 'wbx-dev-inspect-prompt', run.prompt)
  const outputWrapState = isRunWorking(run) ? 'active' : run.status
  const outputWrap = createElement('div', `wbx-dev-inspect-output-wrap wbx-dev-inspect-output-wrap-${outputWrapState}`)
  const output = createElement('pre', `wbx-dev-inspect-output${run.status === 'failed' ? ' wbx-dev-inspect-output-error' : ''}`)
  const outputText = run.output || run.statusMessage || '等待输出...'
  output.textContent = outputText.endsWith('\n') ? `${outputText}\n` : `${outputText}\n`

  const outputState = createElement('div', `wbx-dev-inspect-output-state wbx-dev-inspect-output-state-${isRunWorking(run) ? 'active' : run.status}`)
  outputState.append(
    createElement('span', 'wbx-dev-inspect-output-state-dot'),
    createElement('span', 'wbx-dev-inspect-output-state-text', getRunWorkStatus(run)),
  )
  outputWrap.append(output, outputState)

  panelRefs.detail.append(header, prompt, outputWrap)
  window.requestAnimationFrame(() => {
    output.scrollTop = output.scrollHeight
  })
}

function refreshComposer() {
  if (!panelRefs) {
    return
  }

  const provider = getProvider(panelRefs.providerSelect.value)
  const hasTarget = Boolean(draftTarget?.layer)
  panelRefs.target.textContent = hasTarget
    ? `${draftTarget.layer.name} · ${getDisplayPath(draftTarget.layer.path)}`
    : 'Option / Alt 点击页面元素选择组件'
  panelRefs.submitButton.disabled = submitting || !hasTarget || !provider?.enabled
  panelRefs.submitButton.textContent = submitting ? '启动中' : `交给 ${provider?.label || 'Agent'}`

  if (!provider?.enabled) {
    panelRefs.status.textContent = provider?.disabledReason || '这个 Agent 还没有配置'
    return
  }

  panelRefs.status.textContent = hasTarget ? 'Shift + Enter 发送，关闭面板不会中断任务' : '先 Option / Alt 点击一个 DOM'
}

function subscribeAgentRun(run) {
  if (!run.id || runSubscriptions.has(run.id)) {
    return
  }

  const eventSource = new window.EventSource(`${base}__dev-inspect-agent/events?id=${encodeURIComponent(run.id)}`)
  runSubscriptions.set(run.id, eventSource)

  eventSource.onmessage = (event) => {
    let payload
    try {
      payload = JSON.parse(event.data)
    } catch {
      appendRunOutput(run, event.data)
      return
    }

    if (payload.type === 'status') {
      run.status = 'running'
      run.statusMessage = payload.message || `${run.providerLabel} 运行中`
    }

    if (payload.type === 'heartbeat') {
      run.status = run.completed ? run.status : 'running'
      run.statusMessage = payload.message || `${run.providerLabel} 运行中`
    }

    if (payload.type === 'output') {
      run.status = run.completed || run.status === 'failed' ? run.status : 'running'
      appendRunOutput(run, payload.message || '', payload.stream)
    }

    if (payload.type === 'error') {
      run.status = 'failed'
      run.completed = true
      run.statusMessage = payload.message || `${run.providerLabel} 启动失败`
      appendRunOutput(run, `\n[inspect] ${run.statusMessage}\n`, 'stderr')
      eventSource.close()
      runSubscriptions.delete(run.id)
    }

    if (payload.type === 'done') {
      run.completed = true
      run.status = payload.code === 0 ? 'done' : 'failed'
      run.statusMessage = payload.code === 0 ? `${run.providerLabel} 已完成` : `${run.providerLabel} 退出：code=${payload.code ?? 'null'}`
      eventSource.close()
      runSubscriptions.delete(run.id)
    }

    refreshRunList()
    refreshRunDetail()
  }

  eventSource.onerror = () => {
    if (run.completed) {
      return
    }

    run.status = 'disconnected'
    run.statusMessage = '进度连接断开，可继续看日志文件'
    refreshRunList()
    refreshRunDetail()
  }
}

function upsertRunFromSummary(summary) {
  const existingRun = runs.find((run) => run.id === summary.id)
  const provider = getProvider(summary.providerId)
  const isCompleted = Boolean(summary.completed)
  const run = existingRun || {
    completed: isCompleted,
    createdAt: summary.createdAt || Date.now(),
    id: summary.id,
    logPath: summary.logPath || '',
    output: '',
    prompt: summary.prompt || '',
    providerId: summary.providerId || provider?.id || 'codex',
    providerLabel: summary.providerLabel || provider?.label || 'Agent',
    sourceName: summary.sourceName || '',
    sourcePath: summary.sourcePath || '',
    status: summary.status || (isCompleted ? 'done' : 'running'),
    statusMessage: summary.statusMessage || '',
  }

  run.completed = isCompleted
  run.createdAt = summary.createdAt || run.createdAt
  run.logPath = summary.logPath || run.logPath
  run.prompt = summary.prompt || run.prompt
  run.providerId = summary.providerId || run.providerId
  run.providerLabel = summary.providerLabel || run.providerLabel
  run.sourceName = summary.sourceName || run.sourceName
  run.sourcePath = summary.sourcePath || run.sourcePath
  run.status = summary.status || run.status
  run.statusMessage = summary.statusMessage || run.statusMessage
  run.output = isCompleted ? summary.output || run.output : `${run.providerLabel} 已启动\n日志：${getDisplayPath(run.logPath || '')}\n\n`

  if (!existingRun) {
    runs.push(run)
  }

  if (!selectedRunId) {
    selectedRunId = run.id
  }

  if (!run.completed) {
    subscribeAgentRun(run)
  }
}

async function hydrateAgentRuns() {
  try {
    const result = await loadAgentRuns()
    const summaries = Array.isArray(result.runs) ? result.runs : []

    for (const summary of summaries) {
      upsertRunFromSummary(summary)
    }

    refreshRunList()
    refreshRunDetail()
    updateDockButton()
  } catch (error) {
    console.error('[inspect] load agent runs failed:', error)
  }
}

function createRun(result, layer, provider, prompt) {
  const run = {
    completed: false,
    createdAt: Date.now(),
    id: result.runId,
    logPath: result.logPath || '',
    output: `${provider.label} 已启动\n日志：${getDisplayPath(result.logPath || '')}\n\n`,
    prompt,
    providerId: provider.id,
    providerLabel: result.providerLabel || provider.label,
    sourceName: layer.name,
    sourcePath: layer.path,
    status: 'starting',
    statusMessage: `${provider.label} 启动中`,
  }

  runs.unshift(run)
  selectedRunId = run.id
  subscribeAgentRun(run)
  refreshRunList()
  refreshRunDetail()
  updateDockButton()
}

function showAgentPanel(layer, layers) {
  if (layer) {
    draftTarget = { layer, layers }
  }

  if (inspectPanel) {
    refreshComposer()
    return
  }

  const overlay = createElement('div', 'wbx-dev-inspect-dialog')
  const panel = createElement('div', 'wbx-dev-inspect-panel')
  const header = createElement('div', 'wbx-dev-inspect-header')
  const heading = createElement('div', 'wbx-dev-inspect-heading')
  heading.append(
    createElement('p', 'wbx-dev-inspect-title', 'Inspect Agents'),
    createElement('div', 'wbx-dev-inspect-subtitle', 'Option 选 DOM，提交后可并发跟踪多个任务'),
  )

  const closeButton = createElement('button', 'wbx-dev-inspect-button', '收起')
  closeButton.type = 'button'
  closeButton.addEventListener('click', closeAgentPanel)
  header.append(heading, closeButton)

  const body = createElement('div', 'wbx-dev-inspect-body')
  const sidebar = createElement('aside', 'wbx-dev-inspect-sidebar')
  const sidebarTop = createElement('div', 'wbx-dev-inspect-sidebar-top')
  const runCount = createElement('span', 'wbx-dev-inspect-count', '0')
  sidebarTop.append(createElement('p', 'wbx-dev-inspect-section-label', '任务列表'), runCount)
  const list = createElement('div', 'wbx-dev-inspect-list')
  sidebar.append(sidebarTop, list)

  const main = createElement('main', 'wbx-dev-inspect-main')
  const form = createElement('form', 'wbx-dev-inspect-composer')
  const target = createElement('div', 'wbx-dev-inspect-target')
  const grid = createElement('div', 'wbx-dev-inspect-form-grid')

  const proxyField = createElement('label', 'wbx-dev-inspect-field')
  const proxyLabel = createElement('span', 'wbx-dev-inspect-label')
  proxyLabel.append(createElement('span', '', '代理'), createElement('span', 'wbx-dev-inspect-label-hint', '可留空'))
  const proxyInput = createElement('input', 'wbx-dev-inspect-input')
  proxyInput.type = 'url'
  proxyInput.placeholder = 'http://127.0.0.1:7890'
  proxyInput.value = readStoredProxy()
  proxyField.append(proxyLabel, proxyInput)

  const providerField = createElement('label', 'wbx-dev-inspect-field')
  const providerLabel = createElement('span', 'wbx-dev-inspect-label')
  providerLabel.append(createElement('span', '', 'Agent'), createElement('span', 'wbx-dev-inspect-label-hint', '可切换'))
  const providerSelect = createElement('select', 'wbx-dev-inspect-select')
  const storedProviderId = readStoredProviderId()
  for (const provider of providers) {
    const option = createElement('option', '', `${provider.label}${provider.enabled ? '' : '（未配置）'}`)
    option.value = provider.id
    option.disabled = !provider.enabled
    providerSelect.append(option)
  }
  providerSelect.value = getProvider(storedProviderId)?.id || defaultAgentProviderId
  providerSelect.addEventListener('change', () => {
    saveStoredProviderId(providerSelect.value)
    refreshComposer()
  })
  providerField.append(providerLabel, providerSelect)
  grid.append(proxyField, providerField)

  const textarea = createElement('textarea', 'wbx-dev-inspect-textarea')
  textarea.placeholder = '描述你想怎么改这个 DOM / 组件，例如：把这个区域改紧凑一点，保留当前交互逻辑。'

  const footer = createElement('div', 'wbx-dev-inspect-footer')
  const status = createElement('div', 'wbx-dev-inspect-status')
  const actions = createElement('div', 'wbx-dev-inspect-actions')
  const submitButton = createElement('button', 'wbx-dev-inspect-button wbx-dev-inspect-button-primary')
  submitButton.type = 'submit'
  actions.append(submitButton)
  footer.append(status, actions)
  form.append(target, grid, textarea, footer)

  const detail = createElement('section', 'wbx-dev-inspect-detail')
  main.append(form, detail)
  body.append(sidebar, main)
  panel.append(header, body)
  overlay.append(panel)
  document.body.append(overlay)

  inspectPanel = overlay
  panelRefs = {
    detail,
    list,
    providerSelect,
    proxyInput,
    runCount,
    status,
    submitButton,
    target,
    textarea,
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeAgentPanel()
    }
  })
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAgentPanel()
    }
  })
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      form.requestSubmit()
    }
  })
  form.addEventListener('submit', async (event) => {
    event.preventDefault()

    const prompt = textarea.value.trim()
    const provider = getProvider(providerSelect.value)
    if (!draftTarget?.layer) {
      status.textContent = '先 Option / Alt 点击一个 DOM。'
      return
    }

    if (!provider?.enabled) {
      status.textContent = provider?.disabledReason || '这个 Agent 还没有配置。'
      return
    }

    if (!prompt) {
      status.textContent = '先写一句你想怎么改。'
      textarea.focus()
      return
    }

    submitting = true
    refreshComposer()
    status.textContent = `正在启动 ${provider.label}...`
    const proxy = proxyInput.value.trim()
    saveStoredProxy(proxy)
    saveStoredProviderId(provider.id)

    try {
      const result = await runAgentInspectEdit(draftTarget.layer, draftTarget.layers, provider.id, prompt, proxy)
      createRun(result, draftTarget.layer, provider, prompt)
      textarea.value = ''
      status.textContent = `${provider.label} 已启动，可以继续点别的 DOM 发新任务。`
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error)
    } finally {
      submitting = false
      refreshComposer()
    }
  })

  refreshComposer()
  refreshRunList()
  refreshRunDetail()
  updateDockButton()
  window.setTimeout(() => textarea.focus(), 0)
}

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
