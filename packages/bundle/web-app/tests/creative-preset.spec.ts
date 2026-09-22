/** 自用 creative 与发布版 standard 能力一致，保持旧会话标识可恢复。 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { PresetDefinition } from '@deepseek-ai/dsh-agent-preset-registry'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { expect, it } from 'vitest'

it('Web bundle 注册独立的 creative 声明，插件组合与 standard 一致', () => {
  const load = (id: string) => loadOverlayPatches(id, fileURLToPath(new URL(`../presets/${id}.patch.yml`, import.meta.url)))
    .flatMap(patch => patch.insert ?? [])
  const standard = load('standard')
  const creative = load('creative')
  expect(creative).toHaveLength(1)
  expect(creative[0]).toMatchObject({
    id: 'preset-creative', name: '@deepseek-ai/dsh-agent-preset',
    config: { id: 'creative', name: '勇于创作', order: 5 },
  })
  expect((creative[0]!.config as PresetDefinition).plugins).toEqual((standard[0]!.config as PresetDefinition).plugins)
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { dsh: { bundle: { patch: string[] } } }
  expect(manifest.dsh.bundle.patch).toContain('./presets/creative.patch.yml')
})
