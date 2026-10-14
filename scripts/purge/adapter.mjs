import assert from "node:assert/strict";

/** 关闭自动应用时，在归档、版本戳和延迟自愈写入前返回；手动操作保持原逻辑。 */
export function adaptPurgeEntry(source) {
  const entry = "async function settleInstalledPatches(config, ctx, life) {\n";
  const guard =
    '  if (config.autoApplyOnStart === false) return "skip:auto-apply-disabled";\n';
  assert.equal(
    source.split(entry).length,
    2,
    "purge 启动入口已变更，必须重新审查适配",
  );
  assert.ok(!source.includes(guard), "purge 启动入口不能重复适配");
  return source.replace(entry, entry + guard);
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
