<script lang="ts">
  type DemoSection = {
    description: string
    prompt: string
    title: string
  }

  const sections: DemoSection[] = [
    {
      description: 'Show the clicked DOM node, component file, and source line range.',
      prompt: '把这个骨架填充成 DOM source inspector，展示被点击元素、源码路径、行列号和父级 DOM stack。',
      title: 'Clicked Element Context',
    },
    {
      description: 'Show what AI Ins sends to the local coding agent after a click.',
      prompt: '把这个骨架填充成 prompt context 面板，展示用户需求、DOM source stack 和源码 excerpt。',
      title: 'Agent Prompt Context',
    },
    {
      description: 'Show a streaming run log with current agent status.',
      prompt: '把这个骨架填充成 agent run stream，包含 starting、running、done、failed 状态和终端输出。',
      title: 'Run Stream',
    },
    {
      description: 'Show files changed by the agent and a compact patch summary.',
      prompt: '把这个骨架填充成 patch preview，展示改动文件、增删行和代码 diff 摘要。',
      title: 'Patch Preview',
    },
    {
      description: 'Show editor detection and the open-in-editor request target.',
      prompt: '把这个骨架填充成 open in editor debugger，展示快捷键、编辑器、文件路径和跳转结果。',
      title: 'Open In Editor Check',
    },
    {
      description: 'Show framework coverage for React, Vue, Solid, and Svelte.',
      prompt: '把这个骨架填充成 framework compatibility board，对比 React、Vue、Solid、Svelte 的 source 定位能力。',
      title: 'Framework Coverage',
    },
  ]
</script>

<main>
  <header>
    <p>AI Ins Svelte Playground</p>
    <h1>Click-to-code skeleton</h1>
    <p>Option / Alt click a section, then let the local agent fill only that module.</p>
  </header>

  <section aria-label="Demo sections">
    {#each sections as section}
      <article>
        <h2>{section.title}</h2>
        <p>{section.description}</p>
        <pre>{section.prompt}</pre>
      </article>
    {/each}
  </section>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: system-ui, sans-serif;
  }

  main {
    padding: 24px;
  }

  section {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
  }

  article {
    border: 1px solid #d4d4d8;
    padding: 16px;
  }

  pre {
    white-space: pre-wrap;
  }
</style>
