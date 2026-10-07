import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { markers } from "./fixtures.mjs";

/** 仅发布计数、摘要与来源名称；不发布请求正文、配置或凭据。 */
export function summarizeRequest(input, systemMarker = "") {
  const system =
    typeof input.system === "string"
      ? input.system
      : JSON.stringify(input.system ?? "");
  // source.sections 是日志元数据；计数只看模型实际收到的正文，避免把来源文本再算一次。
  const messages = (input.messages ?? [])
    .map((message) =>
      typeof message.content === "string"
        ? message.content
        : (message.content ?? [])
            .map((block) => block.text ?? block.arguments ?? "")
            .join("\n"),
    )
    .join("\n");
  const all = system + messages;
  const count = (needle) => (needle ? all.split(needle).length - 1 : null);
  const paragraphs = system
    .split(/\n\s*\n/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 100);
  return {
    sessionId: input.sessionId,
    systemSha256: createHash("sha256").update(system).digest("hex"),
    systemBytes: Buffer.byteLength(system),
    repeatedSystemParagraphs: paragraphs.length - new Set(paragraphs).size,
    markers: Object.fromEntries(
      Object.entries(markers).map(([key, value]) => [key, count(value)]),
    ),
    injectionOccurrences: count(systemMarker),
    tools: (input.tools ?? []).map((tool) => tool.name),
    sources: [
      ...new Set(
        (input.messages ?? []).flatMap((message) =>
          (message.source?.sections ?? []).map((section) => section.name),
        ),
      ),
    ],
    roles: (input.messages ?? []).map((message) => message.role),
    pluginMessages: (input.messages ?? [])
      .filter(
        (message) =>
          message.role === "user" && message.source?.kind === "plugin",
      )
      .map((message) => ({
        plugin: message.source.plugin,
        form: message.source.form,
        contentSha256: createHash("sha256")
          .update(JSON.stringify(message.content))
          .digest("hex"),
        sections: (message.source.sections ?? []).map(
          (section) => section.name,
        ),
      })),
    sectionDigests: (input.messages ?? []).flatMap((message) =>
      (message.source?.sections ?? []).map((section) => ({
        name: section.name,
        sha256: createHash("sha256")
          .update(String(section.text ?? ""))
          .digest("hex"),
        preserved: messages.includes(String(section.text ?? "")),
      })),
    ),
  };
}

/** 工具名称出现不算调用：必须存在同 callId 的成功持久事件。 */
export function successfulToolCalls(events) {
  const calls = new Map(
    events
      .filter((event) => event.type === "tool/call")
      .map((event) => [event.data.callId, event.data]),
  );
  return events
    .filter((event) => event.type === "tool/result" && !event.data?.error)
    .flatMap((event) =>
      (event.data?.message?.content ?? [])
        .filter(
          (block) =>
            block.type === "tool-result" &&
            !block.isError &&
            block.toolCallId === event.data.message.source?.callId,
        )
        .map((block) => calls.get(block.toolCallId)),
    )
    .filter(Boolean);
}

export function successfulTools(events) {
  return successfulToolCalls(events).map((call) => call.name);
}

/** 比较真正落盘的用户/助手轮次、正文和状态，不比较时间戳。 */
export function stableChat(chat) {
  return {
    id: chat.id,
    posture: chat.posture,
    messages: chat.messages.map((message) => ({
      role: message.role,
      text: message.sourceText ?? message.text,
      variables: message.variables,
      receipt: message.mvu?.receipt?.status,
    })),
  };
}

/** 后台状态必须由工具结算，正文与结构化状态同时满足。 */
export function inspectChat(
  chat,
  rounds,
  badges,
  expectedText,
  posture = true,
) {
  const replies = chat.messages.filter(
    (message) => message.role === "assistant" && !message.greeting,
  );
  assert.equal(
    chat.messages.filter((message) => message.role === "user").length,
    rounds,
    "用户轮次数不一致",
  );
  assert.equal(replies.length, rounds, "助手轮次数不一致");
  const last = replies.at(-1);
  assert.ok(
    (last.sourceText ?? last.text).includes(expectedText),
    "正文不符合本轮验收",
  );
  assert.equal(
    last.variables?.[last.swipeId || 0]?.stat_data?.badges,
    badges,
    "徽章状态不一致",
  );
  assert.equal(last.mvu?.receipt?.status, "updated", "MVU 尚未成功落盘");
  if (posture)
    assert.ok(
      typeof chat.posture === "string" && chat.posture.trim(),
      "姿势尚未成功落盘",
    );
  else assert.equal(chat.posture, "", "手工编辑应清除过时姿势");
  return { rounds, badges, mvu: "updated", posture };
}
