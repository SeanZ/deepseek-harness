import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { root } from "../common.mjs";

const runtime = resolve(
  process.env.DSH_TEST_RUNTIME ?? join(root, ".artifacts/purge/runtime"),
);

test("真实 SystemPrompt complete 组装同时保留 purge、工作区说明和必需上下文", async () => {
  const load = (name) =>
    import(
      pathToFileURL(
        join(runtime, "node_modules/@deepseek-ai", name, "lib/index.js"),
      )
    );
  const { Context } = await load("cordis");
  const { default: SystemPrompt, renderPrompt } =
    await load("dsh-system-prompt");
  const ctx = new Context();
  try {
    await ctx.plugin(SystemPrompt, { includeRuntimeContext: false });
    ctx.systemPrompt.context({
      name: "directory",
      order: 0,
      required: true,
      text: "NEUTRAL_DIRECTORY",
    });
    ctx.systemPrompt.section({
      name: "agent-instructions",
      order: 20,
      text: "NEUTRAL_WORKSPACE",
    });
    ctx.systemPrompt.section({
      name: "complete",
      order: 50,
      complete: true,
      text: "NEUTRAL_COMPLETE",
    });
    ctx.on("system-prompt/assemble", async (assembly, _context, next) => {
      assembly.sections.push({
        name: "dsh-purge:fixture",
        text: "NEUTRAL_PURGE",
      });
      assembly.contexts.push({ name: "optional", text: "NEUTRAL_SUPPRESSED" });
      return next();
    });
    const assembly = await ctx.systemPrompt.assemble();
    for (const marker of [
      "NEUTRAL_PURGE",
      "NEUTRAL_WORKSPACE",
      "NEUTRAL_COMPLETE",
    ])
      assert.ok(renderPrompt(assembly).includes(marker), `缺少 ${marker}`);
    assert.deepEqual(assembly.contexts, [
      { name: "directory", text: "NEUTRAL_DIRECTORY" },
    ]);
  } finally {
    await ctx.fiber.dispose();
  }
});

test("默认提示词无需保存即可读取，自定义提示词跨进程重启后保持", () => {
  const home = mkdtempSync(join(tmpdir(), "dsh-purge-prompt-"));
  const moduleUrl = pathToFileURL(
    join(runtime, "node_modules/dsh-purge/lib/core.js"),
  ).href;
  const custom = "NEUTRAL_CUSTOM_PROMPT_PERSISTENCE";
  const run = (body) =>
    JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `import * as core from ${JSON.stringify(moduleUrl)};
const home = process.env.DSH_HOME;
${body}`,
        ],
        { encoding: "utf8", env: { ...process.env, DSH_HOME: home } },
      ),
    );
  try {
    assert.deepEqual(
      run(`const sync = core.syncPromptInjectOnDiskSync(home);
const ui = await core.readOverrideForUi(home);
console.log(JSON.stringify({ action: sync.action, defaultLoaded: core.normalizeOverride(ui.content) === core.normalizeOverride(core.defaultOverrideText()), customized: ui.customized }));`),
      { action: "wrote", defaultLoaded: true, customized: false },
    );
    assert.deepEqual(
      run(`const saved = await core.saveOverrideContent(home, ${JSON.stringify(custom)});
console.log(JSON.stringify({ customized: saved.customized }));`),
      { customized: true },
    );
    assert.deepEqual(
      run(`const sync = core.syncPromptInjectOnDiskSync(home);
const ui = await core.readOverrideForUi(home);
console.log(JSON.stringify({ action: sync.action, customRetained: ui.content === ${JSON.stringify(custom)}, customized: ui.customized }));`),
      { action: "keep", customRetained: true, customized: true },
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
