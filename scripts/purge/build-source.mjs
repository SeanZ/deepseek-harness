import assert from "node:assert/strict";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { root, lock, run, json, readJson } from "./common.mjs";
import {
  collectSourceArtifacts,
  packInstalledDependency,
} from "./source-artifacts.mjs";
import { preparePurge } from "./source.mjs";

const { values } = parseArgs({
  options: {
    out: { type: "string", default: "dist/purge" },
    cache: { type: "string", default: ".artifacts/purge" },
    "skip-build": { type: "boolean", default: false },
  },
});
const out = resolve(root, values.out),
  cache = resolve(root, values.cache);
assert.ok(!existsSync(out), "制品目录必须为空，保留旧制品后选择新目录");
assert.equal(
  readJson(join(root, "package.json")).version,
  lock.upstreamVersion,
);
assert.equal(
  run("git", ["rev-parse", `${lock.upstreamTag}^{commit}`]),
  lock.upstreamCommit,
);
// 核心源码始终等于固定官方基线；不让旧的自有补丁随构建重新进入制品。
assert.equal(
  run("git", [
    "diff",
    lock.upstreamCommit,
    "--",
    "packages",
    "apps",
    "vendor",
    "native",
  ]),
  "",
  "运行时代码与官方基线有差异",
);
const source = await preparePurge(cache);
if (!values["skip-build"])
  run("pnpm", ["run", "build:official"], { stdio: "inherit" });
for (const family of ["dsh", "vendor"])
  run(
    "pnpm",
    [
      "run",
      "release:pack",
      "--family",
      family,
      "--out",
      `dist/npm-${family}`,
      "--concurrency",
      "8",
    ],
    { stdio: "inherit", env: { ...process.env, COPYFILE_DISABLE: "1" } },
  );
mkdirSync(out, { recursive: true });
const packages = collectSourceArtifacts(out, root);
const purge = packInstalledDependency(source, out);
json(join(out, "manifest.json"), {
  schemaVersion: 1,
  mode: "source",
  upstreamVersion: lock.upstreamVersion,
  upstreamCommit: lock.upstreamCommit,
  integrationBaseCommit: run("git", ["rev-parse", "HEAD"]),
  integrationWorktreeDirty: run("git", ["status", "--porcelain"]) !== "",
  purge: lock.purge,
  runtimeRoots: lock.runtimeRoots,
  packages,
  plugins: [purge],
});
console.log(JSON.stringify({ artifacts: packages.length + 1, out }));
