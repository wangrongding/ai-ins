import { useEffect, useState } from 'react'
import { t } from './i18n'

export type FileDiffData = {
  binary: boolean
  /** Unified diff hunks; null when none was recorded. */
  patch: string | null
  truncated: boolean
}

type DiffLine = {
  kind: 'add' | 'context' | 'del' | 'hunk' | 'note'
  newLine?: number
  oldLine?: number
  text: string
}

// A settled turn's patch never changes; keep each one for the panel's lifetime.
const diffCache = new Map<string, FileDiffData>()

const hunkHeaderPattern = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/u

export function parseUnifiedDiff(patch: string): DiffLine[] {
  const lines: DiffLine[] = []
  let oldLine = 0
  let newLine = 0

  for (const raw of patch.split('\n')) {
    const header = hunkHeaderPattern.exec(raw)
    if (header) {
      oldLine = Number(header[1])
      newLine = Number(header[2])
      lines.push({ kind: 'hunk', text: raw })
    } else if (raw.startsWith('+')) {
      lines.push({ kind: 'add', newLine: newLine++, text: raw.slice(1) })
    } else if (raw.startsWith('-')) {
      lines.push({ kind: 'del', oldLine: oldLine++, text: raw.slice(1) })
    } else if (raw.startsWith(' ')) {
      lines.push({ kind: 'context', newLine: newLine++, oldLine: oldLine++, text: raw.slice(1) })
    } else if (raw.startsWith('\\')) {
      // "\ No newline at end of file"
      lines.push({ kind: 'note', text: raw.slice(2) })
    }
  }

  return lines
}

const markers: Record<DiffLine['kind'], string> = { add: '+', context: ' ', del: '-', hunk: '', note: '' }

export function FileDiff({ cacheKey, fill, load }: { cacheKey: string; fill?: boolean; load: () => Promise<FileDiffData> }) {
  const [data, setData] = useState<FileDiffData | undefined>(() => diffCache.get(cacheKey))
  const [error, setError] = useState('')

  useEffect(() => {
    if (diffCache.has(cacheKey)) {
      setData(diffCache.get(cacheKey))
      return
    }

    let cancelled = false
    setData(undefined)
    setError('')
    load()
      .then((value) => {
        diffCache.set(cacheKey, value)
        if (!cancelled) setData(value)
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason))
      })
    return () => {
      cancelled = true
    }
    // `load` is a fresh closure every render; the key identifies the patch.
  }, [cacheKey])

  if (error) {
    return <div className="ai-ins-diff-note">{error}</div>
  }

  if (!data) {
    return <div className="ai-ins-diff-note">{t('files.diffLoading')}</div>
  }

  if (data.binary) {
    return <div className="ai-ins-diff-note">{t('files.diffBinary')}</div>
  }

  if (data.patch === null) {
    return <div className="ai-ins-diff-note">{t('files.diffUnavailable')}</div>
  }

  const lines = parseUnifiedDiff(data.patch)
  if (!lines.length) {
    return <div className="ai-ins-diff-note">{t('files.diffEmpty')}</div>
  }

  return (
    <div className={`ai-ins-diff${fill ? ' ai-ins-diff-fill' : ''}`}>
      <div className="ai-ins-diff-scroll">
        <table>
          <tbody>
            {lines.map((line, index) =>
              line.kind === 'hunk' || line.kind === 'note' ? (
                <tr className={`ai-ins-diff-row-${line.kind}`} key={index}>
                  <td className="ai-ins-diff-num" colSpan={2} />
                  <td className="ai-ins-diff-code" colSpan={2}>
                    {line.text}
                  </td>
                </tr>
              ) : (
                <tr className={`ai-ins-diff-row-${line.kind}`} key={index}>
                  <td className="ai-ins-diff-num">{line.oldLine ?? ''}</td>
                  <td className="ai-ins-diff-num">{line.newLine ?? ''}</td>
                  <td className="ai-ins-diff-marker">{markers[line.kind]}</td>
                  <td className="ai-ins-diff-code">{line.text || ' '}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      {data.truncated ? <div className="ai-ins-diff-note ai-ins-diff-note-foot">{t('files.diffTruncated')}</div> : null}
    </div>
  )
}
