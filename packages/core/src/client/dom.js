const style = document.createElement('style')
style.setAttribute('type', 'text/css')
style.setAttribute('data-vite-dev-id', 'ai-ins')
style.textContent = __WBX_CLIENT_STYLE__.replaceAll('__WBX_TARGET_ATTRIBUTE__', targetAttribute)
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

function createSvgElement(tag, attributes = {}) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', tag)
  for (const [key, value] of Object.entries(attributes)) {
    element.setAttribute(key, value)
  }
  return element
}

function createIcon(paths, label) {
  const icon = createSvgElement('svg', {
    'aria-hidden': 'true',
    fill: 'none',
    viewBox: '0 0 24 24',
  })
  icon.append(
    ...paths.map((path) =>
      createSvgElement('path', {
        d: path,
        stroke: 'currentColor',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
        'stroke-width': '2',
      }),
    ),
  )
  icon.dataset.label = label
  return icon
}

function createIconButton(className, label, paths) {
  const button = createElement('button', className)
  button.type = 'button'
  setIconButtonIcon(button, label, paths)
  return button
}

function setIconButtonIcon(button, label, paths) {
  button.title = label
  button.setAttribute('aria-label', label)
  button.replaceChildren(createIcon(paths, label))
}

function createLoadingSpinner() {
  const spinner = createSvgElement('svg', {
    'aria-hidden': 'true',
    class: 'wbx-ai-ins-output-state-spinner',
    fill: 'none',
    viewBox: '0 0 24 24',
  })
  spinner.append(
    createSvgElement('circle', {
      cx: '12',
      cy: '12',
      opacity: '0.22',
      r: '8.5',
      stroke: 'currentColor',
      'stroke-width': '3',
    }),
    createSvgElement('path', {
      d: 'M20.5 12a8.5 8.5 0 0 0-8.5-8.5',
      stroke: 'currentColor',
      'stroke-linecap': 'round',
      'stroke-width': '3.2',
    }),
    createSvgElement('path', {
      d: 'M17.4 5.9a8.5 8.5 0 0 1 2.7 4.1',
      opacity: '0.62',
      stroke: '#bfdbfe',
      'stroke-linecap': 'round',
      'stroke-width': '3.2',
    }),
  )
  return spinner
}
