import React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import readme from '../../../README.md?raw'

type DocBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'code'; language: string; code: string }
  | { type: 'table'; rows: string[][] }

function getHeadingId(text: string, index: number) {
  const slug = text
    .replace(/`/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')

  return slug ? `section-${index}-${slug}` : `section-${index}`
}

function parseMarkdown(markdown: string): DocBlock[] {
  const lines = markdown.split('\n')
  const blocks: DocBlock[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]

    if (!line.trim()) {
      continue
    }

    const codeMatch = line.match(/^```(\w*)/)
    if (codeMatch) {
      const code: string[] = []
      index += 1

      while (index < lines.length && !lines[index].startsWith('```')) {
        code.push(lines[index])
        index += 1
      }

      blocks.push({ type: 'code', language: codeMatch[1], code: code.join('\n') })
      continue
    }

    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/)
    if (headingMatch) {
      blocks.push({ type: 'heading', level: headingMatch[1].length, text: headingMatch[2] })
      continue
    }

    if (line.startsWith('|')) {
      const rows: string[][] = []

      while (index < lines.length && lines[index].startsWith('|')) {
        const row = lines[index]
          .split('|')
          .slice(1, -1)
          .map((cell) => cell.trim())

        if (!row.every((cell) => /^:?-{3,}:?$/.test(cell))) {
          rows.push(row)
        }

        index += 1
      }

      index -= 1
      blocks.push({ type: 'table', rows })
      continue
    }

    if (line.startsWith('- ')) {
      const items: string[] = []

      while (index < lines.length && lines[index].startsWith('- ')) {
        items.push(lines[index].slice(2))
        index += 1
      }

      index -= 1
      blocks.push({ type: 'list', items })
      continue
    }

    const paragraph = [line]

    while (index + 1 < lines.length && lines[index + 1].trim() && !/^(#{1,3})\s+|^- |\||```/.test(lines[index + 1])) {
      index += 1
      paragraph.push(lines[index])
    }

    blocks.push({ type: 'paragraph', text: paragraph.join(' ') })
  }

  return blocks
}

function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/g)

  return (
    <>
      {parts.map((part, index) =>
        part.startsWith('`') && part.endsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : part,
      )}
    </>
  )
}

function Card({ onOpenDocs }: { onOpenDocs: () => void }) {
  return (
    <section className='card'>
      <div className='card-glow' aria-hidden='true' />
      <p className='eyebrow'>Agent Dev</p>
      <h1>
        Option / Alt 点选 <span>DOM</span>
      </h1>
      <p className='card-title'>把页面元素直接交给本地 AI 编码代理。</p>
      <p>打开 Agent 面板，把目标组件和修改需求交给本地 Codex / Claude CLI。</p>
      <button className='card-action' onClick={onOpenDocs}>
        快速开始
      </button>
    </section>
  )
}

function Docs({ onBack }: { onBack: () => void }) {
  const blocks = parseMarkdown(readme)
  const directory = blocks.flatMap((block, index) =>
    block.type === 'heading'
      ? [
          {
            id: getHeadingId(block.text, index),
            level: block.level,
            text: block.text,
          },
        ]
      : [],
  )

  return (
    <main className='docs'>
      <nav className='docs-nav'>
        <button className='docs-back' onClick={onBack}>
          返回
        </button>
        <span>基于 README.md</span>
      </nav>
      <div className='docs-layout'>
        <aside className='docs-directory' aria-label='文档目录'>
          <p>目录</p>
          <ol>
            {directory.map((item) => (
              <li className={`docs-directory-level-${item.level}`} key={item.id}>
                <a href={`#${item.id}`}>
                  <InlineMarkdown text={item.text} />
                </a>
              </li>
            ))}
          </ol>
        </aside>
        <article className='docs-content'>
          {blocks.map((block, index) => {
            if (block.type === 'heading') {
              const Heading = `h${block.level}` as 'h1' | 'h2' | 'h3'
              return (
                <Heading id={getHeadingId(block.text, index)} key={index}>
                  <InlineMarkdown text={block.text} />
                </Heading>
              )
            }

            if (block.type === 'list') {
              return (
                <ul key={index}>
                  {block.items.map((item) => (
                    <li key={item}>
                      <InlineMarkdown text={item} />
                    </li>
                  ))}
                </ul>
              )
            }

            if (block.type === 'code') {
              return (
                <pre key={index}>
                  <code>{block.code}</code>
                </pre>
              )
            }

            if (block.type === 'table') {
              const [head, ...body] = block.rows

              return (
                <div className='docs-table-wrap' key={index}>
                  <table>
                    <thead>
                      <tr>
                        {head.map((cell) => (
                          <th key={cell}>
                            <InlineMarkdown text={cell} />
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {body.map((row) => (
                        <tr key={row.join('|')}>
                          {row.map((cell) => (
                            <td key={cell}>
                              <InlineMarkdown text={cell} />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }

            return (
              <p key={index}>
                <InlineMarkdown text={block.text} />
              </p>
            )
          })}
        </article>
      </div>
    </main>
  )
}

function App() {
  const [pathname, setPathname] = React.useState(window.location.pathname)

  React.useEffect(() => {
    const handlePopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  const navigate = (nextPathname: string) => {
    window.history.pushState(null, '', nextPathname)
    window.scrollTo(0, 0)
    setPathname(nextPathname)
  }

  return pathname === '/docs' ? <Docs onBack={() => navigate('/')} /> : <Card onOpenDocs={() => navigate('/docs')} />
}

const rootElement = document.getElementById('root')!

if (rootElement.hasChildNodes()) {
  hydrateRoot(rootElement, <App />)
} else {
  createRoot(rootElement).render(<App />)
}
