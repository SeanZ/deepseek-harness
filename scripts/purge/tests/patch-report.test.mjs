import test from "node:test";
import assert from "node:assert/strict";
import { verifyPatchReport } from "../patch-report.mjs";
test("补丁未命中、缺失或规则数量改变时阻止发布", () => {
  const expected = [
    { id: 1, name: "first", status: "applied" },
    { id: 2, name: "second", status: "missing_file" },
  ];
  verifyPatchReport(
    [
      { patch_id: 1, name: "first", status: "applied" },
      { patch_id: 2, name: "second", status: "missing_file" },
    ],
    expected,
  );
  for (const report of [
    [{ patch_id: 1, name: "first", status: "missing_file" }],
    [
      { patch_id: 1, name: "first", status: "already" },
      { patch_id: 2, name: "second", status: "missing_file" },
    ],
  ])
    assert.throws(() => verifyPatchReport(report, expected));
});

test("上游编号重复时按名称分别核验，拒绝被同编号规则替换", () => {
  const expected = [
    { id: 74, name: "ASSEMBLE_BEFORE_PRESTEP", status: "applied" },
    { id: 74, name: "REWIND_DROP_SENT_ON_APPEND", status: "applied" },
  ];
  const report = expected.map(({ id, ...row }) => ({ patch_id: id, ...row }));
  verifyPatchReport(report, expected);
  assert.throws(() => verifyPatchReport([report[0], report[0]], expected));
  assert.throws(() => verifyPatchReport([...report].reverse(), expected));
});
