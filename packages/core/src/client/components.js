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
  if (isRunWorking(run)) {
    outputState.append(createLoadingSpinner())
  }
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
