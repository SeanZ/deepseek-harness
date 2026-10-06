import assert from "node:assert/strict";

/** 关闭自动应用时，启动不再重写宿主；业务注入、UI 与手动操作保持 purge 原逻辑。 */
export function adaptPurgeEntry(source) {
  const replacements = [
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
