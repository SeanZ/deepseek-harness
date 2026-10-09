import assert from "node:assert/strict";

/** 关闭自动应用时，启动不再重写宿主；业务注入、UI 与手动操作保持 purge 原逻辑。 */
export function adaptPurgeEntry(source) {
  const replacements = [
    [
      "const restored = core.restoreMissingOriginalsAllHosts();",
      "const restored = cfg.autoApplyOnStart ? core.restoreMissingOriginalsAllHosts() : [];",
    ],
    [
      "async function settleInstalledPatches(config, ctx, life) {\n",
      'async function settleInstalledPatches(config, ctx, life) {\n  if (config.autoApplyOnStart === false) return "skip:auto-apply-disabled";\n',
    ],
    [
      "const written = core.patchWatchedClientBundlesSync();",
      "const written = cfg.autoApplyOnStart ? core.patchWatchedClientBundlesSync() : [];",
    ],
    [
      'const scrubbed = core.sanitizeDesktopCommandRuntimes();\n    if (scrubbed.length) log(cfg, "desktop runtime scrub on load:", JSON.stringify(scrubbed));',
      'const scrubbed = cfg.autoApplyOnStart ? core.sanitizeDesktopCommandRuntimes() : [];\n    if (scrubbed.length) log(cfg, "desktop runtime scrub on load:", JSON.stringify(scrubbed));',
    ],
  ];
  let output = source;
  for (const [from, to] of replacements) {
    assert.equal(
      output.split(from).length,
      2,
      "purge 启动入口已变更，必须重新审查适配",
    );
    output = output.replace(from, to);
  }
  return output;
}

/** purge 回退规则适配官方 0.2.1 的条件清空写法，保留补丁原本行为。 */
export function adaptPurgeCore(source) {
  const start = source.indexOf('name: "REWIND_DROP_SENT_ON_APPEND"');
  const end = source.indexOf("\n  {\n    id: 75,", start);
  assert.ok(
    start >= 0 && end > start,
    "purge 回退规则已变更，必须重新审查适配",
  );
  const rule = source.slice(start, end);
  const original = '"\\t\\t\\t\\tthis.revised.clear();\\n"';
  const replacement =
    '"\\t\\t\\t\\tif (this.revised.size > 0) this.revised.clear();\\n"';
  assert.equal(
    rule.split(original).length,
    3,
    "purge 回退规则匹配与替换必须同时适配",
  );
  return (
    source.slice(0, start) +
    rule.replaceAll(original, replacement) +
    source.slice(end)
  );
}
