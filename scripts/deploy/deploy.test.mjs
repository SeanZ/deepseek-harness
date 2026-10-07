/** 部署边界测试：真实 npm 锁、归档完整性、白名单与拒绝覆盖。 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { offlineLock } from "./build.mjs";
import { verifyDist, runtimeFiles } from "./audit.mjs";
import { install } from "./install.mjs";
import { json, sha256, checkIntegrity, safeRelative, run } from "./common.mjs";

function temporary(t) {
  const root = mkdtempSync(join(tmpdir(), "dt-test-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}
test("保留非本机 optional 依赖，锁拒绝未知 registry 和链接", () => {
  const entry = {
    version: "1.0.0",
    resolved:
      "https://registry.npmjs.org/native-linux/-/native-linux-1.0.0.tgz",
    integrity: "sha512-YQ==",
    optional: true,
    os: ["linux"],
    cpu: ["x64"],
  };
  const original = { packages: { "": {}, "node_modules/native-linux": entry } };
  const converted = offlineLock(original).packages["node_modules/native-linux"];
  assert.deepEqual(converted.os, ["linux"]);
  assert.deepEqual(converted.cpu, ["x64"]);
  assert.equal(converted.optional, true);
  assert.match(converted.resolved, /^file:tarballs\/[a-f0-9]{64}\.tgz$/);
  assert.ok(
    original.packages["node_modules/native-linux"].resolved.startsWith(
      "https:",
    ),
  );
  assert.throws(
    () =>
      offlineLock({
        packages: { x: { ...entry, resolved: "https://elsewhere.invalid/x" } },
      }),
    /未知/,
  );
  assert.throws(
    () => offlineLock({ packages: { x: { ...entry, link: true } } }),
    /链接/,
  );
});
test("摘要和路径拒绝篡改、绝对路径及上层穿越", () => {
  const bytes = Buffer.from("公开固定内容");
  const integrity =
    "sha512-" + createHash("sha512").update(bytes).digest("base64");
  checkIntegrity(bytes, integrity);
  assert.throws(() => checkIntegrity(Buffer.from("漂移"), integrity));
  for (const name of ["../x", "/tmp/x", "a/../../x", "a//x", "./x"])
    assert.throws(() => safeRelative(name));
});
test("制品拒绝新增文件、修改文件和 symlink", (t) => {
  const dir = temporary(t);
  const lock = { dsh: { version: "0.1.5-rc.2" } };
  json(join(dir, "lock.json"), lock);
  const expected = sha256(readFileSync(join(dir, "lock.json")));
  json(join(dir, "manifest.json"), {
    schemaVersion: 1,
    versions: lock,
    files: { "lock.json": expected },
  });
  verifyDist(dir);
  writeFileSync(join(dir, "secret.env"), "合成标记");
  assert.throws(() => verifyDist(dir), /新增或缺失/);
  rmSync(join(dir, "secret.env"));
  writeFileSync(join(dir, "lock.json"), "{}");
  assert.throws(() => verifyDist(dir), /漂移/);
  symlinkSync("/tmp", join(dir, "outside"));
  assert.throws(() => verifyDist(dir), /符号链接/);
});
test("已有 runtime 或 home 在任何写入前被拒绝", (t) => {
  const dir = temporary(t),
    existing = join(dir, "existing");
  mkdirSync(existing);
  assert.throws(
    () => install("/missing", existing, join(dir, "home")),
    /runtime/,
  );
  assert.throws(
    () => install("/missing", join(dir, "runtime"), existing),
    /home/,
  );
});
test("真实 npm tarball 用空缓存离线安装并保留脚本禁用", (t) => {
  const dir = temporary(t),
    pkg = join(dir, "package"),
    runtime = join(dir, "runtime");
  mkdirSync(pkg);
  mkdirSync(join(runtime, "tarballs"), { recursive: true });
  json(join(pkg, "package.json"), {
    name: "synthetic-offline-boundary",
    version: "1.0.0",
    type: "module",
    main: "index.js",
    scripts: { install: 'node -e "process.exit(72)"' },
  });
  writeFileSync(join(pkg, "index.js"), "export const value = 42;\n");
  const packed = JSON.parse(
    run(
      "npm",
      [
        "pack",
        "--json",
        "--ignore-scripts",
        "--pack-destination",
        join(runtime, "tarballs"),
      ],
      { cwd: pkg },
    ),
  )[0];
  const spec = "file:tarballs/" + packed.filename;
  json(join(runtime, "package.json"), {
    name: "synthetic-runtime",
    version: "1.0.0",
    dependencies: { "synthetic-offline-boundary": spec },
  });
  run(
    "npm",
    [
      "install",
      "--offline",
      "--package-lock-only",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      `--cache=${join(dir, "cache-lock")}`,
    ],
    { cwd: runtime },
  );
  run(
    "npm",
    [
      "ci",
      "--offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      `--cache=${join(dir, "cache-empty")}`,
    ],
    { cwd: runtime },
  );
  const value = run(
    process.execPath,
    [
      "--input-type=module",
      "-e",
      "import {value} from 'synthetic-offline-boundary'; console.log(value)",
    ],
    { cwd: runtime },
  );
  assert.equal(value.trim(), "42");
  assert.ok(
    runtimeFiles(runtime)["node_modules/synthetic-offline-boundary/index.js"],
  );
});

test("源码运行闭包包含必需 peer，缺少固定宿主依赖直接失败", async () => {
  const { sourceClosure } = await import("./source-host.mjs");
  const packages = [
    {
      name: "@deepseek-ai/dsh",
      peerDependencies: { "@deepseek-ai/dsh-session": "^0.1.5-rc.2" },
    },
    { name: "@deepseek-ai/dsh-session" },
  ];
  assert.equal(sourceClosure(packages, ["@deepseek-ai/dsh"]).length, 2);
  assert.throws(
    () => sourceClosure(packages.slice(0, 1), ["@deepseek-ai/dsh"]),
    /源码闭包缺失/,
  );
});

test("部署目录嵌套在读取制品前被拒绝", (t) => {
  const dir = temporary(t);
  assert.throws(
    () =>
      install(join(dir, "dist"), join(dir, "dist/runtime"), join(dir, "home")),
    /互相嵌套/,
  );
});

test("peer 审计实际检查包目录，不能用锁条目冒充已安装", async (t) => {
  const { auditPeers } = await import("./audit.mjs");
  const dir = temporary(t),
    pkg = join(dir, "node_modules/a");
  mkdirSync(pkg, { recursive: true });
  json(join(dir, "package-lock.json"), { packages: { "node_modules/a": {} } });
  json(join(pkg, "package.json"), {
    name: "a",
    peerDependencies: { b: "1.0.0" },
  });
  assert.throws(() => auditPeers(dir), /必需 peer 缺失/);
  mkdirSync(join(dir, "node_modules/b"));
  json(join(dir, "node_modules/b/package.json"), {
    name: "b",
    version: "1.0.0",
  });
  assert.equal(auditPeers(dir), 1);
});

test("source-root 在外部目录核验官方 checkout，不会静默使用脚本仓库", (t) => {
  const directory = temporary(t);
  assert.throws(
    () =>
      run(process.execPath, [
        new URL("./source-host.mjs", import.meta.url).pathname,
        "--source-root",
        directory,
        "--out",
        join(directory, "out"),
        "--skip-build",
      ]),
    /not a git repository/,
  );
});

test(
  "实际 purge 核心对官方源码 tarball 应用 #40 并生成可重安装归档",
  {
    skip:
      !process.env.DSH_DEPLOY_PURGE_SOURCE ||
      !process.env.DSH_DEPLOY_SOURCE_HOST,
  },
  async (t) => {
    const { patchHostPackage } = await import("./apply.mjs");
    const dir = temporary(t);
    const archive = join(
      process.env.DSH_DEPLOY_SOURCE_HOST,
      "dsh/deepseek-ai-dsh-system-prompt-0.1.5-rc.2.tgz",
    );
    const digest = sha256(readFileSync(archive));
    const patched = await patchHostPackage(
      archive,
      process.env.DSH_DEPLOY_PURGE_SOURCE,
      dir,
      [40],
    );
    assert.equal(patched.report.archiveBefore, digest);
    assert.notEqual(patched.report.before, patched.report.after);
    assert.equal(sha256(readFileSync(archive)), digest);
    const content = run("tar", [
      "-xOf",
      join(dir, patched.file),
      "package/lib/index.js",
    ]);
    assert.match(content, /complete prompt keeps inject/);
    assert.equal(sha256(Buffer.from(content)), patched.report.after);
    await assert.rejects(
      patchHostPackage(
        archive,
        process.env.DSH_DEPLOY_PURGE_SOURCE,
        dir,
        [40, 6],
      ),
      /仅允许/,
    );
  },
);

test("封包拒绝其它manifest、锁或只有首页成功的冒烟回执", async (t) => {
  const { verifyReceipt } = await import("./audit.mjs");
  const dist = temporary(t);
  json(join(dist, "manifest.json"), { version: 1 });
  writeFileSync(join(dist, "profile.patch.yml"), "[]\n");
  json(join(dist, "package-lock.json"), { lockfileVersion: 3 });
  json(join(dist, "lock.json"), { purge: { enabled: false } });
  const report = {
    status: "profile-smoke-passed",
    manifestSha256: sha256(readFileSync(join(dist, "manifest.json"))),
    packageLockSha256: sha256(readFileSync(join(dist, "package-lock.json"))),
    deploymentLockSha256: sha256(readFileSync(join(dist, "lock.json"))),
    runtimeAuditSha256: "a".repeat(64),
    profilePatchSha256: sha256(readFileSync(join(dist, "profile.patch.yml"))),
    purgeEnabled: false,
    runs: [1, 2].map(() => ({
      httpStatus: 200,
      tavernCapabilitiesVersion: 1,
      runtimeUnchanged: true,
    })),
  };
  verifyReceipt(dist, report);
  assert.throws(
    () => verifyReceipt(dist, { ...report, manifestSha256: "b".repeat(64) }),
    /manifest不符/,
  );
  assert.throws(
    () => verifyReceipt(dist, { ...report, packageLockSha256: "b".repeat(64) }),
    /依赖锁不符/,
  );
  assert.throws(() =>
    verifyReceipt(dist, {
      ...report,
      runs: report.runs.map(({ httpStatus }) => ({ httpStatus })),
    }),
  );
});

test("固定源码洁净检查拒绝untracked源码和根构建输入，仅豁免部署文件", async (t) => {
  const { assertCleanSource } = await import("./source-host.mjs");
  const root = temporary(t);
  run("git", ["init", "--quiet"], { cwd: root });
  mkdirSync(join(root, "scripts/deploy"), { recursive: true });
  writeFileSync(join(root, "scripts/deploy/only.mjs"), "");
  assertCleanSource(root);
  writeFileSync(join(root, "package.json"), "{}");
  assert.throws(() => assertCleanSource(root), /源码输入已修改/);
  rmSync(join(root, "package.json"));
  mkdirSync(join(root, "packages/extra"), { recursive: true });
  writeFileSync(join(root, "packages/extra/untracked.ts"), "");
  assert.throws(() => assertCleanSource(root), /源码输入已修改/);
});

test("报告目标在发行目录内时，在任何监听或日志写入前拒绝", (t) => {
  const root = temporary(t),
    dist = join(root, "dist"),
    home = join(root, "home"),
    runtime = join(root, "runtime");
  mkdirSync(dist);
  mkdirSync(home);
  mkdirSync(runtime);
  json(join(home, "deployment.json"), {
    runtime,
    dist,
    manifestSha256: "0".repeat(64),
  });
  assert.throws(
    () =>
      run(process.execPath, [
        new URL("./smoke.mjs", import.meta.url).pathname,
        "--runtime",
        runtime,
        "--home",
        home,
        "--report",
        join(dist, "validation.json"),
      ]),
    /必须位于dist之外/,
  );
});
