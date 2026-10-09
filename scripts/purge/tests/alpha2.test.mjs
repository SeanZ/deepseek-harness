import assert from "node:assert/strict";
import test from "node:test";
import { adaptAlpha2Core, completePattern } from "../alpha2.mjs";

test("alpha.2 的 complete 匹配保留 required 上下文，并排除启动自动恢复规则", async () => {
  const replacement =
    "\t\tconst transformed = assembly;\n\t\treturn {\n...transformed, contexts: runtimeContextSuppressed ? [] : transformed.contexts\n};";
  const input = `const COMPLETE_PROMPT_WATERFALL_INJECT = ${JSON.stringify(replacement)};
const PATCHES = [{ name: "COMPLETE_PROMPT_KEEP_INJECT", replacements: [] }, { name: "SETTINGS_LEGACY_API" }];
const CODE_PATCHES = [], ENGINE_PATCHES = [], NEW_TOOL_PATCHES = [{name: "OVERLAY_RESTORE_FROM_BAK"}];
export const ALL_PATCHES = [...PATCHES, ...CODE_PATCHES, ...ENGINE_PATCHES, ...NEW_TOOL_PATCHES];`;
  const output = adaptAlpha2Core(input);
  const { ALL_PATCHES } = await import(
    `data:text/javascript,${encodeURIComponent(output)}`
  );
  assert.ok(
    !ALL_PATCHES.some((row) => row.name === "OVERLAY_RESTORE_FROM_BAK"),
  );
  const rule = ALL_PATCHES[0].replacements[0];
  assert.equal(rule.pattern, completePattern);
  const assemble = new Function(
    "assembly",
    "runtimeContextSuppressed",
    "contextByName",
    rule.replace,
  );
  const contexts = [{ name: "cwd" }, { name: "optional" }];
  const definitions = new Map([
    ["cwd", { name: "cwd", required: true }],
    ["optional", { name: "optional" }],
  ]);
  assert.deepEqual(assemble({ contexts }, true, definitions).contexts, [
    contexts[0],
  ]);
  assert.deepEqual(
    assemble({ contexts }, false, definitions).contexts,
    contexts,
  );
  assert.throws(() => adaptAlpha2Core(output), /重复适配/);
  assert.throws(() => adaptAlpha2Core("unknown layout"), /布局/);
});
