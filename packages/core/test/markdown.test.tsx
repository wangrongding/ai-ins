import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { isFilePathLike, MarkdownView } from '../src/client-panel/markdown'

function render(value: string, onOpenFile?: (path: string) => void) {
  return renderToStaticMarkup(<MarkdownView onOpenFile={onOpenFile} value={value} />)
}

describe('MarkdownView', () => {
  it('renders GFM tables with header scope and column alignment', () => {
    const html = render('| Item | Before | After |\n|:--|--:|:-:|\n| gap | 10px | **12px** |')
    expect(html).toContain('<table>')
    expect(html).toContain('<th scope="col" style="text-align:left">Item</th>')
    expect(html).toContain('<td style="text-align:right">10px</td>')
    expect(html).toContain('<td style="text-align:center"><strong>12px</strong></td>')
  })

  it('turns <br> inside a table cell into a line break, and nothing else', () => {
    const html = render('| a |\n|---|\n| one<br>two <b>bold</b> |')
    expect(html).toContain('one<br/>two')
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;')
  })

  it('renders nested, ordered and task lists', () => {
    const html = render('1. first\n   - child\n2. second\n\n- [x] done\n- [ ] todo')
    expect(html).toMatch(/<ol><li>.*first.*<ul><li>.*child.*<\/li><\/ul><\/li>/)
    expect(html).toMatch(/<li class="ai-ins-output-task"><input[^>]*checked=""[^>]*\/><span>done<\/span><\/li>/)
    expect(html).toMatch(/<li class="ai-ins-output-task"><input(?![^>]*checked)[^>]*\/><span>todo<\/span><\/li>/)
    expect(html).not.toContain('[x]')
  })

  it('renders emphasis, strikethrough and soft line breaks', () => {
    const html = render('*em* ~~gone~~\nnext line')
    expect(html).toContain('<em>em</em>')
    expect(html).toContain('<del>gone</del>')
    expect(html).toContain('<br/>')
  })

  it('never emits raw HTML from the reply', () => {
    const html = render('<script>alert(1)</script>\n\n<img src=x onerror="alert(2)"> and <iframe src="https://evil"></iframe>')
    expect(html).not.toMatch(/<script|<img|<iframe/u)
    expect(html).toContain('&lt;script&gt;')
  })

  it('only links http(s) and mailto targets', () => {
    const html = render('[ok](https://example.com) [mail](mailto:a@b.c) [bad](javascript:alert(1)) [data](data:text/html,x)')
    expect(html).toContain('<a href="https://example.com" rel="noreferrer" target="_blank">ok</a>')
    expect(html).toContain('<a href="mailto:a@b.c"')
    expect(html).not.toContain('javascript:')
    expect(html).not.toContain('href="data:')
  })

  it('shows images as links instead of loading them into the host page', () => {
    const html = render('![diagram](https://example.com/a.png)')
    expect(html).not.toContain('<img')
    expect(html).toContain('<a href="https://example.com/a.png" rel="noreferrer" target="_blank">diagram</a>')
  })

  it('adds a copy button and language label to code blocks', () => {
    const html = render('```ts\nconst a = 1 < 2\n```')
    expect(html).toContain('ai-ins-output-code-copy')
    expect(html).toContain('>ts</span>')
    expect(html).toContain('const a = 1 &lt; 2')
  })

  it('makes inline file paths open in the IDE only when a handler is given', () => {
    expect(render('see `src/components/Topbar.astro:12`', () => {})).toContain('class="ai-ins-output-file-link"')
    expect(render('see `src/components/Topbar.astro:12`')).not.toContain('ai-ins-output-file-link')
  })
})

describe('isFilePathLike', () => {
  it.each(['src/a.ts', './a/b.tsx:12', '../x/y.css:3:4', '/Users/me/app/src/main.ts', 'packages/@scope/pkg/index.d.ts'])('accepts %s', (value) => {
    expect(isFilePathLike(value)).toBe(true)
  })

  it.each(['foo.bar', 'npm run dev', 'https://example.com/a.js', 'a/b', '#f5f5f5', 'Topbar.astro'])('rejects %s', (value) => {
    expect(isFilePathLike(value)).toBe(false)
  })
})
