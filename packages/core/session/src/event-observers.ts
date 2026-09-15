/** 会话提交后的通知分发与异常隔离。 */
import type { Context } from '@deepseek-ai/cordis'
import type { SessionId } from './types.ts'

/** 会话事件监听器的返回值由通知分发层统一处理。 */
export type SessionCallback = (...args: unknown[]) => unknown

/**
 * 逐个通知监听器，隔离同步异常和异步拒绝。
 * @param ctx - 用于报告监听器错误的上下文。
 * @param name - 通知事件名。
 * @param id - 会话标识。
 * @param args - 监听器参数。
 * @param callbacks - 本次分发的监听器快照。
 */
export function invokeContainedSessionObservers(
  ctx: Context,
  name: 'session/event' | 'session/disposed',
  id: SessionId,
  args: unknown[],
  callbacks: SessionCallback[],
): void {
  for (const callback of callbacks) {
    try {
      const returned: unknown = callback(...args)
      void Promise.resolve(returned).catch((error: unknown) => {
        ctx.logger.warn(`session "${id}": ${name} listener rejected: ${String(error)}`)
      })
    } catch (error: unknown) {
      ctx.logger.warn(`session "${id}": ${name} listener threw: ${String(error)}`)
    }
  }
}
