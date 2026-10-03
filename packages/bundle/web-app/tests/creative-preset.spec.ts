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
  const plugins = (creative[0]!.config as PresetDefinition).plugins
  expect(plugins).toEqual((standard[0]!.config as PresetDefinition).plugins)
  expect(plugins).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'time-context', name: '@deepseek-ai/dsh-time-context' }),
    expect.objectContaining({ id: 'tool-schedule', name: '@deepseek-ai/dsh-tool-schedule' }),
  ]))
  const delegation = plugins.find(plugin => plugin.id === 'delegation')!.config as PresetDefinition['plugins']
  for (const id of ['tool-subagent', 'tool-subagent-fork']) {
    expect(delegation.find(plugin => plugin.id === id)).toMatchObject({
      name: '@deepseek-ai/dsh-tool-subagent',
      config: { toolFilter: { deny: ['schedule_create', 'schedule_delete', 'schedule_list', 'schedule_update'] } },
    })
  }
  const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { files: string[]; dsh: { bundle: { patch: string[] } } }
  expect(manifest.dsh.bundle.patch).toContain('./presets/creative.patch.yml')
  for (const patch of manifest.dsh.bundle.patch) expect(manifest.files).toContain(patch.replace(/^\.\//, ''))
})
