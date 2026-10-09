import assert from "node:assert/strict";
import test from "node:test";
import { adaptPurgeEntry, adaptPurgeCore } from "../adapter.mjs";

test("关闭自动应用在磁盘操作前返回，并跳过客户端与桌面启动写入", () => {
  const input =
    'async function settleInstalledPatches(config, ctx, life) {\n  touchDisk();\n}\nconst written = core.patchWatchedClientBundlesSync();\nconst scrubbed = core.sanitizeDesktopCommandRuntimes();\n    if (scrubbed.length) log(cfg, "desktop runtime scrub on load:", JSON.stringify(scrubbed));';
  const output = adaptPurgeEntry(
    input + "\nconst restored = core.restoreMissingOriginalsAllHosts();",
  );
  const body = output.slice(output.indexOf("{\n") + 2, output.indexOf("\n}\n"));
  let writes = 0;
  const settle = new Function("config", "touchDisk", body);
  assert.equal(
    settle({ autoApplyOnStart: false }, () => writes++),
    "skip:auto-apply-disabled",
  );
  assert.equal(writes, 0);
  settle({ autoApplyOnStart: true }, () => writes++);
  assert.equal(writes, 1);
  const restore = new Function(
    "cfg",
    "core",
    output.slice(output.lastIndexOf("const restored")) + " return restored;",
  );
  const core = {
    restoreMissingOriginalsAllHosts: () => {
      writes++;
      return ["restored"];
    },
  };
  assert.deepEqual(restore({ autoApplyOnStart: false }, core), []);
  assert.equal(writes, 1);
  assert.deepEqual(restore({ autoApplyOnStart: true }, core), ["restored"]);
  assert.equal(writes, 2);
  assert.match(
    output,
    /cfg\.autoApplyOnStart \? core\.patchWatchedClientBundlesSync/,
  );
  assert.throws(() => adaptPurgeEntry(output), /重新审查/);
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
