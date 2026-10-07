/** 核实源码宿主八文件并调用官方发布打包器；不复制已安装 node_modules。 */
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync, mkdirSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { scriptRoot, readJson, run, sha256, json } from "./common.mjs";

export function sourcePackages(directory) {
  const packages = [];
  for (const family of ["dsh", "vendor"])
    for (const file of readdirSync(join(directory, family))
      .filter((name) => name.endsWith(".tgz"))
      .sort()) {
      const archive = join(directory, family, file);
      const pkg = JSON.parse(
        run("tar", ["-xOf", archive, "package/package.json"]),
      );
      packages.push({ ...pkg, archive, sha256: sha256(readFileSync(archive)) });
    }
  assert.equal(
    new Set(packages.map((entry) => entry.name)).size,
    packages.length,
    "源码制品名称重复",
  );
  return packages;
}
export function sourceClosure(packages, roots) {
  const indexed = new Map(packages.map((entry) => [entry.name, entry]));
  const selected = new Set(),
    pending = [...roots];
  while (pending.length) {
    const name = pending.pop();
    if (selected.has(name)) continue;
    if (!indexed.has(name)) {
      assert.ok(
        !/^@deepseek-ai\/(dsh(?:-|$)|cordis(?:-|$)|cosmokit$|schemastery$)/.test(
          name,
        ),
        `源码闭包缺失：${name}`,
      );
      continue;
    }
    selected.add(name);
    const entry = indexed.get(name);
    for (const section of [
      "dependencies",
      "optionalDependencies",
      "peerDependencies",
    ])
      for (const [dependency, spec] of Object.entries(entry[section] ?? {})) {
        assert.ok(!/^(workspace:|link:)/.test(spec), `未转换源码依赖：${name}`);
        pending.push(dependency);
      }
  }
  return packages.filter((entry) => selected.has(entry.name));
}

/** 官方源码与构建输入均必须洁净；只排除独立部署实现目录。 */
export function assertCleanSource(root) {
  assert.equal(
    run(
      "git",
      [
        "status",
        "--porcelain",
        "--untracked-files=all",
        "--",
        ".",
        ":(exclude)scripts/deploy/**",
        ":(exclude)scripts/tavern-acceptance/**",
        ":(exclude).agentdocs/**",
      ],
      { cwd: root },
    ).trim(),
    "",
    "源码输入已修改",
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      "source-root": { type: "string" },
      "skip-build": { type: "boolean", default: false },
    },
  });
  assert.ok(values.out, "需要 --out");
  const root = resolve(values["source-root"] ?? resolve(scriptRoot, "../..")),
    out = resolve(values.out),
    lock = readJson(join(scriptRoot, "lock.json"));
  assert.ok(!existsSync(out), "源码输出已存在");
  assert.equal(
    run("git", ["rev-parse", "HEAD"], { cwd: root }).trim(),
    lock.dsh.commit,
    "源码 HEAD 必须为固定官方提交；部署脚本提交后请用 --source-root 指向固定官方独立 worktree",
  );
  assertCleanSource(root);
  if (!values["skip-build"])
    run("pnpm", ["run", "build:official"], { cwd: root, stdio: "inherit" });
  const locations = new Map();
  for (const group of readdirSync(join(root, "packages"), {
    withFileTypes: true,
  }).filter((entry) => entry.isDirectory())) {
    const parent = join(root, "packages", group.name);
    if (
      !existsSync(parent) ||
      !readdirSync(parent, { withFileTypes: true }).some((entry) =>
        entry.isDirectory(),
      )
    )
      continue;
    for (const entry of readdirSync(parent, { withFileTypes: true }).filter(
      (entry) => entry.isDirectory(),
    )) {
      const file = join(parent, entry.name, "package.json");
      if (existsSync(file)) locations.set(readJson(file).name, dirname(file));
    }
  }
  const hashes = {};
  for (const [name, expected] of Object.entries(lock.hostFiles)) {
    const parts = name.split("/"),
      pkgName = parts.slice(0, 2).join("/"),
      sub = parts.slice(2).join("/") || ".";
    const directory = locations.get(pkgName),
      pkg = readJson(join(directory, "package.json"));
    const target = pkg.exports[sub === "." ? "." : "./" + sub];
    const file = join(
      directory,
      typeof target === "string" ? target : target.default,
    );
    hashes[name] = sha256(readFileSync(file));
    assert.equal(
      hashes[name],
      expected,
      `源码构建与固定 Tavern 字节不符：${name}`,
    );
  }
  mkdirSync(out, { recursive: true });
  for (const family of ["dsh", "vendor"])
    run(
      process.execPath,
      [
        "--import",
        "tsx/esm",
        "scripts/release/pack.ts",
        "--family",
        family,
        "--out",
        join(out, family),
        "--concurrency",
        "8",
      ],
      { cwd: root, stdio: "inherit" },
    );
  json(join(out, "source-host.json"), {
    commit: lock.dsh.commit,
    version: lock.dsh.version,
    origin: "source-build",
    node: process.version,
    hostFiles: hashes,
    packages: sourcePackages(out).map(({ name, version, sha256: digest }) => ({
      name,
      version,
      sha256: digest,
    })),
  });
}
