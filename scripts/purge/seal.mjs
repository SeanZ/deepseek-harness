import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { tmpdir } from "node:os";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { auditRuntime } from "./runtime-audit.mjs";
import { packInstalledDependency } from "./source-artifacts.mjs";
import { readJson, json, run, digest, inside } from "./common.mjs";

/** 从原始跨平台载荷覆盖经过核验的文件，服务器仅安装封存后的相同制品。 */
export function sealArtifacts(dist, runtime, out) {
  assert.ok(!existsSync(out), "禁止覆盖已有制品");
  const receipt = readJson(join(runtime, "purge-audit.json"));
  assert.ok(receipt.files.length > 0, "没有补丁输出");
  assert.ok(
    receipt.files.every((row) => row.scope === "runtime"),
    "不允许依赖构建 home 的修改",
  );
  auditRuntime(runtime, dist, receipt.files);
  const manifest = readJson(join(dist, "manifest.json"));
  const entries = [...manifest.packages, ...manifest.plugins];
  const groups = new Map();
  for (const row of receipt.files) {
    const entry = entries.find((item) =>
      row.path.startsWith(`node_modules/${item.name}/`),
    );
    assert.ok(entry, "补丁文件不属于发布包");
    const list = groups.get(entry.name) ?? [];
    list.push(row);
    groups.set(entry.name, list);
  }
  mkdirSync(out, { recursive: true });
  const scratch = mkdtempSync(join(tmpdir(), "dsh-purge-seal-"));
  try {
    for (const entry of entries) {
      const rows = groups.get(entry.name);
      if (!rows) {
        copyFileSync(join(dist, entry.file), join(out, entry.file));
        continue;
      }
      run("tar", ["-xf", join(dist, entry.file), "-C", scratch]);
      for (const row of rows) {
        const name = relative(`node_modules/${entry.name}`, row.path);
        const target = join(scratch, "package", name);
        assert.ok(inside(join(scratch, "package"), target), "补丁路径越界");
        const source = join(runtime, row.path);
        assert.equal(digest(readFileSync(source)), row.after);
        mkdirSync(dirname(target), { recursive: true });
        copyFileSync(source, target);
      }
      const packed = packInstalledDependency(join(scratch, "package"), out);
      Object.assign(entry, { unpatchedSha256: entry.sha256, ...packed });
      rmSync(join(scratch, "package"), { recursive: true });
    }
    manifest.sealed = true;
    manifest.patchReceipt = receipt;
    json(join(out, "manifest.json"), manifest);
    return auditRuntime(runtime, out);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
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
      out: { type: "string" },
    },
  });
  assert.ok(
    values.dist && values.runtime && values.out,
    "需要 --dist、--runtime、--out",
  );
  console.log(
    JSON.stringify(
      sealArtifacts(
        resolve(values.dist),
        resolve(values.runtime),
        resolve(values.out),
      ),
    ),
  );
}
