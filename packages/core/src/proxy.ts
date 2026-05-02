import { execSync } from 'child_process'

let cachedSystemProxy: string | undefined

export function normalizeProxy(rawProxy: unknown) {
  const proxy = typeof rawProxy === 'string' ? rawProxy.trim() : ''
  if (!proxy) {
    return ''
  }

  try {
    const url = new URL(proxy)
    if (!['http:', 'https:', 'socks4:', 'socks5:'].includes(url.protocol)) {
      return ''
    }

    return url.toString()
  } catch {
    return ''
  }
}

export function getConfiguredCodexProxy(pluginProxy = '') {
  return (
    normalizeProxy(pluginProxy) ||
    normalizeProxy(process.env.CODEX_INSPECT_PROXY) ||
    normalizeProxy(process.env.HTTPS_PROXY) ||
    normalizeProxy(process.env.HTTP_PROXY) ||
    normalizeProxy(process.env.ALL_PROXY) ||
    normalizeProxy(process.env.https_proxy) ||
    normalizeProxy(process.env.http_proxy) ||
    normalizeProxy(process.env.all_proxy) ||
    getSystemProxy()
  )
}

export function getConfiguredAgentProxy(providerProxy = '', fallbackProxy = '') {
  return (
    normalizeProxy(providerProxy) ||
    normalizeProxy(fallbackProxy) ||
    normalizeProxy(process.env.CODEX_INSPECT_PROXY) ||
    normalizeProxy(process.env.HTTPS_PROXY) ||
    normalizeProxy(process.env.HTTP_PROXY) ||
    normalizeProxy(process.env.ALL_PROXY) ||
    normalizeProxy(process.env.https_proxy) ||
    normalizeProxy(process.env.http_proxy) ||
    normalizeProxy(process.env.all_proxy) ||
    getSystemProxy()
  )
}

function getSystemProxy() {
  if (cachedSystemProxy !== undefined) {
    return cachedSystemProxy
  }

  if (process.platform === 'darwin') {
    cachedSystemProxy = getMacSystemProxy()
  } else if (process.platform === 'win32') {
    cachedSystemProxy = getWindowsSystemProxy()
  } else {
    cachedSystemProxy = ''
  }

  return cachedSystemProxy
}

function getMacSystemProxy() {
  try {
    return parseMacSystemProxy(execSync('scutil --proxy', { stdio: ['ignore', 'pipe', 'ignore'] }).toString())
  } catch {
    return ''
  }
}

function parseMacSystemProxy(output: string) {
  const entries = new Map<string, string>()
  for (const line of output.split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z]+)\s*:\s*(.+?)\s*$/u)
    if (match) {
      entries.set(match[1], match[2])
    }
  }

  return (
    getMacProxyUrl(entries, 'HTTPS', 'http') ||
    getMacProxyUrl(entries, 'HTTP', 'http') ||
    getMacProxyUrl(entries, 'SOCKS', 'socks5')
  )
}

function getMacProxyUrl(entries: Map<string, string>, key: 'HTTP' | 'HTTPS' | 'SOCKS', protocol: 'http' | 'socks5') {
  if (entries.get(`${key}Enable`) !== '1') {
    return ''
  }

  const host = entries.get(`${key}Proxy`)
  const port = entries.get(`${key}Port`)
  if (!host || !port) {
    return ''
  }

  return normalizeProxy(`${protocol}://${host}:${port}`)
}

function getWindowsSystemProxy() {
  try {
    return parseWindowsSystemProxy(
      execSync('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /v ProxyServer', {
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString(),
    )
  } catch {
    return ''
  }
}

function parseWindowsSystemProxy(output: string) {
  const proxyEnable = output.match(/\bProxyEnable\s+REG_DWORD\s+0x([0-9a-f]+)/iu)?.[1]
  if (proxyEnable !== '1') {
    return ''
  }

  const proxyServer = output.match(/\bProxyServer\s+REG_SZ\s+(.+?)\s*$/imu)?.[1]?.trim()
  if (!proxyServer) {
    return ''
  }

  return getWindowsProxyUrl(proxyServer)
}

function getWindowsProxyUrl(proxyServer: string) {
  const entries = proxyServer.includes(';')
    ? Object.fromEntries(
        proxyServer
          .split(';')
          .map((entry) => entry.trim().split('='))
          .filter((entry): entry is [string, string] => entry.length === 2 && Boolean(entry[0] && entry[1])),
      )
    : {}

  return (
    normalizeWindowsProxyEntry(entries.https, 'http') ||
    normalizeWindowsProxyEntry(entries.http, 'http') ||
    normalizeWindowsProxyEntry(entries.socks, 'socks5') ||
    normalizeWindowsProxyEntry(proxyServer, 'http')
  )
}

function normalizeWindowsProxyEntry(proxy: string | undefined, protocol: 'http' | 'socks5') {
  if (!proxy || proxy.includes('=')) {
    return ''
  }

  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(proxy)) {
    return normalizeProxy(proxy)
  }

  return normalizeProxy(`${protocol}://${proxy}`)
}

export function getAgentEnv(proxy: string) {
  const env = { ...process.env }

  if (!proxy) {
    return env
  }

  env.HTTP_PROXY = proxy
  env.HTTPS_PROXY = proxy
  env.ALL_PROXY = proxy
  env.http_proxy = proxy
  env.https_proxy = proxy
  env.all_proxy = proxy

  return env
}
