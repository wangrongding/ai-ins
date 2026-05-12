const scriptAttribute = 'data-ai-ins-client'

if (typeof document !== 'undefined' && !document.querySelector(`script[${scriptAttribute}]`)) {
  const script = document.createElement('script')
  script.setAttribute(scriptAttribute, 'true')
  script.src = '/__ai-ins/client.js'
  script.type = 'module'
  document.head.append(script)
}
