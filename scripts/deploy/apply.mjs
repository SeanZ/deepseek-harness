/** 仅在构建期应用已审查的 #40；最终宿主仍经过 Tavern 原始八摘要校验。 */
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { readJson, run, sha256, scriptRoot } from "./common.mjs";

export async function patchHostPackage(
  archive,
  purgeSource,
  out,
  ids,
  protectedFiles = readJson(join(scriptRoot, "lock.json")).hostFiles,
) {
  assert.deepEqual(
    ids,
    [40],
    "仅允许已审查的 PE #40，不能隐式应用权限、sandbox 或 rewind 补丁",
  );
  const work = mkdtempSync(join(tmpdir(), "dt-host-patch-"));
  try {
    run("tar", ["-xzf", archive, "-C", work]);
    const directory = join(work, "package");
    assert.equal(
      readJson(join(directory, "package.json")).name,
      "@deepseek-ai/dsh-system-prompt",
    );
    const pinnedNames = Object.keys(protectedFiles);
    assert.equal(pinnedNames.length, 8, "Tavern固定文件清单不完整");
    const excludesTavernPinnedFiles = pinnedNames.every(
      (name) =>
        name.split("/").slice(0, 2).join("/") !==
        "@deepseek-ai/dsh-system-prompt",
    );
    assert.ok(excludesTavernPinnedFiles, "补丁与Tavern固定文件有交集");
    const core = await import(
      pathToFileURL(join(purgeSource, "lib/core.js")).href
    );
    const patch = core.ALL_PATCHES.find((entry) => entry.id === 40);
    assert.equal(patch.name, "COMPLETE_PROMPT_KEEP_INJECT");
    const file = join(directory, "lib/index.js");
    const before = readFileSync(file, "utf8");
    const result = core.applyReplacementsToText(before, patch, file);
    assert.equal(result.changed, true, "固定官方文件上 #40 未实际命中");
    assert.equal(
      core.applyReplacementsToText(result.text, patch, file).changed,
      false,
      "#40 非幂等",
    );
    writeFileSync(file, result.text);
    run(process.execPath, ["--check", file]);
    const packed = JSON.parse(
      run(
        "npm",
        ["pack", "--json", "--ignore-scripts", "--pack-destination", out],
        { cwd: directory },
      ),
    )[0];
    const packedPath = join(out, packed.filename),
      digest = sha256(readFileSync(packedPath));
    const filename = `purge-host-${digest}.tgz`;
    renameSync(packedPath, join(out, filename));
    return {
      file: filename,
      report: {
        id: patch.id,
        name: patch.name,
        package: "@deepseek-ai/dsh-system-prompt",
        target: "lib/index.js",
        before: sha256(Buffer.from(before)),
        after: sha256(Buffer.from(result.text)),
        archiveBefore: sha256(readFileSync(archive)),
        archiveAfter: digest,
        status: "applied",
        idempotent: true,
        excludesTavernPinnedFiles,
      },
    };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
