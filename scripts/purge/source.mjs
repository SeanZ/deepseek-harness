import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  renameSync,
  rmSync,
  readdirSync,
  lstatSync,
} from "node:fs";
import { resolve, join } from "node:path";
import { lock, digest, run, readJson } from "./common.mjs";
import { adaptPurgeEntry, adaptPurgeCore } from "./adapter.mjs";
import { adaptAlpha2Core } from "./alpha2.mjs";

/** 固定归档经摘要与成员检查后解包，不接受浮动分支或归档中的链接。 */
export async function preparePurge(cache) {
  mkdirSync(cache, { recursive: true });
  const archive = join(cache, "purge-source.tar.gz");
  if (!existsSync(archive)) {
    const response = await fetch(lock.purge.url, {
      signal: AbortSignal.timeout(180000),
    });
    assert.ok(response.ok, `下载 purge 失败：${response.status}`);
    writeFileSync(archive, new Uint8Array(await response.arrayBuffer()), {
      flag: "wx",
    });
  }
  assert.equal(
    digest(readFileSync(archive)),
    lock.purge.sha256,
    "purge 源码归档摘要不符",
  );
  const directory = join(cache, "purge-source");
  assert.ok(!existsSync(directory), "源码输出目录已存在，请使用新的构建目录");
  const scratch = mkdtempSync(join(cache, "extract-"));
  try {
    const prefix = `dsh-purge-${lock.purge.commit}/`;
    const members = run("tar", ["-tf", archive]).split("\n");
    assert.ok(
      members.length > 10 &&
        members.every(
          (p) => p.startsWith(prefix) && !p.split("/").includes(".."),
        ),
      "purge 归档成员越界",
    );
    run("tar", ["-xf", archive, "-C", scratch]);
    const source = resolve(scratch, prefix);
    function check(dir) {
      for (const item of readdirSync(dir)) {
        const file = join(dir, item),
          stat = lstatSync(file);
        assert.ok(
          !stat.isSymbolicLink() && (stat.isFile() || stat.isDirectory()),
          "purge 归档不能含链接或设备",
        );
        if (stat.isDirectory()) check(file);
      }
    }
    check(source);
    assert.equal(
      readJson(join(source, "package.json")).version,
      lock.purge.version,
    );
    const entry = join(source, "lib/index.js");
    writeFileSync(entry, adaptPurgeEntry(readFileSync(entry, "utf8")));
    run(process.execPath, ["--check", entry]);
    const core = join(source, "lib/core.js");
    writeFileSync(
      core,
      adaptAlpha2Core(adaptPurgeCore(readFileSync(core, "utf8"))),
    );
    run(process.execPath, ["--check", core]);
    renameSync(source, directory);
    return directory;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
