import assert from "node:assert/strict";
/** 固定版本必须逐条匹配已审阅的 Web 补丁状态；缺失与不适用不能混作命中。 */
export function verifyPatchReport(report, expected) {
  assert.deepEqual(
    report.map((row) => ({ id: row.patch_id, status: row.status })),
    expected,
    "purge 补丁匹配状态变化，需逐条审查",
  );
}
