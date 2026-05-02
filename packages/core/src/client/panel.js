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
