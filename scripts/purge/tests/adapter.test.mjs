import assert from "node:assert/strict";
import test from "node:test";
import { adaptPurgeEntry, adaptPurgeCore } from "../adapter.mjs";

test("关闭自动应用在归档、版本戳和自愈写入前返回", async () => {
  const input =
    "async function settleInstalledPatches(config, ctx, life) {\n  touchDisk();\n}";
  const output = adaptPurgeEntry(input);
  let writes = 0;
  const settle = new Function(
    "touchDisk",
    output + " return settleInstalledPatches;",
  )(() => writes++);
  assert.equal(
    await settle({ autoApplyOnStart: false }),
    "skip:auto-apply-disabled",
  );
  assert.equal(writes, 0);
  await settle({ autoApplyOnStart: true });
  assert.equal(writes, 1);
  assert.throws(() => adaptPurgeEntry(output), /重复适配/);
  assert.throws(() => adaptPurgeEntry("upstream changed"), /重新审查/);
});

test("回退规则只适配目标规则内的匹配与替换，拒绝未知布局和重复适配", () => {
  const line = '"\\t\\t\\t\\tthis.revised.clear();\\n"';
  const input = `${line}\n  {\n    id: 74,\n    name: "REWIND_DROP_SENT_ON_APPEND",\n    pattern: ${line},\n    replace: ${line}\n  },\n  {\n    id: 75,\n    other: ${line}\n  }`;
  const output = adaptPurgeCore(input);
  assert.equal(output.split("if (this.revised.size > 0)").length, 3);
  assert.equal(output.split(line).length, 3, "其它规则不能被修改");
  assert.throws(() => adaptPurgeCore(output));
  assert.throws(() => adaptPurgeCore("unknown layout"));
});
