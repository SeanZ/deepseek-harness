import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { root } from "../common.mjs";
import { briefIdentity, prohibition } from "../alpha3.mjs";

const runtime = resolve(
  process.env.DSH_TEST_RUNTIME ?? join(root, ".artifacts/purge/runtime"),
);
const load = (name) =>
  import(
    pathToFileURL(
      join(runtime, "node_modules/@deepseek-ai", name, "lib/index.js"),
    )
  );
const { Context } = await load("cordis");
const { default: SystemPrompt, renderPrompt } = await load("dsh-system-prompt");
const { default: SessionProjections } = await load("dsh-session-projection");
const { Session } = await load("dsh-session");
const { createSystemMessage } = await load("dsh-llm");
const HarnessDev = await load("dsh-harness-dev-context");
const legacy = JSON.parse(
  readFileSync(new URL("../fixtures/legacy-web-prompt.json", import.meta.url)),
).web;

test("真实 Web 上下文保留 URL 和旧会话原提示，当前提示采用迁移后的 purge 规则", async () => {
  const ctx = new Context();
  try {
    await ctx.plugin(SystemPrompt);
    await ctx.plugin(SessionProjections);
    ctx.provide("webApp", {
      getAdvertisedUrl: () => "http://127.0.0.1:31999/",
    });
    await ctx.plugin(HarnessDev);
    const assembly = await ctx.systemPrompt.assemble();
    const web = assembly.sections.find(
      (row) => row.name === "app:web-surface",
    ).text;
    assert.ok(web.startsWith(briefIdentity));
    assert.ok(!web.includes(prohibition));
    assert.ok(
      assembly.contexts.some(
        (row) =>
          row.name === "app:web-surface" &&
          row.text.includes("http://127.0.0.1:31999/"),
      ),
    );
    const session = Session.create("legacy-web-fixture");
    session.append(
      "system/message",
      { turn: 1, step: 1, message: createSystemMessage(legacy) },
      { surfaceOp: "append" },
    );
    const restored = await ctx.systemPrompt.assemble({ agent: { session } });
    assert.equal(
      restored.sections.find((row) => row.name === "app:web-surface").text,
      legacy,
    );
    assert.ok(renderPrompt(restored).includes(legacy));
  } finally {
    await ctx.fiber.dispose();
  }
});
