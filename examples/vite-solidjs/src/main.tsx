import { For, createSignal } from 'solid-js'
import { render } from 'solid-js/web'
import './styles.css'

type ModuleStatus = 'empty' | 'ready' | 'running'

type DemoModule = {
  accent: string
  description: string
  prompt: string
  status: ModuleStatus
  title: string
}

const modules: DemoModule[] = [
  {
    accent: 'cyan',
    description: 'Agent run states, progress, timestamps, and streaming log lines.',
    prompt: '把这个空模块改成一个 AI agent 任务时间线，包含运行中、完成、失败三种状态，视觉上像开发工具里的实时任务面板。',
    status: 'empty',
    title: 'Live Run Timeline',
  },
  {
    accent: 'amber',
    description: 'Files changed, added and removed lines, and review-ready diff blocks.',
    prompt: '把这个模块改成代码 diff 预览面板，模拟展示 Agent 修改了哪些文件，用专业的 code review 风格设计。',
    status: 'empty',
    title: 'Code Diff Preview',
  },
  {
    accent: 'rose',
    description: 'Clicked DOM node, component name, source path, and exact line range.',
    prompt: '把这里做成 DOM 到源码的映射面板，展示被点选元素、组件名、文件路径、行列号和打开编辑器按钮。',
    status: 'empty',
    title: 'DOM Inspector Map',
  },
  {
    accent: 'lime',
    description: 'Codex, Claude, and custom provider settings with command previews.',
    prompt: '把这个模块改成 Agent provider 控制台，可以切换 Codex、Claude 和自定义 provider，并展示当前命令、模型和代理状态。',
    status: 'ready',
    title: 'Provider Console',
  },
  {
    accent: 'violet',
    description: 'Files touched, lines changed, tasks completed, and time saved.',
    prompt: '把这个模块改成 AI coding impact dashboard，用精致的数据卡片和小图表展示本次 demo 的改动成果。',
    status: 'empty',
    title: 'Impact Dashboard',
  },
]

const scriptSteps = [
  'Open the SolidJS playground',
  'Option / Alt click a module skeleton',
  'Paste the module prompt into AI Ins',
  'Watch the agent edit only that region',
]

function statusLabel(status: ModuleStatus) {
  if (status === 'ready') return 'seeded'
  if (status === 'running') return 'active'
  return 'empty'
}

function ModuleSkeleton(props: { module: DemoModule; selected: boolean; onSelect: () => void }) {
  return (
    <button class={`module module-${props.module.accent}`} classList={{ 'module-selected': props.selected }} onClick={props.onSelect} type="button">
      <span class="module-topline">
        <span class="module-status">{statusLabel(props.module.status)}</span>
        <span class="module-pin">AI Ins target</span>
      </span>
      <strong>{props.module.title}</strong>
      <span class="module-description">{props.module.description}</span>
      <span class="module-frame" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
    </button>
  )
}

function PromptPanel(props: { module: DemoModule }) {
  return (
    <aside class="prompt-panel">
      <p class="panel-kicker">Selected module</p>
      <h2>{props.module.title}</h2>
      <p>{props.module.description}</p>
      <div class="prompt-box">
        <span>Prompt to paste</span>
        <code>{props.module.prompt}</code>
      </div>
      <div class="source-card">
        <span>Expected click source</span>
        <strong>examples/vite-solidjs/src/main.tsx</strong>
        <small>Solid JSX elements should receive AI Ins source attributes in dev mode.</small>
      </div>
    </aside>
  )
}

function ProviderStrip() {
  return (
    <div class="provider-strip" aria-label="Agent providers">
      <span>Codex</span>
      <span>Claude</span>
      <span>Custom CLI</span>
    </div>
  )
}

function DemoApp() {
  const [selectedIndex, setSelectedIndex] = createSignal(0)

  return (
    <main class="shell">
      <header class="masthead">
        <div>
          <p class="eyebrow">AI Ins SolidJS Playground</p>
          <h1>AI Ins 点击编程演示台</h1>
          <p class="lede">Start with clean module skeletons, then Option / Alt click each region and let your local agent generate the real cockpit modules.</p>
        </div>
        <ProviderStrip />
      </header>

      <section class="demo-layout">
        <nav class="script-rail" aria-label="Demo script">
          <p>Recording flow</p>
          <ol>
            <For each={scriptSteps}>{(step) => <li>{step}</li>}</For>
          </ol>
        </nav>

        <section class="module-board" aria-label="AI Ins module skeletons">
          <For each={modules}>
            {(module, index) => <ModuleSkeleton module={module} selected={selectedIndex() === index()} onSelect={() => setSelectedIndex(index())} />}
          </For>
        </section>

        <PromptPanel module={modules[selectedIndex()]} />
      </section>
    </main>
  )
}

render(() => <DemoApp />, document.getElementById('root')!)
