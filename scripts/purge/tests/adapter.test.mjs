import assert from "node:assert/strict";
import test from "node:test";
import { adaptPurgeEntry } from "../adapter.mjs";

test("关闭自动应用在磁盘操作前返回，并跳过客户端与桌面启动写入", () => {
  const input =
    'async function settleInstalledPatches(config, ctx, life) {\n  touchDisk();\n}\nconst written = core.patchWatchedClientBundlesSync();\nconst scrubbed = core.sanitizeDesktopCommandRuntimes();\n    if (scrubbed.length) log(cfg, "desktop runtime scrub on load:", JSON.stringify(scrubbed));';
  const output = adaptPurgeEntry(input);
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
  assert.match(
    output,
    /cfg\.autoApplyOnStart \? core\.patchWatchedClientBundlesSync/,
  );
  assert.throws(() => adaptPurgeEntry(output), /重新审查/);
  assert.throws(() => adaptPurgeEntry("upstream changed"), /重新审查/);
});
