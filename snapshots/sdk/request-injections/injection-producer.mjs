/** 记录回放中的中性请求注入，保持普通聊天输出不变。 */
export const name = 'test-request-injections'
export const inject = ['agentLoop']
/** @param {import('@deepseek-ai/cordis').Context} ctx - 测试 profile 的上下文。 */
export function apply(ctx) {
  if (ctx.agentLoop.requestInjectionsVersion !== 2) throw new Error('requires request injections v2')
  ctx.on('agent/request-injections', async (_payload, next) => [
    ...await next(),
    { key: 'snapshot-guidance', role: 'assistant', text: '已收到项目术语表，回答时保持术语一致。',
      source: { kind: 'plugin', plugin: 'test-request-injections' }, placement: { kind: 'before-latest-user' } },
  ])
}
