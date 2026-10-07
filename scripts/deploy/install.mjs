/** 无网络、无安装脚本的全新目录安装；已有 runtime/home 均拒绝覆盖。 */
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  cpSync,
  symlinkSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdtempSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { json, run, sha256 } from "./common.mjs";
import { verifyDist, sealRuntime } from "./audit.mjs";

export function install(dist, runtime, home) {
  assert.ok(!existsSync(runtime), "禁止覆盖已有 runtime");
  assert.ok(!existsSync(home), "禁止覆盖已有 home");
  for (const left of [dist, runtime, home])
    for (const right of [dist, runtime, home]) {
      if (left !== right)
        assert.ok(
          !resolve(left).startsWith(resolve(right) + "/"),
          "dist/runtime/home 不允许互相嵌套",
        );
    }
  assert.equal(
    new Set([dist, runtime, home].map((path) => resolve(path))).size,
    3,
    "dist/runtime/home 必须不同",
  );
  const manifest = verifyDist(dist),
    lock = manifest.versions;
  const cache = mkdtempSync(join(tmpdir(), "dt-empty-cache-"));
  mkdirSync(runtime, { recursive: true });
  try {
    for (const name of [
      "package.json",
      "package-lock.json",
      "tarballs",
      "lock.json",
      "purge-patches.json",
    ])
      cpSync(join(dist, name), join(runtime, name), { recursive: true });
    run(
      "npm",
      [
        "ci",
        "--offline",
        ...(manifest.sourcePeersMaterialized ? ["--legacy-peer-deps"] : []),
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        `--cache=${cache}`,
      ],
      { cwd: runtime, stdio: "inherit" },
    );
    // tarball 与 package-lock 留在 runtime，使安装来源可追溯且 npm 不会回落到公网。
    const profile = join(home, "profiles/tavern");
    mkdirSync(profile, { recursive: true });
    const bundles = [
      "@deepseek-ai/dsh-base",
      "@deepseek-ai/dsh-web-app",
      "dsh-profile-tavern",
    ];
    if (lock.purge.enabled) bundles.push("dsh-purge");
    json(join(profile, "package.json"), {
      name: "dsh-profile-tavern-deployment",
      private: true,
      dependencies: {
        "dsh-profile-tavern": lock.tavern.version,
        "dsh-purge": lock.purge.version,
      },
      dsh: { profile: { bundles, patchReload: "startup" } },
    });
    symlinkSync(
      join(runtime, "node_modules"),
      join(profile, "node_modules"),
      "dir",
    );
    let patch = readFileSync(join(dist, "profile.patch.yml"), "utf8");
    if (!lock.purge.enabled)
      patch = patch.slice(patch.indexOf("- id: webserver"));
    writeFileSync(join(profile, "cordis.patch.yml"), patch);
    if (lock.purge.enabled) {
      const result = run(process.execPath, [
        "--input-type=module",
        "-e",
        "import {pathToFileURL} from 'node:url'; const core=await import(pathToFileURL(process.argv[1]).href); const status=core.seedOverrideSync(process.argv[2]); if(status!=='wrote') throw new Error('新home默认提示词未写入'); console.log(core.defaultOverrideHash());",
        join(runtime, "node_modules/dsh-purge/lib/core.js"),
        home,
      ]);
      json(join(home, "prompt-seed.json"), {
        defaultPromptSha256: result.trim(),
      });
    }
    const audit = sealRuntime(runtime, lock);
    json(join(home, "deployment.json"), {
      runtime,
      dist,
      manifestSha256: sha256(readFileSync(join(dist, "manifest.json"))),
      profile: "tavern",
    });
    return {
      runtime,
      home,
      platform: audit.platform,
      arch: audit.arch,
      host: audit.host,
    };
  } finally {
    rmSync(cache, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({
    options: {
      dist: { type: "string" },
      runtime: { type: "string" },
      home: { type: "string" },
    },
  });
  assert.ok(
    values.dist && values.runtime && values.home,
    "需要 --dist --runtime --home",
  );
  console.log(
    JSON.stringify(
      install(
        resolve(values.dist),
        resolve(values.runtime),
        resolve(values.home),
      ),
    ),
  );
}
