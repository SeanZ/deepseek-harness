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
import { resolvePatchedDependency } from "./source-artifacts.mjs";

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

test("多个真实消费者仅在 peer 包载荷一致时共享制品", () => {
  const root = mkdtempSync(join(tmpdir(), "purge-peer-resolution-"));
  try {
    const variants = [];
    for (const variant of ["a", "b"]) {
      const consumer = join(root, `packages/group/${variant}`);
      const path = join(
        root,
        `node_modules/.pnpm/fixture@1_patch_hash=${variant}/node_modules/fixture`,
      );
      mkdirSync(join(consumer, "node_modules"), { recursive: true });
      mkdirSync(path, { recursive: true });
      writeFileSync(
        join(consumer, "package.json"),
        JSON.stringify({ dependencies: { fixture: "1" } }),
      );
      writeFileSync(
        join(path, "package.json"),
        JSON.stringify({ name: "fixture", version: "1" }),
      );
      writeFileSync(join(path, "index.js"), "export const value = 1;\n");
      symlinkSync(path, join(consumer, "node_modules/fixture"), "dir");
      variants.push(path);
    }
    assert.equal(
      resolvePatchedDependency(root, "fixture"),
      realpathSync(variants[0]),
    );
    writeFileSync(join(variants[1], "index.js"), "export const value = 2;\n");
    assert.throws(
      () => resolvePatchedDependency(root, "fixture"),
      /载荷不一致/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
