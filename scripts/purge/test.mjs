import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { root, run, json, digest } from "./common.mjs";
import { auditRuntime } from "./runtime-audit.mjs";
const { values } = parseArgs({
  options: { runtime: { type: "string" }, dist: { type: "string" } },
});
assert.ok(values.runtime && values.dist, "需要 --runtime 和 --dist");
const runtime = resolve(values.runtime),
  dist = resolve(values.dist);
auditRuntime(runtime, dist);
const dir = join(root, "scripts/purge/tests");
const tests = readdirSync(dir)
  .filter(
    (name) =>
      name.endsWith(".test.mjs") ||
      (name.endsWith(".integration.mjs") && name !== "legacy.integration.mjs"),
  )
  .map((name) => join(dir, name));
tests.push(
  ...readdirSync(join(dir, "platform"))
    .filter((name) => name.endsWith(".test.mjs"))
    .map((name) => join(dir, "platform", name)),
);
run(
  process.execPath,
  [
    "--experimental-import-meta-resolve",
    "--test",
    "--test-concurrency=1",
    ...tests,
  ],
  {
    stdio: "inherit",
    env: { ...process.env, DSH_TEST_RUNTIME: runtime },
  },
);
const result = auditRuntime(runtime, dist);
json(join(runtime, "acceptance.json"), {
  passed: true,
  manifestSha256: digest(readFileSync(join(dist, "manifest.json"))),
  ...result,
});
console.log(JSON.stringify(result));
