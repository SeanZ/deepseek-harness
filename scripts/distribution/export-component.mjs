/** 复用官方 npm 原包与已应用 pnpm 补丁的依赖，生成独立宿主组件。 */
import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { collectSourceArtifacts } from "./source-artifacts.mjs";
import { digest, run } from "./common.mjs";
import { assertSourceClosure } from "./source-closure.mjs";

export function exportComponent({
  source,
  out,
  repository,
  commit,
  collect = collectSourceArtifacts,
}) {
  assert.match(repository, /^[\w.-]+\/[\w.-]+$/);
  assert.match(commit, /^[a-f0-9]{40}$/);
  source = resolve(source);
  out = resolve(out);
  assert.ok(!existsSync(out), "组件输出必须不存在");
  const version = JSON.parse(
    readFileSync(join(source, "package.json")),
  ).version;
  assert.match(version, /^[\w.-]+$/);
  mkdirSync(out, { recursive: true });
  try {
    const packagesDir = join(out, "packages");
    mkdirSync(packagesDir);
    const packages = collect(packagesDir, source);
    assertSourceClosure(packages);
    const name = `dsh-${version}-${commit.slice(0, 12)}.tar.gz`;
    const archive = join(out, name);
    run("tar", ["--format=ustar", "-czf", archive, "-C", out, "packages"], {
      cwd: source,
      env: { ...process.env, COPYFILE_DISABLE: "1", LC_ALL: "C", LANG: "C" },
    });
    const manifest = {
      schemaVersion: 1,
      kind: "dsh-component",
      component: "dsh",
      repository,
      commit,
      version,
      hostMutationPolicy: "manual",
      platform: {
        os: process.platform,
        arch: process.arch,
        node: process.versions.node,
      },
      packages,
      archive: { name, sha256: digest(readFileSync(archive)) },
    };
    const bytes = JSON.stringify(manifest, null, 2) + "\n";
    writeFileSync(join(out, "component.json"), bytes, { flag: "wx" });
    writeFileSync(
      join(out, "SHA256SUMS"),
      `${manifest.archive.sha256}  ${name}\n${digest(bytes)}  component.json\n`,
      { flag: "wx" },
    );
    rmSync(packagesDir, { recursive: true });
    return manifest;
  } catch (error) {
    rmSync(out, { recursive: true, force: true });
    throw error;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({
    options: { out: { type: "string" }, repository: { type: "string" } },
  });
  assert.ok(values.out && values.repository, "需要 --out 和 --repository");
  assert.equal(
    run("git", ["status", "--porcelain", "--untracked-files=no"]),
    "",
    "源码有未提交修改",
  );
  const manifest = exportComponent({
    source: process.cwd(),
    out: values.out,
    repository: values.repository,
    commit: run("git", ["rev-parse", "HEAD"]),
  });
  console.log(
    JSON.stringify({ commit: manifest.commit, archive: manifest.archive }),
  );
}
