/** 安装前校验完整制品，启动前校验固定宿主和运行时全量文件。 */
import assert from "node:assert/strict";
import {
  readFileSync,
  readdirSync,
  lstatSync,
  existsSync,
  readlinkSync,
} from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { readJson, sha256, files, safeRelative, json } from "./common.mjs";

export function verifyDist(dist) {
  const manifest = readJson(join(dist, "manifest.json"));
  assert.equal(manifest.schemaVersion, 1);
  const listed = Object.keys(manifest.files).sort();
  const actual = files(dist)
    .filter(
      (file) =>
        !["manifest.json", "validation.json", "SHA256SUMS"].includes(file),
    )
    .sort();
  assert.deepEqual(actual, listed, "制品出现新增或缺失文件");
  for (const file of listed)
    assert.equal(
      sha256(readFileSync(join(dist, safeRelative(file)))),
      manifest.files[file],
      `制品漂移：${file}`,
    );
  assert.deepEqual(readJson(join(dist, "lock.json")), manifest.versions);
  return manifest;
}
export function hostAudit(runtime, lock) {
  const require = createRequire(join(runtime, "package.json"));
  const hashes = {};
  for (const [name, expected] of Object.entries(lock.hostFiles)) {
    const digest = sha256(readFileSync(require.resolve(name)));
    assert.equal(digest, expected, `宿主字节漂移：${name}`);
    hashes[name] = digest;
  }
  assert.equal(
    readJson(require.resolve("@deepseek-ai/dsh-session/package.json")).version,
    lock.dsh.version,
  );
  assert.equal(
    readJson(require.resolve("dsh-purge/package.json")).version,
    lock.purge.version,
  );
  assert.equal(
    readJson(join(runtime, "node_modules/dsh-profile-tavern/package.json"))
      .version,
    lock.tavern.version,
  );
  return hashes;
}
/** node_modules/.bin 是 npm 管理的相对链接；其余安装文件按字节记录。 */
export function runtimeFiles(runtime) {
  const result = {};
  function walk(directory) {
    for (const name of readdirSync(directory).sort()) {
      const file = join(directory, name),
        stat = lstatSync(file),
        key = relative(runtime, file);
      if (key === "runtime-audit.json") continue;
      if (stat.isSymbolicLink()) {
        assert.ok(key.includes("node_modules/.bin/"), `未知安装链接：${key}`);
        const target = readlinkSync(file);
        assert.ok(
          resolve(dirname(file), target).startsWith(resolve(runtime) + "/"),
          "安装链接越界",
        );
        result[key] = `symlink:${target}`;
      } else if (stat.isDirectory()) walk(file);
      else result[key] = sha256(readFileSync(file));
    }
  }
  walk(runtime);
  return result;
}
export function sealRuntime(runtime, lock) {
  const report = {
    schemaVersion: 1,
    platform: process.platform,
    arch: process.arch,
    host: hostAudit(runtime, lock),
    requiredPeersChecked: auditPeers(runtime),
    files: runtimeFiles(runtime),
  };
  json(join(runtime, "runtime-audit.json"), report);
  return report;
}
export function verifyRuntime(runtime) {
  assert.ok(existsSync(join(runtime, "runtime-audit.json")), "运行时未封存");
  const expected = readJson(join(runtime, "runtime-audit.json"));
  assert.deepEqual(runtimeFiles(runtime), expected.files, "运行时文件漂移");
  hostAudit(runtime, readJson(join(runtime, "lock.json")));
  return expected;
}

/** 对每个安装包检查必需 peer 的实际可解析目录，防止物化源码闭包遗漏服务。 */
export function auditPeers(runtime) {
  const lock = readJson(join(runtime, "package-lock.json"));
  let checked = 0;
  for (const key of Object.keys(lock.packages).filter(Boolean)) {
    const directory = join(runtime, safeRelative(key));
    if (!existsSync(join(directory, "package.json"))) continue;
    const pkg = readJson(join(directory, "package.json"));
    for (const peer of Object.keys(pkg.peerDependencies ?? {})) {
      if (pkg.peerDependenciesMeta?.[peer]?.optional) continue;
      let cursor = directory,
        found = false;
      while (cursor.startsWith(resolve(runtime))) {
        if (existsSync(join(cursor, "node_modules", peer, "package.json"))) {
          found = true;
          break;
        }
        const parent = dirname(cursor);
        if (parent === cursor) break;
        cursor = parent;
      }
      assert.ok(found, `必需 peer 缺失：${pkg.name} -> ${peer}`);
      checked++;
    }
  }
  return checked;
}

/** 封包回执绑定已安装 manifest 与两份锁，并要求真实 Tavern/purge 接口结果。 */
export function verifyReceipt(dist, report) {
  assert.equal(report.status, "profile-smoke-passed", "缺少真实profile冒烟");
  assert.equal(
    report.manifestSha256,
    sha256(readFileSync(join(dist, "manifest.json"))),
    "冒烟回执与manifest不符",
  );
  assert.equal(
    report.packageLockSha256,
    sha256(readFileSync(join(dist, "package-lock.json"))),
    "冒烟回执与依赖锁不符",
  );
  assert.equal(
    report.deploymentLockSha256,
    sha256(readFileSync(join(dist, "lock.json"))),
    "冒烟回执与部署版本不符",
  );
  assert.equal(
    report.profilePatchSha256,
    sha256(readFileSync(join(dist, "profile.patch.yml"))),
    "冒烟profile配置与发行模板不符",
  );
  assert.match(report.runtimeAuditSha256, /^[a-f0-9]{64}$/);
  assert.ok(report.runs?.length >= 2, "缺少重启验收");
  const lock = readJson(join(dist, "lock.json"));
  assert.equal(
    report.purgeEnabled,
    lock.purge.enabled,
    "profile与固定purge启用策略不符",
  );
  for (const run of report.runs) {
    assert.equal(run.httpStatus, 200);
    assert.equal(run.tavernCapabilitiesVersion, 1);
    assert.equal(run.runtimeUnchanged, true);
    if (lock.purge.enabled) {
      assert.equal(run.purge?.pluginVersion, lock.purge.version);
      assert.equal(run.purge.allowHostMutation, false);
      assert.equal(run.purge.rewindEnabled, false);
      assert.equal(run.purge.mutationDenied, true);
      assert.equal(run.purge.rewindDenied, true);
      assert.equal(run.purge.promptScope, "root");
    }
  }
  return report;
}
