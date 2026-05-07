function showAiInsPanel(layer, layers) {
  if (layer) {
    draftTarget = { layer, layers }
  }

  if (aiInsPanel) {
    refreshComposer()
    return
  }

  const overlay = createElement('div', 'wbx-ai-ins-dialog')
  const panel = createElement('div', 'wbx-ai-ins-panel')
  const header = createElement('div', 'wbx-ai-ins-header')
  const heading = createElement('div', 'wbx-ai-ins-heading')
  heading.append(
    createElement('p', 'wbx-ai-ins-title', 'AI Ins'),
    createElement('div', 'wbx-ai-ins-subtitle', 'Option 选 DOM，提交后可并发跟踪多个任务'),
  )

  const closeButton = createElement('button', 'wbx-ai-ins-button', '收起')
  closeButton.type = 'button'
  closeButton.addEventListener('click', closeAiInsPanel)
  header.append(heading, closeButton)

  const body = createElement('div', 'wbx-ai-ins-body')
  const sidebar = createElement('aside', 'wbx-ai-ins-sidebar')
  const sidebarTop = createElement('div', 'wbx-ai-ins-sidebar-top')
  const runCount = createElement('span', 'wbx-ai-ins-count', '0')
  sidebarTop.append(createElement('p', 'wbx-ai-ins-section-label', '任务列表'), runCount)
  const list = createElement('div', 'wbx-ai-ins-list')
  sidebar.append(sidebarTop, list)

  const main = createElement('main', 'wbx-ai-ins-main')
  const form = createElement('form', 'wbx-ai-ins-composer')
  const target = createElement('div', 'wbx-ai-ins-target')
  const targetText = createElement('span', 'wbx-ai-ins-target-text')
  const targetActions = createElement('span', 'wbx-ai-ins-target-actions')
  const copyTargetIcon = [
    'M8 8h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z',
    'M4 14H3a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1',
  ]
  const copiedTargetIcon = ['M20 6 9 17l-5-5']
  const ideTargetIcon = [
    'M7 8 3 12l4 4',
    'm17 8 4 4-4 4',
    'm14 4-4 16',
  ]
  const revealTargetIcon = [
    'M3 7h5l2 2h11v9a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z',
    'M3 7V5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v2',
  ]
  const copyTargetButton = createIconButton('wbx-ai-ins-icon-button', '复制源码位置', copyTargetIcon)
  const ideTargetButton = createIconButton('wbx-ai-ins-icon-button', 'IDE 打开', ideTargetIcon)
  const revealTargetButton = createIconButton('wbx-ai-ins-icon-button', '打开所在位置', revealTargetIcon)
  targetActions.append(copyTargetButton, ideTargetButton, revealTargetButton)
  target.append(targetText, targetActions)
  const grid = createElement('div', 'wbx-ai-ins-form-grid')

  const proxyField = createElement('label', 'wbx-ai-ins-field')
  const proxyLabel = createElement('span', 'wbx-ai-ins-label')
  proxyLabel.append(createElement('span', '', 'Network Proxy'), createElement('span', 'wbx-ai-ins-label-hint', '可留空'))
  const proxyInput = createElement('input', 'wbx-ai-ins-input')
  proxyInput.type = 'url'
  proxyInput.placeholder = 'http://127.0.0.1:7890'
  proxyInput.value = readStoredProxy()
  proxyField.append(proxyLabel, proxyInput)

  const providerField = createElement('label', 'wbx-ai-ins-field')
  const providerLabel = createElement('span', 'wbx-ai-ins-label')
  providerLabel.append(createElement('span', '', 'Agent'), createElement('span', 'wbx-ai-ins-label-hint', '可切换'))
  const providerSelect = createElement('select', 'wbx-ai-ins-select')
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

  const textarea = createElement('textarea', 'wbx-ai-ins-textarea')
  textarea.placeholder = '描述你想怎么改这个 DOM / 组件，例如：把这个区域改紧凑一点，保留当前交互逻辑。'

  const footer = createElement('div', 'wbx-ai-ins-footer')
  const status = createElement('div', 'wbx-ai-ins-status')
  const actions = createElement('div', 'wbx-ai-ins-actions')
  const submitButton = createElement('button', 'wbx-ai-ins-button wbx-ai-ins-button-primary')
  submitButton.type = 'submit'
  actions.append(submitButton)
  footer.append(status, actions)
  form.append(target, grid, textarea, footer)

  const detail = createElement('section', 'wbx-ai-ins-detail')
  main.append(form, detail)
  body.append(sidebar, main)
  panel.append(header, body)
  overlay.append(panel)
  document.body.append(overlay)

  aiInsPanel = overlay
  panelRefs = {
    detail,
    list,
    providerSelect,
    proxyInput,
    runCount,
    status,
    submitButton,
    copyTargetButton,
    ideTargetButton,
    revealTargetButton,
    target,
    targetText,
    textarea,
  }

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeAiInsPanel()
    }
  })
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAiInsPanel()
    }
  })
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      form.requestSubmit()
    }
  })
  let copyTargetResetTimer
  copyTargetButton.addEventListener('click', async () => {
    if (!draftTarget?.layer) {
      return
    }

    try {
      await copyTextToClipboard(getDisplayPath(draftTarget.layer.path))
      window.clearTimeout(copyTargetResetTimer)
      copyTargetButton.classList.add('wbx-ai-ins-icon-button-success')
      setIconButtonIcon(copyTargetButton, '已复制', copiedTargetIcon)
      copyTargetResetTimer = window.setTimeout(() => {
        copyTargetButton.classList.remove('wbx-ai-ins-icon-button-success')
        setIconButtonIcon(copyTargetButton, '复制源码位置', copyTargetIcon)
      }, 1200)
      status.textContent = '已复制源码位置。'
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error)
    }
  })
  ideTargetButton.addEventListener('click', async () => {
    if (!draftTarget?.layer) {
      return
    }

    try {
      await openInEditor(draftTarget.layer.path)
      status.textContent = '已在 IDE 打开。'
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error)
    }
  })
  revealTargetButton.addEventListener('click', async () => {
    if (!draftTarget?.layer) {
      return
    }

    try {
      await revealInFolder(draftTarget.layer.path)
      status.textContent = '已打开所在位置。'
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : String(error)
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
      const result = await runAiInsAgent(draftTarget.layer, draftTarget.layers, provider.id, prompt, proxy)
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
