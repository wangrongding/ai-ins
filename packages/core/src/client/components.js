function ensureDockButton() {
  if (dockButton || !runs.length || aiInsPanel) {
    return
  }

  dockButton = createElement('button', 'wbx-ai-ins-dock')
  dockButton.type = 'button'
  dockButton.addEventListener('click', (event) => {
    if (suppressDockClick) {
      event.preventDefault()
      event.stopPropagation()
      suppressDockClick = false
      return
    }

    showAiInsPanel()
  })
  dockButton.style.visibility = 'hidden'
  installDockDrag()
  document.body.append(dockButton)
  updateDockButton()
  applyDockPosition()
  dockButton.style.visibility = ''
}

function updateDockButton() {
  if (aiInsPanel) {
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
  dockButton.classList.toggle('wbx-ai-ins-dock-running', runningCount > 0)
  dockButton.textContent = runningCount ? `${runningCount} 个任务运行中` : `${runs.length} 个 AI Ins 任务`
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
    const empty = createElement('div', 'wbx-ai-ins-detail-empty', '还没有任务')
    panelRefs.list.append(empty)
    refreshRunDetail()
    return
  }

  for (const run of runs) {
    const item = createElement('button', `wbx-ai-ins-run${selectedRunId === run.id ? ' wbx-ai-ins-run-active' : ''}`)
    item.type = 'button'

    const top = createElement('div', 'wbx-ai-ins-run-top')
    top.append(
      createElement('span', `wbx-ai-ins-dot wbx-ai-ins-dot-${run.status}`),
      createElement('span', 'wbx-ai-ins-run-title', getRunTitle(run)),
      createElement('span', 'wbx-ai-ins-run-provider', run.providerLabel),
    )

    item.append(
      top,
      createElement('div', 'wbx-ai-ins-run-prompt', run.prompt),
      createElement('div', 'wbx-ai-ins-run-meta', `${getRunStatusLabel(run.status)} · ${formatRunTime(run.createdAt)}`),
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
    panelRefs.detail.append(createElement('div', 'wbx-ai-ins-detail-empty', '选择一个任务查看实时输出'))
    return
  }

  selectedRunId = run.id
  const header = createElement('div', 'wbx-ai-ins-detail-head')
  const titleWrap = createElement('div')
  titleWrap.append(
    createElement('p', 'wbx-ai-ins-detail-title', getRunTitle(run)),
    createElement(
      'div',
      'wbx-ai-ins-detail-subtitle',
      `${run.providerLabel} · ${getDisplayPath(run.sourcePath)} · ${getDisplayPath(run.logPath)}`,
    ),
  )
  const detailActions = createElement('div', 'wbx-ai-ins-detail-actions')
  const deleteButton = createElement('button', 'wbx-ai-ins-button wbx-ai-ins-button-danger', run.completed ? '删除' : '停止并删除')
  deleteButton.type = 'button'
  deleteButton.addEventListener('click', () => void deleteRun(run))
  detailActions.append(createElement('span', 'wbx-ai-ins-pill', getRunStatusLabel(run.status)), deleteButton)
  header.append(titleWrap, detailActions)

  const prompt = createElement('p', 'wbx-ai-ins-prompt', run.prompt)
  const outputWrapState = isRunWorking(run) ? 'active' : run.status
  const outputWrap = createElement('div', `wbx-ai-ins-output-wrap wbx-ai-ins-output-wrap-${outputWrapState}`)
  const output = createElement('pre', `wbx-ai-ins-output${run.status === 'failed' ? ' wbx-ai-ins-output-error' : ''}`)
  const outputText = run.output || run.statusMessage || '等待输出...'
  output.textContent = outputText.endsWith('\n') ? `${outputText}\n` : `${outputText}\n`

  const outputState = createElement('div', `wbx-ai-ins-output-state wbx-ai-ins-output-state-${isRunWorking(run) ? 'active' : run.status}`)
  outputState.append(
    createElement('span', 'wbx-ai-ins-output-state-dot'),
    createElement('span', 'wbx-ai-ins-output-state-text', getRunWorkStatus(run)),
  )
  if (isRunWorking(run)) {
    outputState.append(createLoadingSpinner())
  }
  outputWrap.append(output, outputState)

  panelRefs.detail.append(header, prompt, outputWrap)
  window.requestAnimationFrame(() => {
    output.scrollTop = output.scrollHeight
  })
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  textarea.style.top = '0'
  document.body.append(textarea)
  textarea.select()

  try {
    const copied = document.execCommand('copy')
    if (!copied) {
      throw new Error('复制失败。')
    }
  } finally {
    textarea.remove()
  }
}

function refreshComposer() {
  if (!panelRefs) {
    return
  }

  const provider = getProvider(panelRefs.providerSelect.value)
  const hasTarget = Boolean(draftTarget?.layer)
  panelRefs.targetText.textContent = hasTarget
    ? `${draftTarget.layer.name} · ${getDisplayPath(draftTarget.layer.path)}`
    : 'Option / Alt 点击页面元素选择组件'
  panelRefs.target.title = hasTarget ? `${draftTarget.layer.name} · ${draftTarget.layer.path}` : ''
  panelRefs.copyTargetButton.disabled = !hasTarget
  panelRefs.ideTargetButton.disabled = !hasTarget
  panelRefs.revealTargetButton.disabled = !hasTarget
  panelRefs.submitButton.disabled = submitting || !hasTarget || !provider?.enabled
  panelRefs.submitButton.textContent = submitting ? '启动中' : `交给 ${provider?.label || 'Agent'}`

  if (!provider?.enabled) {
    panelRefs.status.textContent = provider?.disabledReason || '这个 Agent 还没有配置'
    return
  }

  panelRefs.status.textContent = hasTarget ? 'Shift + Enter 发送，关闭面板不会中断任务' : '先 Option / Alt 点击一个 DOM'
}
