import assert from "node:assert/strict";
import { realpathSync, existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { inside, digest, json, run, lock } from "./common.mjs";

import { verifyPatchReport } from "./patch-report.mjs";

const { values } = parseArgs({
  options: { runtime: { type: "string" }, home: { type: "string" } },
});
assert.ok(values.runtime && values.home, "需要 --runtime 和 --home");
const runtime = realpathSync(values.runtime),
  home = realpathSync(values.home);
assert.ok(process.env.DSH_HOME, "必须显式传入隔离 DSH_HOME");
assert.equal(realpathSync(process.env.DSH_HOME), home);
assert.equal(process.env.DSH_SURFACE, "web");
const aiBase = join(runtime, "node_modules/@deepseek-ai");
assert.ok(process.env.DSH_BASE, "必须显式传入隔离 DSH_BASE");
assert.equal(realpathSync(process.env.DSH_BASE), aiBase);
assert.ok(
  existsSync(join(runtime, "source-audit.json")),
  "应用前必须完成官方制品完整性检查",
);
const modulePath = join(runtime, "node_modules/dsh-purge/lib/core.js");
const core = await import(pathToFileURL(modulePath));
const targets = [
  ...new Set(
    Object.values(core.targetFiles(aiBase, home)).flat().filter(Boolean),
  ),
];
const allowed = targets.filter(existsSync);
for (const file of allowed) {
  assert.ok(
    inside(runtime, realpathSync(file)) || inside(home, realpathSync(file)),
    "purge 目标越出隔离目录",
  );
}
const before = Object.fromEntries(
  allowed.map((file) => [file, digest(readFileSync(file))]),
);
await core.backupAll(aiBase);
const report = await core.applyPatches(aiBase);
json(join(runtime, "purge-report.json"), report);
verifyPatchReport(report, lock.webPatchStatuses);
assert.equal(
  core.summarizeApplyReport(report).failed.length,
  0,
  "purge 必需规则应用失败",
);
assert.ok(core.hostCleanMarkersPresent(aiBase), "purge 核心标记不完整");
for (const file of allowed.filter((file) => /\.[cm]?js$/.test(file)))
  run(process.execPath, ["--check", file]);
const files = allowed
  .filter((file) => before[file] !== digest(readFileSync(file)))
  .map((file) => ({
    scope: inside(runtime, file) ? "runtime" : "home",
    path: relative(inside(runtime, file) ? runtime : home, file),
    before: before[file],
    after: digest(readFileSync(file)),
  }));
const receipt = {
  schemaVersion: 1,
  purge: lock.purge,
  files,
  patches: report.map(({ patch_id, name, status, applied, missing }) => ({
    id: patch_id,
    name,
    status,
    applied,
    missing,
  })),
};
json(join(runtime, "purge-audit.json"), receipt);
// 停用自愈后仍保留准确的版本戳，供 purge 设置页显示当前状态。
const reapply = await import(
  pathToFileURL(join(runtime, "node_modules/dsh-purge/lib/reapply.js"))
);
reapply.markPatchesApplied(lock.purge.commit);
console.log(
  JSON.stringify({
    changedFiles: files.length,
    statuses: report.reduce(
      (counts, row) => ({
        ...counts,
        [row.status]: (counts[row.status] ?? 0) + 1,
      }),
      {},
    ),
  }),
);
