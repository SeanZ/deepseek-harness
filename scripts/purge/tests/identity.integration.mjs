import assert from "node:assert/strict";
import test from "node:test";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { root } from "../common.mjs";

const runtime = resolve(
  process.env.DSH_TEST_RUNTIME ?? join(root, ".artifacts/purge/runtime"),
);
const load = (name) =>
  import(pathToFileURL(join(runtime, "node_modules", name, "lib/index.js")));
const { Context } = await load("@deepseek-ai/cordis");
const { default: SystemPrompt, renderPrompt } = await load(
  "@deepseek-ai/dsh-system-prompt",
);
const { rewritePromptAssembly } = await import(
  pathToFileURL(join(runtime, "node_modules/dsh-purge/lib/identity.js"))
);

test("purge 使用宿主工作目录上下文，保留自定义后缀及其插值错误", async () => {
  for (const suffix of [
    "",
    "Your working directory is {{cwd}}.",
    "NEUTRAL {{model}}",
    "NEUTRAL {{unknown}}",
  ]) {
    const ctx = new Context();
    try {
      await ctx.plugin(SystemPrompt, { personaSuffix: suffix });
      ctx.systemPrompt.variable("model", () => "MODEL");
      ctx.systemPrompt.context({
        name: "working-directory:current",
        order: 0,
        required: true,
        interpolate: false,
        text: "Current working directory: /neutral/workspace.",
      });
      const assembly = await ctx.systemPrompt.assemble();
      assert.equal(Object.hasOwn(assembly.variables, "cwd"), false);
      const before = structuredClone(assembly);
      const rewritten = rewritePromptAssembly(assembly, "NEUTRAL_PURGE", {
        capabilityProtocol: false,
      });
      assert.deepEqual(assembly, before, "不能原地污染宿主组装结果");
      assert.equal(rewritten.contexts, assembly.contexts);
      assert.equal(rewritten.tools, assembly.tools);
      if (suffix.includes("unknown")) {
        assert.throws(() => renderPrompt(rewritten), /unknown prompt variable/);
      } else {
        const text = renderPrompt(rewritten);
        assert.ok(text.includes("NEUTRAL_PURGE"));
        assert.ok(!text.includes("{{cwd}}"));
        if (suffix.includes("model")) assert.ok(text.includes("NEUTRAL MODEL"));
      }
    } finally {
      await ctx.fiber.dispose();
    }
  }
});
