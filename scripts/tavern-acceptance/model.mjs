// 只替换模型适配器；工具执行、后台结算与存储仍走真实宿主。
import { appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { summarizeRequest } from "./evidence.mjs";
import { markers } from "./fixtures.mjs";
const { LlmAdapter } = await import(
  pathToFileURL(process.env.TAVERN_ACCEPTANCE_LLM_MODULE)
);
export const inject = ["llm"];

/** 注册无网络确定性适配器，仅供隔离验收 profile 使用。 */
export function apply(ctx) {
  class Model extends LlmAdapter {
    async resolveModel(provider, id) {
      return {
        provider,
        id,
        name: "合成验收模型",
        context: { contextWindow: 64000 },
      };
    }
    async *stream(input) {
      await appendFile(
        process.env.TAVERN_ACCEPTANCE_CAPTURE,
        JSON.stringify(
          summarizeRequest(input, process.env.TAVERN_ACCEPTANCE_SYSTEM_MARKER),
        ) + "\n",
        { mode: 0o600 },
      );
      const tools = new Set((input.tools || []).map((tool) => tool.name));
      const done = new Set(
        input.messages
          .flatMap((message) => message.content || [])
          .filter((block) => block.type === "tool-result")
          .map((block) => block.toolCallId),
      );
      const text = JSON.stringify(input.messages);
      const latestBody = [...text.matchAll(/现在共有 ([1-4]) 枚徽章/g)].at(-1);
      const badges =
        tools.has("mvu_submit_update") && latestBody
          ? Number(latestBody[1])
          : text.includes("ACCEPTANCE_FORK_FOUR")
            ? 4
            : text.includes("ACCEPTANCE_REGENERATE_THREE")
              ? 3
              : text.includes("ACCEPTANCE_SECOND_TWO")
                ? 2
                : 1;
      const blocks = [];
      const call = (id, name, args) => {
        if (!done.has(id))
          blocks.push({
            type: "tool-call",
            id,
            name,
            arguments: JSON.stringify(args),
          });
      };
      if (tools.has("tavern_memory_preference")) {
        if (text.includes("ACCEPTANCE_MEMORY_SAVE"))
          call("acceptance-preference", "tavern_memory_preference", {
            action: "add",
            content: markers.preference + "：保留原始开场白。",
          });
        if (text.includes("ACCEPTANCE_MEMORY_READ"))
          call("acceptance-search", "tavern_memory_search", {
            query: markers.preference,
          });
      } else {
        if (tools.has("mvu_submit_update"))
          call("acceptance-mvu-" + badges, "mvu_submit_update", {
            operations: [
              {
                op: "replace",
                path: "/stat_data/badges",
                valueJson: String(badges),
              },
            ],
          });
        if (tools.has("posture_submit"))
          call("acceptance-posture-" + badges, "posture_submit", {
            posture: "站在观星台旁。",
          });
      }
      if (!blocks.length)
        blocks.push({
          type: "text",
          text: tools.has("tavern_memory_preference")
            ? "已完成合成改卡偏好操作。"
            : `蓝色灯笼旁，你领取了观测徽章。现在共有 ${badges} 枚徽章。`,
        });
      for (const [index, block] of blocks.entries()) {
        yield { type: "block-start", index, blockType: block.type };
        if (block.type === "text")
          yield { type: "text-delta", index, text: block.text };
        yield { type: "block-end", index, block };
      }
      yield {
        type: "finish",
        reason: {
          kind: blocks.some((block) => block.type === "tool-call")
            ? "tool-calls"
            : "stop",
        },
      };
    }
  }
  ctx.llm.registerAdapter(["tavern-acceptance"], new Model());
}
