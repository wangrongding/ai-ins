import type { AstroIntegration } from 'astro'
import { aiIns as aiInsVite } from '@ai-ins/vite'
import type { AiInsPluginOptions } from '@ai-ins/core'
import { astroSourcePlugin } from './source'

// @ai-ins/vite 提供的虚拟客户端模块，经 Astro 页面脚本打包链路解析。
const clientModuleId = 'ai-ins/client'

export type { AiInsPluginOptions }

export function aiIns(options: AiInsPluginOptions = {}): AstroIntegration {
  return {
    name: '@ai-ins/astro',
    hooks: {
      'astro:config:setup': ({ command, injectScript, updateConfig }) => {
        // 只在 astro dev 生效，build / preview / sync 产物完全不受影响。
        if (command !== 'dev') {
          return
        }

        // Astro 页面由 Astro 自己渲染，不会触发 Vite 的 transformIndexHtml，
        // 所以复用 Vite 插件拿中间件、虚拟客户端模块和岛屿组件源码注入，客户端改由页面脚本注入；
        // .astro 模板的源码定位由 astroSourcePlugin 在 Astro 编译前注入。
        // 不同 Astro 版本自带的 Vite 版本不同，插件类型在这里做一次断言。
        const plugins = options.disableSourceAttributes ? [aiInsVite(options)] : [astroSourcePlugin(), aiInsVite(options)]
        updateConfig({ vite: { plugins: plugins as never } })
        injectScript('page', `import '${clientModuleId}';`)
      },
    },
  }
}

export default aiIns
