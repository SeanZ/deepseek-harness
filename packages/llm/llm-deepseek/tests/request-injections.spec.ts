/** 自定义请求注入在新版 Messages 协议中的线格式回归。 */
import { describe, expect, it } from 'vitest'
import { createAssistantMessage, createSystemMessage, createToolResultMessage, ToolCallId } from '@deepseek-ai/dsh-llm'
import type { Message } from '@deepseek-ai/dsh-llm'
import { materializeRequestMessages } from '@deepseek-ai/dsh-session'
import type { RequestMessageInjection } from '@deepseek-ai/dsh-session'
import { resolveAdapterOptions } from '../src/config.ts'
import { serialize } from '../src/serialize.ts'
import { MODEL, options, user } from './helpers.ts'

const injection: RequestMessageInjection = {
  key: 'creative-context', role: 'assistant', text: 'CREATIVE_CONTEXT',
  source: { kind: 'plugin', plugin: 'dsh-unrestricted' }, placement: { kind: 'before-latest-user' },
}
const assistant = (text: string) => createAssistantMessage({ content: [{ type: 'text', text }], source: { provider: 'deepseek-official', model: MODEL } })
const connection = resolveAdapterOptions({})
function body(history: Message[], enabled = true) {
  const messages = materializeRequestMessages(history, enabled ? [injection] : [])
  return serialize(options({ messages }), connection, messages, new Map(), () => undefined)
}

describe('creative 请求注入与 Messages 协议', () => {
  it('首轮、第二轮及六次工具续传均只注入一次，并保持工具结果紧邻', () => {
    const first = [createSystemMessage('system'), user('first')]
    expect(body(first).messages.map(message => message.role)).toEqual(['assistant', 'user'])
    const history: Message[] = [...first, assistant('previous answer'), user('second')]
    for (let step = 0; step <= 6; step++) {
      const original = JSON.stringify(history)
      const request = body(history)
      expect(request.system).toBe('system')
      const text = JSON.stringify(request.messages)
      expect(text.split('CREATIVE_CONTEXT')).toHaveLength(2)
      const anchor = request.messages.findIndex(message => message.content.some(block => block.type === 'text' && block.text === 'second'))
      expect(request.messages[anchor - 1]).toMatchObject({ role: 'assistant', content: [{ type: 'text', text: 'previous answer' }, { type: 'text', text: 'CREATIVE_CONTEXT' }] })
      for (let index = anchor + 1; index < request.messages.length; index += 2) {
        expect(request.messages[index]).toMatchObject({ role: 'assistant', content: [{ type: 'tool_use', id: `call-${(index - anchor - 1) / 2}` }] })
        expect(request.messages[index + 1]).toMatchObject({ role: 'user', content: [{ type: 'tool_result', tool_use_id: `call-${(index - anchor - 1) / 2}` }] })
      }
      expect(JSON.stringify(history)).toBe(original)
      if (step === 6) break
      const id = ToolCallId(`call-${step}`)
      history.push(createAssistantMessage({ content: [{ type: 'tool-call', id, name: 'read', arguments: '{"path":"file"}' }], source: { provider: 'deepseek-official', model: MODEL } }))
      history.push(createToolResultMessage({ callId: id, content: [{ type: 'text', text: `result-${step}` }], isError: false }))
    }
    expect(JSON.stringify(body(history, false))).not.toContain('CREATIVE_CONTEXT')
  })

  it('并行工具结果不会被注入拆开，恢复后的第二轮仍使用同一个最新用户锚点', () => {
    const calls = ['a', 'b'].map(id => ({ type: 'tool-call' as const, id: ToolCallId(id), name: 'read', arguments: '{}' }))
    const history = [user('first'), createAssistantMessage({ content: calls, source: { provider: 'deepseek-official', model: MODEL } }),
      ...calls.map(call => createToolResultMessage({ callId: call.id, content: [{ type: 'text' as const, text: call.id }], isError: false })),
      assistant('done'), user('second')]
    const request = body(structuredClone(history))
    expect(request.messages.map(message => message.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user'])
    expect(request.messages[2]?.content.map(block => block.type)).toEqual(['tool_result', 'tool_result'])
    expect(request.messages[3]?.content).toEqual([{ type: 'text', text: 'done' }, { type: 'text', text: 'CREATIVE_CONTEXT' }])
  })
})
