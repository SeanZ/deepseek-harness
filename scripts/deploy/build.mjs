/** 从固定公开源构建插件，把 npm 锁的完整跨平台闭包封存为原始 tarball。 */
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  copyFileSync,
  cpSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { patchHostPackage } from "./apply.mjs";
import { sourcePackages, sourceClosure } from "./source-host.mjs";
import {
  scriptRoot,
  readJson,
  sha256,
  json,
  run,
  files,
  checkIntegrity,
} from "./common.mjs";

function download(url, destination) {
  run("curl", [
    "--fail",
    "--location",
    "--retry",
    "2",
    "--silent",
    "--show-error",
    url,
    "-o",
    destination,
  ]);
}
function source(work, component, archive) {
  const file = join(work, component.commit + ".tar.gz");
  if (archive) copyFileSync(resolve(archive), file);
  else download(component.url, file);
  assert.equal(
    sha256(readFileSync(file)),
    component.sha256,
    "固定源码归档摘要不符",
  );
  const dir = join(work, component.commit);
  mkdirSync(dir);
  run("tar", ["-xzf", file, "--strip-components=1", "-C", dir]);
  assert.equal(
    readJson(join(dir, "package.json")).version,
    component.version,
    "源码版本不符",
  );
  return dir;
}
function pack(directory, output, name) {
  const result = JSON.parse(
    run(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", output],
      { cwd: directory },
    ),
  )[0];
  const file = join(output, result.filename),
    target = join(output, name);
  if (file !== target) {
    copyFileSync(file, target);
    rmSync(file);
  }
}
/** 将线上锁转换为安装目录内的相对 tarball，保留 optional/os/cpu 条件。 */
export function offlineLock(original) {
  const lock = structuredClone(original);
  for (const [path, entry] of Object.entries(lock.packages)) {
    if (!path) continue;
    assert.ok(!entry.link, `不允许外部链接：${path}`);
    if (entry.resolved?.startsWith("file:tarballs/")) continue;
    assert.ok(
      entry.resolved?.startsWith("https://registry.npmjs.org/"),
      `未知依赖源：${path}`,
    );
    assert.ok(entry.integrity, `依赖缺少摘要：${path}`);
    entry.resolved = `file:tarballs/${sha256(Buffer.from(entry.resolved))}.tgz`;
  }
  return lock;
}

async function main() {
  const { values } = parseArgs({
    options: {
      out: { type: "string" },
      lock: { type: "string", default: join(scriptRoot, "lock.json") },
      "tavern-archive": { type: "string" },
      "purge-archive": { type: "string" },
      "source-host": { type: "string" },
      "dependency-cache": { type: "string" },
      "update-lock": { type: "boolean", default: false },
    },
  });
  assert.ok(values.out, "需要 --out");
  const out = resolve(values.out),
    lock = readJson(resolve(values.lock));
  assert.ok(!existsSync(out), "输出目录已存在");
  assert.equal(lock.dsh.version, "0.1.5-rc.2");
  assert.match(
    lock.purge.url,
    /^https:\/\/codeload\.github\.com\/SeanZ\/dsh-purge\/tar.gz\/[a-f0-9]{40}$/,
  );
  for (const component of [lock.dsh, lock.tavern, lock.purge])
    assert.match(component.commit, /^[a-f0-9]{40}$/);
  const work = mkdtempSync(join(tmpdir(), "dt-pack-"));
  mkdirSync(join(out, "tarballs"), { recursive: true });
  let success = false;
  try {
    const tavern = source(work, lock.tavern, values["tavern-archive"]);
    const purge = source(work, lock.purge, values["purge-archive"]);
    run(process.execPath, ["bin/build-tavern-client.mjs"], {
      cwd: tavern,
      stdio: "inherit",
    });
    run(process.execPath, ["bin/build-plugin-package.mjs"], {
      cwd: tavern,
      stdio: "inherit",
    });
    pack(tavern, join(out, "tarballs"), "tavern.tgz");
    pack(purge, join(out, "tarballs"), "purge.tgz");
    const host = readJson(join(tavern, "config/cli-runtime/package.json"));
    const plugin = readJson(join(tavern, "tavern-plugin/package.json"));
    const manifest = {
      name: "dsh-tavern-sealed-runtime",
      version: "1.0.0",
      private: true,
      type: "module",
      dependencies: {
        ...host.dependencies,
        react: readJson(join(tavern, "package.json")).devDependencies.react,
        "react-dom": readJson(join(tavern, "package.json")).devDependencies[
          "react-dom"
        ],
        ...plugin.dependencies,
        "dsh-profile-tavern": "file:tarballs/tavern.tgz",
        "dsh-purge": "file:tarballs/purge.tgz",
      },
      overrides: { ...host.overrides, ...lock.vendor },
    };
    // 根依赖必须与 overrides 完全一致，禁止半旧半新宿主。
    for (const name of Object.keys(manifest.dependencies))
      if (host.overrides[name])
        manifest.dependencies[name] = host.overrides[name];
    let sourceOrigin;
    const patchReports = [];
    if (lock.purge.enabled)
      assert.ok(
        values["source-host"],
        "启用purge必须从固定源码宿主封存选定PE补丁",
      );
    if (values["source-host"]) {
      const sourceDir = resolve(values["source-host"]);
      sourceOrigin = readJson(join(sourceDir, "source-host.json"));
      assert.equal(sourceOrigin.commit, lock.dsh.commit);
      assert.deepEqual(sourceOrigin.hostFiles, lock.hostFiles);
      const all = sourcePackages(sourceDir);
      const wanted = sourceClosure(all, [
        ...Object.keys(host.overrides),
        ...Object.keys(manifest.dependencies).filter((name) =>
          name.startsWith("@deepseek-ai/"),
        ),
      ]);
      for (const entry of wanted) {
        assert.equal(
          sourceOrigin.packages.find((item) => item.name === entry.name)
            ?.sha256,
          entry.sha256,
          "源码制品漂移",
        );
        let file = `source-${entry.sha256}.tgz`;
        if (
          lock.purge.enabled &&
          entry.name === "@deepseek-ai/dsh-system-prompt"
        ) {
          const patched = await patchHostPackage(
            entry.archive,
            purge,
            join(out, "tarballs"),
            lock.purge.deploymentPatches,
            lock.hostFiles,
          );
          file = patched.file;
          patchReports.push(patched.report);
        } else copyFileSync(entry.archive, join(out, "tarballs", file));
        manifest.dependencies[entry.name] = `file:tarballs/${file}`;
        manifest.overrides[entry.name] = `file:tarballs/${file}`;
      }
      lock.dsh.origin = "source-build";
      json(join(out, "source-host.json"), sourceOrigin);
    }
    if (lock.purge.enabled)
      assert.equal(patchReports.length, 1, "缺少必需PE补丁");
    json(join(out, "purge-patches.json"), patchReports);
    json(join(out, "package.json"), manifest);
    const frozen = join(
      scriptRoot,
      values["source-host"] ? "runtime-source-lock.json" : "runtime-lock.json",
    );
    if (values["update-lock"]) {
      run(
        "npm",
        [
          "install",
          "--package-lock-only",
          ...(values["source-host"] ? ["--legacy-peer-deps"] : []),
          "--ignore-scripts",
          "--no-audit",
          "--no-fund",
          "--registry=https://registry.npmjs.org",
        ],
        { cwd: out, stdio: "inherit" },
      );
      const createdLock = readJson(join(out, "package-lock.json"));
      createdLock.deploymentInputs = {
        versions: lock,
        overrides: manifest.overrides,
      };
      json(join(out, "package-lock.json"), createdLock);
      json(frozen, createdLock);
    } else copyFileSync(frozen, join(out, "package-lock.json"));
    const original = readJson(join(out, "package-lock.json"));
    assert.deepEqual(
      original.deploymentInputs,
      { versions: lock, overrides: manifest.overrides },
      "部署版本或overrides漂移，必须审查后更新冻结锁",
    );
    assert.deepEqual(
      original.packages[""].dependencies,
      manifest.dependencies,
      "冻结依赖锁与部署输入不符，需要审查后显式 --update-lock",
    );
    for (const [name, filename] of [
      ["dsh-profile-tavern", "tavern.tgz"],
      ["dsh-purge", "purge.tgz"],
    ])
      checkIntegrity(
        readFileSync(join(out, "tarballs", filename)),
        original.packages[`node_modules/${name}`].integrity,
      );
    const offline = offlineLock(original);

    const pending = [
      ...new Map(
        Object.values(original.packages)
          .filter((entry) => entry.resolved?.startsWith("https:"))
          .map((entry) => [entry.resolved, entry]),
      ).values(),
    ];
    let completed = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (pending.length) {
          const entry = pending.pop();
          const filename = `${sha256(Buffer.from(entry.resolved))}.tgz`;
          // 子进程下载不继承密钥；每个归档按 npm integrity 再校验。
          const cached =
            values["dependency-cache"] &&
            join(resolve(values["dependency-cache"]), filename);
          if (cached && existsSync(cached)) {
            checkIntegrity(readFileSync(cached), entry.integrity);
            copyFileSync(cached, join(out, "tarballs", filename));
            continue;
          }
          const { spawn } = await import("node:child_process");
          await new Promise((accept, reject) => {
            const child = spawn(
              "curl",
              [
                "--fail",
                "--location",
                "--retry",
                "2",
                "--silent",
                "--show-error",
                entry.resolved,
                "-o",
                join(out, "tarballs", filename),
              ],
              { stdio: "inherit", env: { PATH: process.env.PATH } },
            );
            child.on("error", reject);
            child.on("exit", (code) =>
              code === 0
                ? accept()
                : reject(new Error(`依赖下载失败 ${filename}`)),
            );
          });
          checkIntegrity(
            readFileSync(join(out, "tarballs", filename)),
            entry.integrity,
          );
          if (++completed % 100 === 0)
            console.log(`已封存 ${completed} 个依赖归档`);
        }
      }),
    );
    json(join(out, "package-lock.json"), offline);
    json(join(out, "lock.json"), lock);
    cpSync(
      join(scriptRoot, "profile.patch.yml"),
      join(out, "profile.patch.yml"),
    );
    for (const name of [
      "common.mjs",
      "install.mjs",
      "audit.mjs",
      "start.mjs",
      "smoke.mjs",
    ])
      copyFileSync(join(scriptRoot, name), join(out, name));
    const inventory = Object.fromEntries(
      files(out).map((file) => [file, sha256(readFileSync(join(out, file)))]),
    );
    const platformPackages = Object.entries(offline.packages)
      .filter(([, entry]) => entry.os || entry.cpu)
      .map(([path, entry]) => ({
        path,
        version: entry.version,
        os: entry.os,
        cpu: entry.cpu,
        optional: entry.optional,
      }));
    json(join(out, "manifest.json"), {
      schemaVersion: 1,
      versions: lock,
      hostOrigin: sourceOrigin ? "source-build" : "official-npm-tarballs",
      pluginOrigin: "pinned-source-archive-local-pack",
      patches: patchReports,
      buildNode: process.version,
      npm: run("npm", ["--version"]).trim(),
      sourcePeersMaterialized: Boolean(sourceOrigin),
      packageCount: Object.keys(offline.packages).length - 1,
      platformPackages,
      files: inventory,
    });
    json(join(out, "validation.json"), {
      status: "built-not-accepted",
      runtime: "pending",
      linuxRuntime: "not-tested",
      model: "pending",
      purgeEnabled: lock.purge.enabled,
    });
    success = true;
    console.log(
      JSON.stringify({
        out,
        sourcePeersMaterialized: Boolean(sourceOrigin),
        packageCount: Object.keys(offline.packages).length - 1,
      }),
    );
  } finally {
    if (success) rmSync(work, { recursive: true, force: true });
    else console.error(`构建现场保留：${work}`);
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
