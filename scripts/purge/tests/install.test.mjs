import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installationManifest } from "../install.mjs";
import { json, digest } from "../common.mjs";
test("安装仅使用清单中的本地闭包，摘要和路径失败时拒绝安装", () => {
  const dir = mkdtempSync(join(tmpdir(), "purge-install-test-"));
  try {
    const packages = [
      "@deepseek-ai/dsh",
      "@deepseek-ai/dsh-sdk-client",
      "@deepseek-ai/cordis",
    ].map((name, index) => ({
      name,
      version: "0.0.0",
      file: `fixture-${index}.tgz`,
      sha256: digest(name),
    }));
    packages[0].dependencies = { "@deepseek-ai/cordis": "0.0.0" };
    packages.forEach((row) => writeFileSync(join(dir, row.file), row.name));
    const manifest = { packages, plugins: [] };
    json(join(dir, "manifest.json"), manifest);
    const valid = installationManifest(dir);
    assert.equal(Object.keys(valid.dependencies).length, 3);
    assert.ok(
      Object.values(valid.dependencies).every((value) =>
        value.startsWith("file:"),
      ),
    );
    assert.deepEqual(valid.dependencies, valid.overrides);
    writeFileSync(join(dir, packages[0].file), "changed");
    assert.throws(() => installationManifest(dir), /损坏/);
    packages[0].file = "../outside.tgz";
    json(join(dir, "manifest.json"), manifest);
    assert.throws(() => installationManifest(dir), /越界/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
