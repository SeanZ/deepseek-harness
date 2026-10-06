import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { importRuntime } from "./runtime.mjs";
test(
  "pi-ai 已补丁流式工具参数：中间为空，结束后完整",
  { timeout: 20000 },
  async () => {
    const { stream } = await importRuntime(
      "@earendil-works/pi-ai/api/openai-completions",
    );
    const { normalizeContext } = await importRuntime(
      "@earendil-works/pi-ai/utils/transcript",
    );
    const args = { file_path: "notes.md", content: "x".repeat(2048) };
    const fragments = JSON.stringify(args).match(/.{1,7}/gs);
    const server = createServer(async (req, res) => {
      for await (const _chunk of req) {
        // 消费完整请求体后发送模拟流。
      }
      res.writeHead(200, { "Content-Type": "text/event-stream" });
      const emit = (data) =>
        res.write("data: " + JSON.stringify(data) + "\n\n");
      emit({
        choices: [
          {
            delta: {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: "call_1",
                  type: "function",
                  function: { name: "write", arguments: "" },
                },
              ],
            },
            index: 0,
            finish_reason: null,
          },
        ],
      });
      for (const fragment of fragments)
        emit({
          choices: [
            {
              delta: {
                tool_calls: [{ index: 0, function: { arguments: fragment } }],
              },
              index: 0,
              finish_reason: null,
            },
          ],
        });
      emit({
        choices: [{ delta: {}, index: 0, finish_reason: "tool_calls" }],
        usage: { prompt_tokens: 3, completion_tokens: 1 },
      });
      res.end("data: [DONE]\n\n");
    });
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    try {
      const model = {
        id: "m",
        name: "m",
        api: "openai-completions",
        provider: "test",
        baseUrl: "http://127.0.0.1:" + server.address().port,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 8192,
        maxTokens: 1024,
      };
      const context = normalizeContext({
        messages: [{ role: "user", content: "hi", timestamp: 0 }],
      });
      let partials = 0,
        final;
      for await (const event of stream(model, context, {
        apiKey: "test-key",
        signal: AbortSignal.timeout(10000),
      })) {
        if (event.type === "toolcall_delta" && event.delta.length) {
          const block = event.partial.content[event.contentIndex];
          assert.deepEqual(block.arguments, {});
          partials++;
        } else if (event.type === "toolcall_end")
          final = event.toolCall.arguments;
        else if (event.type === "error")
          throw new Error(event.error.errorMessage);
      }
      assert.equal(partials, fragments.length);
      assert.deepEqual(final, args);
    } finally {
      server.closeAllConnections();
      await new Promise((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    }
  },
);
