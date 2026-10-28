import assert from "node:assert/strict";
import {
  readFileSync,
  readdirSync,
  copyFileSync,
  renameSync,
  realpathSync,
  mkdtempSync,
  cpSync,
  rmSync,
  existsSync,
  lstatSync,
  readlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { digest, run, workspace } from "./common.mjs";
import { tmpdir } from "node:os";

import { assertSourceClosure, runtimeSections } from "./source-closure.mjs";

export function describeTarball(path, family) {
  const metadata = JSON.parse(
    run("tar", ["-xOf", path, "package/package.json"], { cwd: workspace }),
  );
  return Object.fromEntries([
    ["name", metadata.name],
    ["version", metadata.version],
    ["family", family],
    ...[...runtimeSections, "peerDependenciesMeta"]
      .filter((key) => metadata[key])
      .map((key) => [key, metadata[key]]),
  ]);
}

/** 比较实际打包载荷；peer 链接由目标安装器按同一 manifest 重新解析。 */
function packagePayload(directory) {
  const entries = [];
  function visit(relative) {
    for (const name of readdirSync(resolve(directory, relative)).sort()) {
      if (["node_modules", ".gitignore"].includes(name)) continue;
      const key = relative ? `${relative}/${name}` : name;
      const path = resolve(directory, key);
      const stat = lstatSync(path);
      if (stat.isDirectory()) visit(key);
      else if (stat.isSymbolicLink())
        entries.push([key, "link", readlinkSync(path)]);
      else {
        assert.ok(stat.isFile(), `不支持的包文件：${key}`);
        entries.push([key, stat.mode & 0o777, digest(readFileSync(path))]);
      }
    }
  }
  visit("");
  return entries;
}

/** 从真实消费者定位依赖；仅允许载荷完全相同的多个 peer 组合。 */
export function resolvePatchedDependency(source, name) {
  const directories = [];
  for (const family of ["packages", "apps", "vendor"]) {
    const base = resolve(source, family);
    if (!existsSync(base)) continue;
    for (const group of readdirSync(base, { withFileTypes: true }).filter(
      (row) => row.isDirectory(),
    )) {
      const path = resolve(base, group.name);
      if (family === "packages") {
        for (const item of readdirSync(path, { withFileTypes: true }).filter(
          (row) => row.isDirectory(),
        ))
          directories.push(resolve(path, item.name));
      } else directories.push(path);
    }
  }
  const selected = new Set();
  for (const directory of directories) {
    const manifest = resolve(directory, "package.json");
    if (!existsSync(manifest)) continue;
    const metadata = JSON.parse(readFileSync(manifest, "utf8"));
    if (
      !runtimeSections.some((section) =>
        Object.hasOwn(metadata[section] ?? {}, name),
      )
    )
      continue;
    selected.add(realpathSync(resolve(directory, "node_modules", name)));
  }
  assert.ok(selected.size > 0, `运行时消费者没有唯一解析 ${name}`);
  const [directory, ...variants] = [...selected].sort();
  if (variants.length) {
    const expected = packagePayload(directory);
    for (const variant of variants)
      assert.deepEqual(
        packagePayload(variant),
        expected,
        `运行时依赖载荷不一致：${name}`,
      );
  }
  assert.equal(
    JSON.parse(readFileSync(resolve(directory, "package.json"), "utf8")).name,
    name,
  );
  assert.match(
    directory.replaceAll("\\", "/"),
    /\.pnpm\/[^/]+_patch_hash=/,
    "依赖未应用 pnpm 补丁",
  );
  return directory;
}

/** 复用上游发布器，打包实际应用 pnpm 补丁后的运行依赖。 */
export function collectSourceArtifacts(out, source = workspace) {
  const { load } = createRequire(resolve(source, "package.json"))("js-yaml");
  const entries = [];
  for (const family of ["dsh", "vendor"]) {
    const directory = resolve(source, "dist", `npm-${family}`);
    for (const file of readdirSync(directory)
      .filter((name) => name.endsWith(".tgz"))
      .sort()) {
      const from = resolve(directory, file);
      const sha256 = digest(readFileSync(from));
      const target = file.replace(/\.tgz$/, `-${sha256.slice(0, 12)}.tgz`);
      entries.push({ ...describeTarball(from, family), file: target, sha256 });
      copyFileSync(from, resolve(out, target));
    }
  }
  const config = load(
    readFileSync(resolve(source, "pnpm-workspace.yaml"), "utf8"),
  );
  const runtimeNames = new Set(
    entries.flatMap((entry) =>
      runtimeSections.flatMap((key) => Object.keys(entry[key] ?? {})),
    ),
  );
  for (const [identity, patch] of Object.entries(
    config.patchedDependencies ?? {},
  )) {
    const name = identity.slice(0, identity.lastIndexOf("@"));
    if (!runtimeNames.has(name)) continue;
    const directory = resolvePatchedDependency(source, name);
    const artifact = packInstalledDependency(directory, out);
    entries.push({
      ...artifact,
      ...describeTarball(resolve(out, artifact.file), "patched"),
      patchSha256: digest(readFileSync(resolve(source, patch))),
    });
  }
  assertSourceClosure(entries);
  return entries;
}

/** npm pack 的 prepare 行为依赖 npm 版本；已发布依赖按原始安装载荷重打包，保留 manifest 与预编译平台文件。 */
export function packInstalledDependency(directory, out) {
  const scratch = mkdtempSync(resolve(tmpdir(), "dsh-dependency-pack-"));
  try {
    const metadata = JSON.parse(
      readFileSync(resolve(directory, "package.json"), "utf8"),
    );
    cpSync(directory, resolve(scratch, "package"), {
      recursive: true,
      filter: (path) =>
        !path
          .slice(directory.length)
          .split(/[\\/]/)
          .some((part) => ["node_modules", ".gitignore"].includes(part)),
    });
    const filename = `${metadata.name.replace(/^@/, "").replaceAll("/", "-")}-${metadata.version}.tgz`;
    const from = resolve(out, filename);
    run("tar", ["--no-xattrs", "-czf", from, "-C", scratch, "package"], {
      cwd: scratch,
      env: { ...process.env, COPYFILE_DISABLE: "1" },
    });
    const sha256 = digest(readFileSync(from));
    const file = filename.replace(/\.tgz$/, `-${sha256.slice(0, 12)}.tgz`);
    renameSync(from, resolve(out, file));
    return { name: metadata.name, version: metadata.version, file, sha256 };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
