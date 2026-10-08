import { lexer, type Token, type Tokens } from 'marked'
import { useDeferredValue, useMemo, useState, type ReactNode } from 'react'
import { t } from './i18n'
import { checkIcon, copyIcon, Icon } from './icons'

/**
 * Renders an agent reply (GitHub-flavored Markdown). `marked` only tokenizes;
 * React renders the tokens, so raw HTML in a reply shows as text and never runs
 * in the host page. The one exception is `<br>`, which agents use inside table
 * cells and which carries no behavior.
 */

// Links the panel will open: anything else (javascript:, data:, …) renders as text.
const safeLinkPattern = /^(?:https?:|mailto:)/iu

// `src/a.ts`, `./a/b.tsx:12`, `/abs/path/x.css:3:4` — at least one directory and an
// extension, so prose like `foo.bar` or URLs stay plain code.
const filePathPattern = /^(?:\.{1,2}\/|\/)?(?:[\w@.+-]+\/)+[\w@.+-]+\.[A-Za-z0-9]{1,10}(?::\d+(?::\d+)?)?$/u

const lineBreakTagPattern = /^<br\s*\/?>$/iu

export type MarkdownViewProps = {
  value: string
  /** Opens a project file (relative to the root, optional `:line:col`) in the IDE. */
  onOpenFile?: (path: string) => void
}

export function isFilePathLike(value: string) {
  return !value.includes('://') && filePathPattern.test(value)
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.append(textarea)
  textarea.select()
  try {
    document.execCommand('copy')
  } finally {
    textarea.remove()
  }
}

function CodeBlock({ code, language }: { code: string; language: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <div className="ai-ins-output-code-block">
      <div className="ai-ins-output-code-head">
        <span className="ai-ins-output-code-language">{language}</span>
        <button
          aria-label={copied ? t('markdown.copied') : t('markdown.copyCode')}
          className={`ai-ins-output-code-copy${copied ? ' ai-ins-output-code-copy-done' : ''}`}
          onClick={() => {
            void copyText(code).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1200)
            })
          }}
          title={copied ? t('markdown.copied') : t('markdown.copyCode')}
          type="button"
        >
          <Icon paths={copied ? checkIcon : copyIcon} />
        </button>
      </div>
      <pre>
        <code>{code || ' '}</code>
      </pre>
    </div>
  )
}

type RenderContext = {
  onOpenFile?: (path: string) => void
}

function renderInline(tokens: Token[] | undefined, keyPrefix: string, context: RenderContext): ReactNode[] {
  return (tokens ?? []).map((token, index) => {
    const key = `${keyPrefix}.${index}`
    switch (token.type) {
      case 'strong':
        return <strong key={key}>{renderInline(token.tokens, key, context)}</strong>
      case 'em':
        return <em key={key}>{renderInline(token.tokens, key, context)}</em>
      case 'del':
        return <del key={key}>{renderInline(token.tokens, key, context)}</del>
      case 'codespan':
        // File paths are the most common thing an agent mentions; open them in one click.
        return context.onOpenFile && isFilePathLike(token.text) ? (
          <button
            className="ai-ins-output-file-link"
            key={key}
            onClick={() => context.onOpenFile?.(token.text)}
            title={t('markdown.openFile', { path: token.text })}
            type="button"
          >
            <code>{token.text}</code>
          </button>
        ) : (
          <code key={key}>{token.text}</code>
        )
      case 'br':
        return <br key={key} />
      case 'link':
        return safeLinkPattern.test(token.href) ? (
          <a href={token.href} key={key} rel="noreferrer" target="_blank" title={token.title || undefined}>
            {renderInline(token.tokens, key, context)}
          </a>
        ) : (
          <span key={key}>{renderInline(token.tokens, key, context)}</span>
        )
      case 'image':
        // Never load remote images into the host page; offer the link instead.
        return safeLinkPattern.test(token.href) ? (
          <a href={token.href} key={key} rel="noreferrer" target="_blank">
            {token.text || token.href}
          </a>
        ) : (
          <span key={key}>{token.text || token.href}</span>
        )
      case 'html':
        return lineBreakTagPattern.test(token.text.trim()) ? <br key={key} /> : token.text
      case 'text':
        return 'tokens' in token && token.tokens ? <span key={key}>{renderInline(token.tokens, key, context)}</span> : token.text
      default:
        // escape and anything new: show what was written.
        return 'text' in token && typeof token.text === 'string' ? token.text : token.raw
    }
  })
}

function renderBlocks(tokens: Token[], keyPrefix: string, context: RenderContext): ReactNode[] {
  return tokens.map((token, index) => {
    const key = `${keyPrefix}.${index}`
    switch (token.type) {
      case 'space':
      // Task items carry a `checkbox` token; the list item renders the box itself.
      case 'checkbox':
        return null
      case 'heading': {
        // Card-sized headings: # → h3 … ### and deeper → h5.
        const Heading = `h${Math.min(token.depth + 2, 5)}` as 'h3' | 'h4' | 'h5'
        return <Heading key={key}>{renderInline(token.tokens, key, context)}</Heading>
      }
      case 'paragraph':
        return <p key={key}>{renderInline(token.tokens, key, context)}</p>
      case 'text':
        // Tight list items hold bare text blocks.
        return <span key={key}>{token.tokens ? renderInline(token.tokens, key, context) : token.text}</span>
      case 'code':
        return <CodeBlock code={token.text} key={key} language={token.lang || ''} />
      case 'blockquote':
        return <blockquote key={key}>{renderBlocks(token.tokens ?? [], key, context)}</blockquote>
      case 'hr':
        return <hr key={key} />
      case 'list': {
        const list = token as Tokens.List
        const items = list.items.map((item, itemIndex) => (
          <li className={item.task ? 'ai-ins-output-task' : undefined} key={itemIndex}>
            {item.task ? <input checked={Boolean(item.checked)} disabled type="checkbox" /> : null}
            {renderBlocks(item.tokens, `${key}.${itemIndex}`, context)}
          </li>
        ))
        return list.ordered ? (
          <ol key={key} start={typeof list.start === 'number' && list.start !== 1 ? list.start : undefined}>
            {items}
          </ol>
        ) : (
          <ul key={key}>{items}</ul>
        )
      }
      case 'table': {
        const table = token as Tokens.Table
        const align = (column: number) => table.align[column] ?? undefined
        return (
          // Wide tables scroll inside the card instead of stretching it.
          <div className="ai-ins-output-table-wrap" key={key}>
            <table>
              <thead>
                <tr>
                  {table.header.map((cell, column) => (
                    <th key={column} scope="col" style={{ textAlign: align(column) }}>
                      {renderInline(cell.tokens, `${key}.h${column}`, context)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {row.map((cell, column) => (
                      <td key={column} style={{ textAlign: align(column) }}>
                        {renderInline(cell.tokens, `${key}.${rowIndex}.${column}`, context)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      }
      default:
        // Block HTML and anything unknown: keep the source visible as text.
        return <p key={key}>{token.raw}</p>
    }
  })
}

export function MarkdownView({ value, onOpenFile }: MarkdownViewProps) {
  // While a reply streams, re-parsing the whole text on every chunk can lag
  // typing and scrolling; let React render the newest text at lower priority.
  const deferredValue = useDeferredValue(value)
  // `breaks`: agents write one thought per line; keep those line breaks.
  const tokens = useMemo(() => lexer(deferredValue, { breaks: true, gfm: true }), [deferredValue])
  return <div className="ai-ins-output-markdown">{renderBlocks(tokens, 'md', { onOpenFile })}</div>
}
