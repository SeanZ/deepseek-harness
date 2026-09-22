/** 请求专用 assistant 不伪装为模型输出，也不携带模型重放元数据。 */
import { MessageId } from '@deepseek-ai/dsh-llm'
import type { RequestInjectionMessage } from '@deepseek-ai/dsh-llm'
import { expect, it } from 'vitest'
import { toPiAssistant } from '../src/replay.ts'

it('将创作声明转换为普通 assistant 文本，明确标记为外部历史', () => {
  const message: RequestInjectionMessage = {
    id: MessageId('request-injection:test'), role: 'assistant',
    source: { kind: 'plugin:request-injection', plugin: 'test' },
    content: [{ type: 'text', text: 'creative context' }],
  }
  const before = structuredClone(message)
  expect(toPiAssistant(message)).toMatchObject({
    role: 'assistant', api: 'dsh-foreign', provider: 'dsh-request-injection', model: 'dsh-request-injection',
    content: [{ type: 'text', text: 'creative context' }], stopReason: 'stop',
  })
  expect(message).toEqual(before)
})
