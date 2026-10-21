import { afterEach, describe, expect, it } from 'vitest'
import { brandString, type Branded } from '@deepseek-ai/dsh-brand'
import { Context } from '@deepseek-ai/cordis'
import LlmRuntime, { createUserMessage, ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import { PiAiAdapter } from '@deepseek-ai/dsh-llm-pi-ai'
import { getBuiltinModels } from '@earendil-works/pi-ai/providers/all'
import { resolveProfiles } from '../src/config.ts'
import { memoryAuth } from './auth-double.ts'
import { assemble } from './assemble.ts'
import { closeMockServers, mockServer } from './mock-server.ts'

afterEach(closeMockServers)

describe('OpenCode Go Google catalog routing', () => {
  it('uses the catalog Google protocol, reasoning level and session header', async () => {
    const model = 'gemini-4-argon-contributor'
    expect(getBuiltinModels('opencode-go').find(entry => entry.id === model)?.api)
      .toBe('google-generative-ai')
    const server = await mockServer([{ events: [JSON.stringify({
      candidates: [{ content: { role: 'model', parts: [{ text: 'hello' }] }, finishReason: 'STOP' }],
      usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 1, totalTokenCount: 4 },
    })] }])
    const ctx = new Context()
    await ctx.plugin(LlmRuntime)
    try {
      ctx.llm.registerAdapter(['opencode-go'], new PiAiAdapter({
        profiles: () => resolveProfiles({ 'opencode-go': { baseURL: server.url } }),
        resolveApiKey: () => Promise.resolve('test-key'),
        auth: memoryAuth(),
      }))
      const result = await assemble(ctx, {
        provider: 'opencode-go', model, reasoningEffort: ReasoningEffortId('low'),
        sessionId: brandString<Branded<'SessionId'>>('google-session'), messages: [createUserMessage({ content: [{ type: 'text', text: 'hi' }], source: { kind: 'user' } })],
      })
      expect(result.message.content).toEqual([{ type: 'text', text: 'hello' }])
      expect(result.finish).toEqual({ kind: 'stop' })
      expect(server.paths[0]).toContain(`/models/${model}:streamGenerateContent`)
      expect(server.headers[0]?.['x-opencode-session']).toBe('google-session')
      expect(server.requests[0]).toMatchObject({ generationConfig: { thinkingConfig: { thinkingLevel: 'LOW' } } })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('keeps unlisted Google aliases absent from the catalog', () => {
    expect(getBuiltinModels('opencode-go').find(entry => entry.id === 'gemini-4-argon')).toBeUndefined()
  })
})
