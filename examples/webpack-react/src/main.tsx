import { createRoot } from 'react-dom/client'
import './main.css'

function App() {
  return (
    <main className="page">
      <section className="shell">
        <div className="hero">
          <p className="eyebrow">AI Ins</p>
          <h1 className="title">调试 AI Ins 的起点页</h1>
          <p className="subtitle">
            这个 Webpack React 示例已经接入 AI Ins。摁住 Option 键，并点击页面元素后，可以从 DOM 节点定位到源码位置，再让编码 agent
            直接修改对应组件。
          </p>
        </div>

        <div className="grid">
          <article className="panel">
            <h2 className="panel-title">推荐调试流程</h2>
            <ol className="list">
              <li className="item">
                <span className="step">1</span>
                <span>启动开发服务，打开本示例页面。</span>
              </li>
              <li className="item">
                <span className="step">2</span>
                <span>按住 Option 并点击页面中的任意区域，打开 AI Ins 面板。</span>
              </li>
              <li className="item">
                <span className="step">3</span>
                <span>检查右侧的源码位置、DOM 栈和组件上下文是否符合预期。</span>
              </li>
              <li className="item">
                <span className="step">4</span>
                <span>向 AI 编码代理描述想要的改动，确认热更新后的页面结果。</span>
              </li>
            </ol>
          </article>

          <article className="panel">
            <h2 className="panel-title">当前示例入口</h2>
            <pre className="code">
              <code>{`src/main.tsx

createRoot(
  document.getElementById('root')!
).render(<App />)`}</code>
            </pre>
          </article>
        </div>

        <div className="callout">
          <span className="badge">Tip</span>
          <span>
            如果点击后能看到 src/main.tsx 的定位信息，说明 AI Ins
            的源码映射和 Webpack 插件链路正在工作。
          </span>
        </div>
      </section>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
