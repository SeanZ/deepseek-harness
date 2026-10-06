import test from "node:test";
import assert from "node:assert/strict";
import { verifyPatchReport } from "../patch-report.mjs";
test("补丁未命中、缺失或规则数量改变时阻止发布", () => {
  const expected = [
    { id: 1, status: "applied" },
    { id: 2, status: "missing_file" },
  ];
  verifyPatchReport(
    [
      { patch_id: 1, status: "applied" },
      { patch_id: 2, status: "missing_file" },
    ],
    expected,
  );
  for (const report of [
    [{ patch_id: 1, status: "missing_file" }],
    [
      { patch_id: 1, status: "already" },
      { patch_id: 2, status: "missing_file" },
    ],
  ])
    assert.throws(() => verifyPatchReport(report, expected));
});
