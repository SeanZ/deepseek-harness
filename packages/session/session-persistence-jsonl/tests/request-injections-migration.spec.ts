/** my43 历史注入事件通过真实 JSONL provider 迁移，原 generation 保持不变。 */
import { Context } from '@deepseek-ai/cordis'
import { Session, SessionId, foldRequestMessageInjections, materializeRequestMessages } from '@deepseek-ai/dsh-session'
import JsonlSessionPersistence from '@deepseek-ai/dsh-session-persistence-jsonl'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generationLogPath } from '../src/format.ts'

const injection = {
  key: 'legacy', role: 'assistant', text: '历史注入内容',
  source: { kind: 'plugin', plugin: 'legacy-plugin' },
  placement: { kind: 'before-latest-user' },
}
const rows = [
  { type: 'turn/start', data: { turn: 1 } },
  { type: 'step/start', data: { turn: 1, step: 1 } },
  { type: 'user/message', surfaceOp: 'append', data: { id: 'u1', role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: '旧问题' }] } },
  { type: 'request/injections', data: { injections: [injection] } },
  { type: 'request/header', data: { header: { config: { provider: 'mock', model: 'mock' }, system: '旧系统提示词' }, reason: 'initial' } },
  { type: 'step/end', data: { turn: 1, step: 1 } },
  { type: 'turn/end', data: { turn: 1, reason: { kind: 'completed' } } },
]

describe('历史请求注入迁移', () => {
  it.each([0, 1, 2])('V%s 读取不写盘，写入只创建 V3，重开保留声明', async (version) => {
    const root = await mkdtemp(join(tmpdir(), 'dsh-injections-migration-'))
    const ctx = new Context()
    try {
      const id = SessionId('legacy-injections')
      const path = generationLogPath(root, undefined, id, version, 'none')
      await mkdir(dirname(path), { recursive: true })
      const original = [{ type: 'session', version, id, createdAt: 1, ...(version === 2 ? { isSeeded: false } : {}), delegationDepth: 0 }, ...rows.map((row, seq) => ({ ...row, seq, time: seq + 10 }))].map(row => JSON.stringify(row)).join('\n') + '\n'
      await writeFile(path, original)
      await ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
      const reader = await ctx.sessionPersistence.open(id, 'read')
      try {
        const read = await reader.read()
        const session = Session.fromRestore(id, read.events, reader.header, reader.inheritedEventCount, read.eventState)
        expect(foldRequestMessageInjections(session.snapshotEvents())).toEqual([injection])
        expect(materializeRequestMessages(session.deriveMessages(), foldRequestMessageInjections(read.events)).map(message => message.role)).toEqual(['system', 'assistant', 'user'])
        expect(read.events.filter(event => event.type === 'request/injections').map(event => Object.hasOwn(event, 'ignorable'))).toEqual([false])
      } finally { await reader.close() }
      expect(await readFile(path, 'utf8')).toBe(original)
      expect((await readdir(dirname(path))).filter(name => name.endsWith('.jsonl'))).toHaveLength(1)
      const writer = await ctx.sessionPersistence.open(id, 'write')
      await writer.close()
      expect(await readFile(path, 'utf8')).toBe(original)
      expect((await readdir(dirname(path))).filter(name => name.endsWith('.jsonl'))).toHaveLength(2)
      const reopened = await ctx.sessionPersistence.open(id, 'read')
      try {
        expect(reopened.header.version).toBe(3)
        expect(foldRequestMessageInjections((await reopened.read()).events)).toEqual([injection])
      } finally { await reopened.close() }
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})
