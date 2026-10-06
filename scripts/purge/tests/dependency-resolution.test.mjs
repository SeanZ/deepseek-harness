import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  realpathSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { resolvePatchedDependency } from "../source-artifacts.mjs";

test("补丁依赖按消费者选择，忽略未引用的旧 peer 组合", () => {
  const root = mkdtempSync(join(tmpdir(), "purge-resolution-"));
  try {
    const consumer = join(root, "packages/group/consumer");
    mkdirSync(join(consumer, "node_modules"), { recursive: true });
    writeFileSync(
      join(consumer, "package.json"),
      JSON.stringify({ dependencies: { fixture: "1" } }),
    );
    let selected;
    for (const variant of ["active", "stale"]) {
      const path = join(
        root,
        `node_modules/.pnpm/fixture@1_patch_hash=${variant}/node_modules/fixture`,
      );
      mkdirSync(path, { recursive: true });
      writeFileSync(
        join(path, "package.json"),
        JSON.stringify({ name: "fixture" }),
      );
      if (variant === "active") selected = path;
    }
    symlinkSync(selected, join(consumer, "node_modules/fixture"), "dir");
    assert.equal(
      resolvePatchedDependency(root, "fixture"),
      realpathSync(selected),
    );
    assert.throws(() => resolvePatchedDependency(root, "missing"), /唯一解析/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
