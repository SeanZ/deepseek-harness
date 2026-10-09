import assert from "node:assert/strict";

// alpha.2 在屏蔽普通运行上下文时仍保留 required 项；适配必须保留这个新行为。
export const requiredContexts =
  "\t\tconst requiredContexts = new Set([...contextByName.values()].filter((entry) => entry.required === true).map((entry) => entry.name));\n";
export const filteredContexts =
  "contexts: runtimeContextSuppressed ? transformed.contexts.filter((entry) => requiredContexts.has(entry.name)) : transformed.contexts";
export const completePattern =
  '\t\tconst transformed = await this.ctx.waterfall(scopeTarget(this, scope), "system-prompt/assemble", assembly, context, () => Promise.resolve(assembly));\n' +
  "\t\tif (completeSection === void 0 && !runtimeContextSuppressed) return transformed;\n" +
  requiredContexts +
  "\t\treturn {\n" +
  "\t\t\t...transformed,\n" +
  "\t\t\tsections: completeSection === void 0 ? transformed.sections : [completeSection],\n" +
  "\t\t\t" +
  filteredContexts +
  "\n" +
  "\t\t};";

/** 为固定版规则增加 alpha.2 匹配；封存部署排除配置加载前自动恢复文件的规则。 */
export function adaptAlpha2Core(source) {
  const start = source.indexOf('name: "COMPLETE_PROMPT_KEEP_INJECT"');
  const end = source.indexOf('name: "SETTINGS_LEGACY_API"', start);
  assert.ok(start >= 0 && end > start, "purge complete 规则布局已变更");
  const rule = source.slice(start, end);
  const marker = "replacements: [";
  assert.equal(rule.split(marker).length, 2);
  assert.ok(!rule.includes("alpha.2 required contexts"), "不能重复适配");
  const extra = `replacements: [
      { // alpha.2 required contexts
        pattern: ${JSON.stringify(completePattern)},
        replace: COMPLETE_PROMPT_WATERFALL_INJECT
          .replace("\\t\\treturn {\\n", ${JSON.stringify(requiredContexts + "\t\treturn {\n")})
          .replace("contexts: runtimeContextSuppressed ? [] : transformed.contexts", ${JSON.stringify(filteredContexts)}),
      },`;
  let output =
    source.slice(0, start) + rule.replace(marker, extra) + source.slice(end);
  const all =
    "export const ALL_PATCHES = [...PATCHES, ...CODE_PATCHES, ...ENGINE_PATCHES, ...NEW_TOOL_PATCHES];";
  assert.equal(output.split(all).length, 2, "purge 规则清单已变更");
  output = output.replace(
    all,
    "// 封存制品缺少 overlay 时直接报错，不在配置加载前从 bak 写回宿主。\n" +
      'export const ALL_PATCHES = [...PATCHES, ...CODE_PATCHES, ...ENGINE_PATCHES, ...NEW_TOOL_PATCHES].filter((patch) => patch.name !== "OVERLAY_RESTORE_FROM_BAK");',
  );
  return output;
}
