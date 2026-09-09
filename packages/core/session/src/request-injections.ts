/**
 * 持久化的请求专用消息声明及确定性组装。
 * @module @deepseek-ai/dsh-session/request-injections
 */

import { brandString } from '@deepseek-ai/dsh-brand'
import type { MessageId } from '@deepseek-ai/dsh-llm/brand'
import type { Message } from '@deepseek-ai/dsh-llm'
import { assertNever, deepFreeze } from '@deepseek-ai/dsh-util-values'
import type { RequestMessageInjection, SessionEvent } from './types.ts'

/** 共享的不可变空快照。 */
const EMPTY: readonly RequestMessageInjection[] = Object.freeze([])

/**
 * 校验完整声明快照，并复制为与调用方隔离的数据。
 * @param input - 待校验的声明快照。
 * @returns 深度冻结的规范快照；非法声明抛出异常。
 */
export function canonicalRequestMessageInjections(input: unknown): readonly RequestMessageInjection[] {
  if (!Array.isArray(input)) throw new TypeError('request injections must be an array')
  if (input.length === 0) return EMPTY
  const keys = new Set<string>()
  const canonical = input.map((value, index): RequestMessageInjection => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new TypeError(`request injection at index ${index} must be an object`)
    }
    const record = value as Record<string, unknown>
    const key = record['key']
    const role = record['role']
    const text = record['text']
    const source = record['source']
    const placement = record['placement']
    if (typeof key !== 'string' || key.length === 0) {
      throw new TypeError(`request injection at index ${index} must have a non-empty key`)
    }
    if (keys.has(key)) throw new TypeError(`request injection key "${key}" is duplicated`)
    keys.add(key)
    if (role !== 'assistant') {
      throw new TypeError(`request injection "${key}" must have role "assistant"`)
    }
    if (typeof text !== 'string' || text.length === 0) {
      throw new TypeError(`request injection "${key}" must have non-empty text`)
    }
    if (source === null || typeof source !== 'object' || Array.isArray(source)
      || (source as Record<string, unknown>)['kind'] !== 'plugin'
      || typeof (source as Record<string, unknown>)['plugin'] !== 'string'
      || (source as Record<string, unknown>)['plugin'] === '') {
      throw new TypeError(`request injection "${key}" must have a non-empty plugin source`)
    }
    if (placement === null || typeof placement !== 'object' || Array.isArray(placement)) {
      throw new TypeError(`request injection "${key}" must use a supported placement`)
    }
    const placementRecord = placement as Record<string, unknown>
    let canonicalPlacement: RequestMessageInjection['placement']
    if (placementRecord['kind'] === 'before-latest-user') {
      canonicalPlacement = { kind: 'before-latest-user' }
    } else if (placementRecord['kind'] === 'depth') {
      const depth = placementRecord['depth']
      if (typeof depth !== 'number' || !Number.isSafeInteger(depth) || depth < 0 || Object.is(depth, -0)) {
        throw new TypeError(`request injection "${key}" depth must be a non-negative safe integer`)
      }
      canonicalPlacement = { kind: 'depth', depth }
    } else {
      throw new TypeError(`request injection "${key}" must use a supported placement`)
    }
    return {
      key,
      role,
      text,
      source: { kind: 'plugin', plugin: (source as Record<string, unknown>)['plugin'] as string },
      placement: canonicalPlacement,
    }
  })
  return deepFreeze(canonical)
}

/**
 * 按内容和顺序比较两个规范快照。
 * @param left - 第一个规范快照。
 * @param right - 第二个规范快照。
 * @returns 两个快照的声明及其顺序是否一致。
 */
export function requestMessageInjectionsEqual(
  left: readonly RequestMessageInjection[],
  right: readonly RequestMessageInjection[],
): boolean {
  if (left.length !== right.length) return false
  return left.every((entry, index) => {
    const other = right[index]
    return other !== undefined
      && entry.key === other.key
      && entry.text === other.text
      && entry.source.plugin === other.source.plugin
      && placementsEqual(entry.placement, other.placement)
  })
}

/** 比较两个规范位置声明。 */
function placementsEqual(
  left: RequestMessageInjection['placement'],
  right: RequestMessageInjection['placement'],
): boolean {
  if (left.kind !== right.kind) return false
  return left.kind === 'before-latest-user'
    || (right.kind === 'depth' && left.depth === right.depth)
}

/**
 * 从持久事件前缀折叠最新注入快照。
 * @param events - 按序排列的持久事件前缀。
 * @returns 最新规范快照；未记录声明时返回空快照。
 */
export function foldRequestMessageInjections(
  events: readonly SessionEvent[],
): readonly RequestMessageInjection[] {
  let state = EMPTY
  for (const event of events) {
    if (event.type === 'request/injections') {
      state = canonicalRequestMessageInjections(event.data.injections)
    }
  }
  return state
}

/** 统计消息切分处的未完成工具调用，只返回完整交互的边界。 */
function balancedCuts(messages: readonly Message[]): number[] {
  const cuts = [0]
  let pending = 0
  messages.forEach((message, index) => {
    for (const block of message.content) {
      if (block.type === 'tool-call') pending += 1
      else if (block.type === 'tool-result') pending -= 1
      if (pending < 0) {
        throw new Error(`request injection materialization found an unmatched tool result at message ${index}`)
      }
    }
    if (pending === 0) cuts.push(index + 1)
  })
  if (pending !== 0) {
    throw new Error(`request injection materialization found ${pending} unanswered tool call(s)`)
  }
  return cuts
}

/** 由声明构造标识稳定的请求专用 assistant 消息。 */
function injectionMessage(injection: RequestMessageInjection): Message {
  return deepFreeze({
    id: brandString<MessageId>(`request-injection:${injection.key}`),
    role: 'assistant',
    content: [{ type: 'text', text: injection.text }],
    source: injection.source,
  })
}

/** 将声明解析到不拆分工具交互的消息边界。 */
function placementCut(
  messages: readonly Message[],
  cuts: readonly number[],
  injection: RequestMessageInjection,
): number {
  switch (injection.placement.kind) {
    case 'depth': {
      const cutIndex = Math.max(0, cuts.length - 1 - injection.placement.depth)
      // `cuts` 始终包含开头的零边界。
      // oxlint-disable-next-line typescript/no-non-null-assertion
      const cut = cuts[cutIndex]!
      return messages[0]?.role === 'system' ? Math.max(1, cut) : cut
    }
    case 'before-latest-user': {
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (message?.role !== 'user' || message.source.kind !== 'user') continue
        if (!cuts.includes(index)) {
          throw new Error(`request injection "${injection.key}" cannot precede a user message inside a tool exchange`)
        }
        return index
      }
      throw new Error(`request injection "${injection.key}" requires a human-authored user message`)
    }
    default:
      return assertNever(injection.placement, 'request injection placement')
  }
}

/**
 * 在完整工具交互边界插入请求专用 assistant 消息，同一边界保持插件贡献顺序。
 * @param messages - 当前模型可见的聊天历史。
 * @param injections - 需要插入的请求专用声明。
 * @returns 包含注入消息的新数组；非法位置或不完整工具交互抛出异常。
 */
export function materializeRequestMessages(
  messages: readonly Message[],
  injections: readonly RequestMessageInjection[],
): Message[] {
  if (injections.length === 0) return [...messages]
  const canonical = canonicalRequestMessageInjections(injections)
  const cuts = balancedCuts(messages)
  const groups = new Map<number, Message[]>()
  for (const injection of canonical) {
    const cut = placementCut(messages, cuts, injection)
    const group = groups.get(cut)
    if (group === undefined) groups.set(cut, [injectionMessage(injection)])
    else group.push(injectionMessage(injection))
  }
  const result: Message[] = []
  for (let index = 0; index <= messages.length; index++) {
    const group = groups.get(index)
    if (group !== undefined) result.push(...group)
    if (index < messages.length) {
      // 循环边界保证该元素存在。
      // oxlint-disable-next-line typescript/no-non-null-assertion
      result.push(messages[index]!)
    }
  }
  return result
}
