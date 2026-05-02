const style = document.createElement('style')
style.setAttribute('type', 'text/css')
style.setAttribute('data-vite-dev-id', 'agent-dev-dev-inspect')
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

function createLoadingSpinner() {
  const spinner = createSvgElement('svg', {
    'aria-hidden': 'true',
    class: 'wbx-dev-inspect-output-state-spinner',
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
