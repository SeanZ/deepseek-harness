/** 注入在重试、工具续传、恢复和取消中的持久语义。 */
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import type { Agent } from '@deepseek-ai/dsh-agent'
import AgentLoop from '@deepseek-ai/dsh-agent-loop'
import { mountAgentLoopTestDependencies } from '@deepseek-ai/dsh-agent-loop-testkit'
import { createUserMessage, LlmError } from '@deepseek-ai/dsh-llm'
import { Session, SessionId, foldRequestMessageInjections, materializeRequestMessages } from '@deepseek-ai/dsh-session'
import type { RequestMessageInjection } from '@deepseek-ai/dsh-session'
import { defineContentToolFixture } from '@deepseek-ai/dsh-tools'
import { MockAdapter, textResponse, toolCallResponse } from './mock-adapter.ts'

const contexts: Context[] = []
afterEach(async () => {
  for (const ctx of contexts.splice(0).reverse()) await ctx.fiber.dispose()
})
const contribution = (text = '测试上下文'): RequestMessageInjection => ({
  key: 'guidance', role: 'assistant', text,
  source: { kind: 'plugin', plugin: 'test-injections' },
  placement: { kind: 'before-latest-user' },
})
async function mount(adapter: MockAdapter) {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx, { systemPrompt: { personaPrefix: '测试系统提示词' } })
  await ctx.plugin(AgentLoop, { agents: [] })
  ctx.llm.registerAdapter(['mock'], adapter)
  return ctx
}
async function turn(ctx: Context, agent: Agent, text: string) {
  const finished = new Promise<void>((resolve) => {
    const dispose = ctx.on('agent/status', ({ agent: subject, status }) => {
      if (subject === agent && status === 'idle') { dispose(); resolve() }
    })
  })
  agent.send(createUserMessage({ content: [{ type: 'text', text }], source: { kind: 'user' } }), 'next-turn', true)
  await finished
}

describe('持久请求注入', () => {
  it('切换模型并连续五次调用工具时保持最新用户前锚点，逐次从日志重建', async () => {
    const first = new MockAdapter([textResponse('第一次回答')])
    const second = new MockAdapter([
      ...Array.from({ length: 5 }, (_, i) => toolCallResponse(`c${i}`, 'echo', { text: String(i) })),
      textResponse('工具完成'),
    ])
    const ctx = await mount(first)
    ctx.llm.registerAdapter(['second'], second)
    ctx.tools.register(defineContentToolFixture({
      name: 'echo', description: '测试工具', parameters: { text: { type: 'string' } },
      async execute(args) { return [{ type: 'text', text: String(args.text) }] },
    }))
    ctx.on('agent/request-injections', async (_payload, next) => [...await next(), contribution()])
    ctx.on('agent/request', async ({ turn: n }, next) => ({ ...await next(), ...(n === 2 ? { provider: 'second', model: 'second' } : {}) }))
    let reconstructed = 0
    ctx.on('llm/stream', (options, next) => {
      const session = ctx.sessions.get(options.sessionId!)!
      const prefix = session.snapshotEvents()
      const restored = Session.create(SessionId(`rebuild-${reconstructed++}`), structuredClone(prefix))
      expect(options.messages).toEqual(materializeRequestMessages(restored.deriveMessages(), foldRequestMessageInjections(prefix)))
      return next()
    })
    const agent = await ctx.agentLoop.create(SessionId('anchored'), { provider: 'mock', model: 'mock' })
    await turn(ctx, agent, 'first')
    await turn(ctx, agent, 'second')
    expect(first.requests).toHaveLength(1)
    expect(second.requests).toHaveLength(6)
    expect(reconstructed).toBe(7)
    for (const request of [...first.requests, ...second.requests]) {
      expect(request.messages[0]?.role).toBe('system')
      const index = request.messages.findIndex(message => message.id === 'request-injection:guidance')
      expect(index).toBe(request.messages.findLastIndex(message => message.role === 'user' && message.source.kind === 'user') - 1)
      expect(Object.isFrozen(request.messages[index])).toBe(true)
    }
    expect(agent.session.deriveMessages().some(message => message.id === 'request-injection:guidance')).toBe(false)
    expect(agent.session.snapshotEvents().filter(event => event.type === 'request/injections')).toHaveLength(1)
  })

  it('重试重新读取声明并清空旧快照，用户输入只提交一次', async () => {
    const adapter = new MockAdapter([
      () => { throw new LlmError('重试测试', 'CONTEXT_LENGTH') }, textResponse('重试完成'),
    ])
    const ctx = await mount(adapter)
    let enabled = true
    ctx.on('agent/request-injections', async (_payload, next) => [...await next(), ...enabled ? [contribution()] : []])
    ctx.on('agent/request-error', async () => { enabled = false; return { kind: 'retry' } })
    const agent = await ctx.agentLoop.create(SessionId('retry'), { provider: 'mock', model: 'mock' })
    await turn(ctx, agent, '重试一次')
    expect(adapter.requests).toHaveLength(2)
    expect(adapter.requests[0]?.messages.some(message => message.id === 'request-injection:guidance')).toBe(true)
    expect(adapter.requests[1]?.messages.some(message => message.id === 'request-injection:guidance')).toBe(false)
    expect(agent.session.snapshotEvents().filter(event => event.type === 'user/message')).toHaveLength(1)
    expect(agent.session.snapshotEvents().filter(event => event.type === 'request/injections').map(event => event.data.injections)).toEqual([[contribution()], []])
  })

  it('声明 waterfall 内取消时不提交 system、user 或注入快照', async () => {
    const adapter = new MockAdapter([])
    const ctx = await mount(adapter)
    ctx.on('agent/request-injections', async ({ agent }, next) => {
      const downstream = await next()
      agent.cancel({ kind: 'user' })
      return [...downstream, contribution()]
    })
    const agent = await ctx.agentLoop.create(SessionId('cancel'), { provider: 'mock', model: 'mock' })
    await turn(ctx, agent, '不应提交')
    expect(adapter.requests).toEqual([])
    expect(agent.session.snapshotEvents().filter(event => ['system/message', 'user/message', 'request/injections'].includes(event.type))).toEqual([])
  })

  it('恢复或 fork 后没有插件时显式清空历史声明', async () => {
    const ctx = await mount(new MockAdapter([textResponse('first'), textResponse('second')]))
    const dispose = ctx.on('agent/request-injections', async (_payload, next) => [...await next(), contribution()])
    const original = await ctx.agentLoop.create(SessionId('original'), { provider: 'mock', model: 'mock' })
    await turn(ctx, original, '原会话')
    dispose()
    const { agent: resumed } = await ctx.agents.create({ sessionId: SessionId('fork'), seed: structuredClone(original.session.snapshotEvents()), agentOptions: { provider: 'mock', model: 'mock' } })
    await turn(ctx, resumed, '新会话')
    expect(foldRequestMessageInjections(resumed.session.snapshotEvents())).toEqual([])
    expect(original.session.snapshotEvents().filter(event => event.type === 'request/injections')).toHaveLength(1)
  })
})
