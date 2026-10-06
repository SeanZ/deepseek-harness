import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { sourceRuntimePackages } from "./source-closure.mjs";

const hash = (value) => createHash("sha256").update(value).digest("hex");
const read = (path) => JSON.parse(readFileSync(path, "utf8"));

/** 验证真实安装字节与解析闭包；只读 runtime/dist，解包仅写入临时目录。 */
export function auditRuntime(runtime, dist, patches = []) {
  const manifest = read(join(dist, "manifest.json"));
  const packages =
    manifest.mode === "source"
      ? sourceRuntimePackages(manifest.packages, manifest.runtimeRoots ?? [])
      : manifest.packages;
  const entries = [...packages, ...manifest.plugins];
  const scratch = mkdtempSync(join(tmpdir(), "dsh-artifact-audit-"));
  let files = 0;
  try {
    for (const entry of entries) {
      assert.equal(
        entry.file,
        entry.file.split(/[\\/]/).at(-1),
        "制品路径越界",
      );
      const archive = join(dist, entry.file);
      assert.equal(
        hash(readFileSync(archive)),
        entry.sha256,
        `制品摘要 ${entry.name}`,
      );
      const listing = execFileSync("tar", ["-tf", archive], {
        encoding: "utf8",
        env: { ...process.env, LC_ALL: "C" },
        maxBuffer: 16 * 1024 * 1024,
      })
        .trim()
        .split("\n");
      assert.ok(
        listing.every(
          (file) =>
            file.startsWith("package/") && !file.split("/").includes(".."),
        ),
        "制品成员路径越界",
      );
      execFileSync("tar", ["-xf", archive, "-C", scratch], {
        env: { ...process.env, LC_ALL: "C" },
      });
      const installed = join(runtime, "node_modules", entry.name);
      assert.equal(
        read(join(installed, "package.json")).version,
        entry.version,
      );
      function compare(directory, relative = "") {
        for (const child of readdirSync(directory, { withFileTypes: true })) {
          const file = join(relative, child.name);
          assert.ok(!child.isSymbolicLink(), `制品不应含软链接 ${entry.name}`);
          if (child.isDirectory()) compare(join(directory, child.name), file);
          else {
            const patch = patches.find(
              (row) =>
                row.scope === "runtime" &&
                row.path === `node_modules/${entry.name}/${file}`,
            );
            const expected = hash(readFileSync(join(directory, child.name)));
            if (patch)
              assert.equal(expected, patch.before, "补丁原始字节不匹配");
            assert.equal(
              patch?.after ?? expected,
              hash(readFileSync(join(installed, file))),
              `${entry.name}/${file}`,
            );
            files++;
          }
        }
      }
      compare(join(scratch, "package"));
      rmSync(join(scratch, "package"), { recursive: true });
    }
    const require = createRequire(join(runtime, "package.json"));
    for (const name of [
      "@deepseek-ai/dsh-agent-loop",
      "@deepseek-ai/dsh-agent",
      "@deepseek-ai/dsh-session-persistence-jsonl",
    ]) {
      const caller = createRequire(
        join(runtime, "node_modules", name, "package.json"),
      );
      for (const dependency of [
        "@deepseek-ai/cordis",
        "@deepseek-ai/dsh-session",
        "@deepseek-ai/dsh-llm",
      ])
        assert.equal(
          realpathSync(caller.resolve(dependency)),
          realpathSync(require.resolve(dependency)),
          `${name} -> ${dependency}`,
        );
    }
    const installedLock = read(join(runtime, "package-lock.json"));
    if (manifest.mode === "source") {
      const localNames = new Set(manifest.packages.map((entry) => entry.name));
      for (const [path, data] of Object.entries(installedLock.packages)) {
        const name = path.split("node_modules/").at(-1);
        if (localNames.has(name))
          assert.match(data.resolved, /^file:/, `源码包回落 registry ${name}`);
      }
    }
    const version = execFileSync(
      process.execPath,
      [
        resolve(runtime, "node_modules/@deepseek-ai/dsh/lib/bin.js"),
        "--version",
      ],
      { encoding: "utf8" },
    ).trim();
    assert.equal(version, manifest.upstreamVersion);
    return {
      mode: manifest.mode ?? "overrides",
      packages: entries.length,
      files,
      version,
      platform: process.platform,
      arch: process.arch,
    };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
