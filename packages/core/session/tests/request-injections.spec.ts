/** Request-only assistant declaration validation, folding, and placement. */

import { describe, expect, it } from 'vitest'
import {
  createMessage,
  createSystemMessage,
  createToolResultMessage,
  createUserMessage,
  ToolCallId,
} from '@deepseek-ai/dsh-llm'
import {
  canonicalRequestMessageInjections,
  foldRequestMessageInjections,
  materializeRequestMessages,
  Session,
  SessionId,
} from '@deepseek-ai/dsh-session'
import type { Message } from '@deepseek-ai/dsh-llm'
import type { RequestMessageInjection } from '@deepseek-ai/dsh-session'

const injection = (key: string, depth: number, text = key): RequestMessageInjection => ({
  key,
  role: 'assistant',
  text,
  source: { kind: 'plugin', plugin: 'test-injections' },
  placement: { kind: 'depth', depth },
})

const beforeLatestUser = (key: string, text = key): RequestMessageInjection => ({
  key,
  role: 'assistant',
  text,
  source: { kind: 'plugin', plugin: 'test-injections' },
  placement: { kind: 'before-latest-user' },
})

const user = (text: string) => createUserMessage({
  content: [{ type: 'text' as const, text }],
  source: { kind: 'user' as const },
})

describe('request injection declarations', () => {
  it('canonicalizes a detached frozen snapshot and rejects ambiguous identities', () => {
    const source = [injection('a', 4)]
    const canonical = canonicalRequestMessageInjections(source)
    source[0] = injection('changed', 0)
    expect(canonical).toEqual([injection('a', 4)])
    expect(Object.isFrozen(canonical)).toBe(true)
    expect(Object.isFrozen(canonical[0])).toBe(true)
    expect(() => canonicalRequestMessageInjections([
      injection('same', 0),
      injection('same', 1),
    ])).toThrow('duplicated')
    expect(() => canonicalRequestMessageInjections([
      { ...injection('bad', 0), placement: { kind: 'depth', depth: -1 } },
    ])).toThrow('non-negative safe integer')
    expect(canonicalRequestMessageInjections([beforeLatestUser('anchored')]))
      .toEqual([beforeLatestUser('anchored')])
    expect(() => canonicalRequestMessageInjections([
      { ...injection('bad-kind', 0), placement: { kind: 'unknown' } },
    ])).toThrow('supported placement')
  })

  it('folds the latest full snapshot, including an explicit clear', () => {
    const session = Session.create(SessionId('request-injection-fold'))
    session.append('turn/start', { turn: 1 })
    session.append('request/injections', { injections: [injection('first', 2)] })
    expect(foldRequestMessageInjections(session.snapshotEvents())).toEqual([injection('first', 2)])
    session.append('request/injections', { injections: [] })
    expect(foldRequestMessageInjections(session.snapshotEvents())).toEqual([])
  })
})

describe('request injection materialization', () => {
  it('measures depth from the tail and preserves contribution order at one cut', () => {
    const messages: Message[] = [user('one'), user('two'), user('three')]
    const result = materializeRequestMessages(messages, [
      injection('a', 1),
      injection('b', 1),
      injection('tail', 0),
    ])
    expect(result.map(message => message.content[0]?.type === 'text'
      ? message.content[0].text
      : 'non-text')).toEqual(['one', 'two', 'a', 'b', 'three', 'tail'])
    expect(result[2]).toMatchObject({
      id: 'request-injection:a',
      role: 'assistant',
      source: { kind: 'plugin:request-injection', plugin: 'test-injections' },
    })
  })

  it('never places an injection between tool calls and their results', () => {
    const callId = ToolCallId('call-1')
    const messages: Message[] = [
      user('before'),
      createMessage({
        role: 'assistant',
        content: [{ type: 'tool-call', id: callId, name: 'echo', arguments: '{}' }],
        source: { kind: 'model', provider: 'mock', model: 'mock' },
      }),
      createToolResultMessage({ callId, content: [], isError: false }),
      user('after'),
    ]
    const result = materializeRequestMessages(messages, [injection('safe', 2)])
    expect(result.map(message => message.id)).toEqual([
      messages[0]?.id,
      'request-injection:safe',
      messages[1]?.id,
      messages[2]?.id,
      messages[3]?.id,
    ])
  })

  it('keeps latest-user placement stable across repeated tool exchanges', () => {
    const current = user('current request')
    const messages: Message[] = [
      user('older request'),
      createMessage({
        role: 'assistant',
        content: [{ type: 'text', text: 'older response' }],
        source: { kind: 'model', provider: 'mock', model: 'mock' },
      }),
      current,
      createMessage({
        role: 'user',
        content: [{ type: 'text', text: 'skill instructions' }],
        source: { kind: 'system-prompt' },
      }),
    ]
    for (let step = 1; step <= 5; step += 1) {
      const result = materializeRequestMessages(messages, [beforeLatestUser('stable')])
      const injectionIndex = result.findIndex(message => message.id === 'request-injection:stable')
      expect(injectionIndex).toBe(2)
      expect(result[injectionIndex + 1]?.id).toBe(current.id)

      const callId = ToolCallId(`call-${step}`)
      messages.push(
        createMessage({
          role: 'assistant',
          content: [
            { type: 'reasoning', text: `reasoning ${step}` },
            { type: 'tool-call', id: callId, name: 'echo', arguments: '{}' },
          ],
          source: { kind: 'model', provider: 'switched-provider', model: 'thinking-model' },
        }),
        createToolResultMessage({ callId, content: [], isError: false }),
      )
    }
  })

  it('requires a human-authored message for latest-user placement', () => {
    const messages: Message[] = [createMessage({
      role: 'user',
      content: [{ type: 'text', text: 'plugin context' }],
      source: { kind: 'system-prompt' },
    })]
    expect(() => materializeRequestMessages(messages, [beforeLatestUser('missing')]))
      .toThrow('requires a human-authored user message')
  })

  it('fails loud on an unbalanced request history', () => {
    const callId = ToolCallId('dangling')
    const messages: Message[] = [createMessage({
      role: 'assistant',
      content: [{ type: 'tool-call', id: callId, name: 'echo', arguments: '{}' }],
      source: { kind: 'model', provider: 'mock', model: 'mock' },
    })]
    expect(() => materializeRequestMessages(messages, [injection('x', 0)]))
      .toThrow('unanswered tool call')
  })
})

it('超大 depth 也不能越过 V3 系统首消息', () => {
  const head = createSystemMessage('系统说明')
  const result = materializeRequestMessages([head, user('问题')], [injection('deep', 100)])
  expect(result.map(message => message.role)).toEqual(['system', 'assistant', 'user'])
  expect(result[0]).toBe(head)
})


it('V4 工具结果必须匹配调用 ID，不能只以数量判断完整边界', () => {
  const callId = ToolCallId('expected')
  const call = createMessage({
    role: 'assistant', content: [{ type: 'tool-call', id: callId, name: 'echo', arguments: '{}' }],
    source: { kind: 'model', provider: 'mock', model: 'mock' },
  })
  const wrong = createToolResultMessage({ callId: ToolCallId('wrong'), content: [], isError: false })
  expect(() => materializeRequestMessages([user('question'), call, wrong], [injection('x', 0)]))
    .toThrow('unmatched tool result')
})
