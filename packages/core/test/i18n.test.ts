import { readdirSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { zhCN, type Message } from '../src/client-panel/i18n.zh-CN'

const catalogDirectory = join(__dirname, '..', 'src', 'client-panel')
const catalogFiles = readdirSync(catalogDirectory).filter((file) => /^i18n\.[\w-]+\.ts$/u.test(file) && file !== 'i18n.zh-CN.ts')

function placeholders(message: Message) {
  const forms = typeof message === 'string' ? [message] : Object.values(message)
  return [...new Set(forms.flatMap((form) => form?.match(/\{\w+\}/gu) ?? []))].sort()
}

describe('i18n catalogs', () => {
  it('has a catalog for every supported locale besides the source', () => {
    expect(catalogFiles.length).toBe(9)
  })

  describe.each(catalogFiles)('%s', (file) => {
    it('has exactly the source keys, with the same placeholders and an `other` form for plurals', async () => {
      const catalog = Object.values(await import(join(catalogDirectory, file)))[0] as Record<string, Message>
      expect(Object.keys(catalog).sort()).toEqual(Object.keys(zhCN).sort())
      for (const [key, source] of Object.entries(zhCN)) {
        const message = catalog[key]
        expect(placeholders(message), key).toEqual(placeholders(source))
        if (typeof message !== 'string') {
          expect(message.other, key).toBeTypeOf('string')
        }
      }
    })
  })
})
