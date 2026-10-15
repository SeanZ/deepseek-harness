import assert from "node:assert/strict";
import test from "node:test";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { root } from "../common.mjs";
import { resolvePatchedDependency } from "../source-artifacts.mjs";

const dependency = process.env.DSH_TEST_RUNTIME
  ? join(
      resolve(process.env.DSH_TEST_RUNTIME),
      "node_modules/@earendil-works/pi-ai",
    )
  : resolvePatchedDependency(root, "@earendil-works/pi-ai");
const load = (name) =>
  import(pathToFileURL(join(dependency, "dist/api", `${name}.js`)));
const { usesGoogleThinkingLevel } = await load("google-shared");

test("共享能力判断识别 Gemini 4，保留旧模型的思考协议", () => {
  for (const [id, expected] of [
    ["gemini-2.5-pro", false],
    ["gemini-2.5-flash", false],
    ["gemini-3-flash-preview", true],
    ["gemini-3.8-flash", true],
    ["gemini-4-argon", true],
    ["gemini-5-neutral", true],
    ["gemini-10-neutral", true],
    ["gemini-flash-latest", true],
    ["gemma-4-neutral", true],
    ["gemma4-neutral", true],
    ["unknown-neutral", false],
  ]) {
    assert.equal(usesGoogleThinkingLevel({ id }), expected, id);
  }
});

// 使用真实参数构建器，在供应商请求前结束；不读取密钥，也不修改全局 fetch。
async function captureThinking(api, provider, id, reasoning) {
  const { streamSimple } = await load(api);
  const model = {
    id,
    name: id,
    provider,
    api,
    baseUrl: "http://127.0.0.1:1",
    reasoning: true,
    thinkingLevelMap: {
      off: null,
      minimal: null,
      low: "LOW",
      medium: "MEDIUM",
      high: "HIGH",
      xhigh: null,
      max: null,
    },
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 1048576,
    maxTokens: 65536,
  };
  const context = {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "Reply OK." }],
        timestamp: 0,
      },
    ],
  };
  let payload;
  let failure;
  const stop = "STOP_BEFORE_GOOGLE_REQUEST";
  const response = streamSimple(model, context, {
    apiKey: "synthetic-test-value",
    reasoning,
    thinkingBudgets: {},
    onPayload(value) {
      payload = value;
      throw new Error(stop);
    },
  });
  for await (const event of response) {
    assert.equal(event.type, "error", "供应商流不应启动");
    failure = event.error?.errorMessage;
  }
  assert.ok(payload, "必须经过真实参数构建器");
  assert.ok(failure?.includes(stop), "必须在联网前按预期结束并完成流清理");
  return payload.config?.thinkingConfig;
}

for (const [provider, api] of [
  ["google", "google-generative-ai"],
  ["google-vertex", "google-vertex"],
]) {
  test(`${provider} 的 Argon 档位进入 level 字段，旧模型保持原协议`, async () => {
    for (const reasoning of ["low", "medium", "high"]) {
      assert.deepEqual(
        await captureThinking(api, provider, "gemini-4-argon", reasoning),
        { includeThoughts: true, thinkingLevel: reasoning.toUpperCase() },
      );
    }
    for (const id of ["gemini-3.8-flash", "gemma-4-neutral"]) {
      assert.deepEqual(await captureThinking(api, provider, id, "medium"), {
        includeThoughts: true,
        thinkingLevel: "MEDIUM",
      });
    }
    assert.deepEqual(
      await captureThinking(api, provider, "gemini-2.5-pro", "medium"),
      { includeThoughts: true, thinkingBudget: 8192 },
    );
  });
}
