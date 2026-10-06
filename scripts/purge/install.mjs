import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { digest, json, readJson, run } from "./common.mjs";
import { sourceRuntimePackages } from "./source-closure.mjs";
import { auditRuntime } from "./runtime-audit.mjs";

/** 目标系统安装相同源码 tarball，平台依赖由目标系统解析。 */
export function installationManifest(dist) {
  const manifest = readJson(join(dist, "manifest.json"));
  const packages = sourceRuntimePackages(
    manifest.packages,
    manifest.runtimeRoots,
  );
  const dependencies = {},
    overrides = {};
  for (const entry of [...packages, ...manifest.plugins]) {
    assert.equal(basename(entry.file), entry.file, "制品路径越界");
    assert.ok(entry.file.endsWith(".tgz"));
    assert.ok(!dependencies[entry.name], "制品名称重复");
    const file = join(dist, entry.file);
    assert.equal(
      digest(readFileSync(file)),
      entry.sha256,
      `制品损坏：${entry.name}`,
    );
    dependencies[entry.name] = `file:${file}`;
    overrides[entry.name] = `file:${file}`;
  }
  return {
    name: "dsh-purge-runtime",
    version: "0.0.0",
    private: true,
    type: "module",
    dependencies,
    overrides,
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({
    options: {
      dist: { type: "string" },
      runtime: { type: "string" },
      registry: { type: "string", default: "https://registry.npmjs.org" },
    },
  });
  assert.ok(values.dist && values.runtime, "需要 --dist 和 --runtime");
  const dist = resolve(values.dist),
    runtime = resolve(values.runtime);
  assert.ok(!existsSync(runtime), "禁止覆盖已有运行时");
  mkdirSync(runtime, { recursive: true });
  json(join(runtime, "package.json"), installationManifest(dist));
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      `--registry=${values.registry}`,
    ],
    { cwd: runtime, stdio: "inherit" },
  );
  const report = auditRuntime(runtime, dist);
  json(join(runtime, "source-audit.json"), report);
  console.log(JSON.stringify(report));
}
