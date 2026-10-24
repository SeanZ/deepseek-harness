import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import { brandString } from '@deepseek-ai/dsh-brand'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { SessionId } from '@deepseek-ai/dsh-session'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@deepseek-ai/dsh-agent-loop-testkit'
import SessionController from '../src/index.ts'
import type { Config } from '../src/index.ts'
import type { SessionRequestId } from '../src/types.ts'
import { createSessionTestController } from './test-remote.ts'

const contexts: Context[] = []
afterEach(async () => {
  await Promise.all(contexts.splice(0).map(ctx => ctx.fiber.dispose()))
})

const content = (text: string) => [{ type: 'text' as const, text }]

async function harness(userMessageMode: Config['userMessageMode']) {
  const ctx = new Context()
  contexts.push(ctx)
  await mountAgentLoopTestDependencies(ctx)
  const loop = await mountAgentLoopTestHarness(ctx)
  const agent = await loop.create(SessionId('message-mode'))
  const controller = createSessionTestController(ctx, {
    cwd: '/tmp', defaultModelSelection: () => ({ provider: 'test', model: 'test' }),
    ...userMessageMode === undefined ? {} : { userMessageMode },
  })
  const entered = Promise.withResolvers<undefined>()
  const release = Promise.withResolvers<undefined>()
  ctx.on('agent/pre-step', async () => {
    entered.resolve(undefined)
    await release.promise
    return { kind: 'reject' }
  })
  agent.followup(createUserMessage({ content: content('start'), source: { kind: 'user' } }))
  await entered.promise
  return { controller, agent, release: () => { release.resolve(undefined) } }
}

describe('SessionController user message policy', () => {
  it('defaults to native and rejects unsupported modes', () => {
    expect(SessionController.Config({}).userMessageMode).toBe('native')
    expect(SessionController.Config({ userMessageMode: 'followup' }).userMessageMode).toBe('followup')
    // @ts-expect-error -- 外部配置仍需运行时拒绝未知策略。
    expect(() => SessionController.Config({ userMessageMode: 'invalid' })).toThrow()
  })

  it.each([undefined, 'native', 'followup'] as const)('routes prompts and queue actions through %s policy', async (mode) => {
    const { controller, agent, release } = await harness(mode)
    try {
      const signal = new AbortController().signal
      await controller.prompt({
        sessionId: agent.id, requestId: brandString<SessionRequestId>('steer-request'),
        mode: 'steer', content: content('steer prompt'),
      }, signal)
      await controller.prompt({
        sessionId: agent.id, requestId: brandString<SessionRequestId>('queue-request'),
        mode: 'queue', content: content('queued prompt'),
      }, signal)
      const native = mode !== 'followup'
      expect(agent.inbox.nextStep.map(message => message.content)).toEqual(native ? [content('steer prompt')] : [])
      expect(agent.inbox.nextTurn.map(message => message.content)).toEqual(native
        ? [content('queued prompt')]
        : [content('steer prompt'), content('queued prompt')])
      const queued = agent.inbox.nextTurn.at(-1)
      if (queued === undefined) throw new Error('missing queued message')
      await controller.updateQueue({ sessionId: agent.id, itemId: queued.id, action: { kind: 'steer' } })
      expect(agent.inbox.nextStep.map(message => message.content)).toEqual(native
        ? [content('steer prompt'), content('queued prompt')]
        : [])
      expect(agent.inbox.nextTurn.map(message => message.content)).toEqual(native
        ? [] : [content('steer prompt'), content('queued prompt')])
      expect([...agent.inbox.nextStep, ...agent.inbox.nextTurn].filter(message => message.id === queued.id)).toHaveLength(1)

      await controller.updateQueue({ sessionId: agent.id, itemId: queued.id, action: { kind: 'edit', content: content('edited') } })
      expect([...agent.inbox.nextStep, ...agent.inbox.nextTurn].find(message => message.id === queued.id)?.content).toEqual(content('edited'))
      await controller.updateQueue({ sessionId: agent.id, itemId: queued.id, action: { kind: 'remove' } })
      expect([...agent.inbox.nextStep, ...agent.inbox.nextTurn].find(message => message.id === queued.id)).toBeUndefined()

      const direct = createUserMessage({ content: content('direct steer'), source: { kind: 'user' } })
      agent.steer(direct)
      expect(agent.inbox.nextStep).toContainEqual(direct)
    } finally {
      agent.cancel({ kind: 'user' })
      release()
      await agent.whenIdle()
    }
  })
})
