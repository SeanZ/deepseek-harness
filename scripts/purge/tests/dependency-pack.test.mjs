import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { packInstalledDependency } from "../source-artifacts.mjs";

test("重打包保留各平台原生载荷和 manifest，不执行 prepare 或携带 node_modules", () => {
  const dir = mkdtempSync(join(tmpdir(), "dsh-repack-test-"));
  try {
    const source = join(dir, "source");
    mkdirSync(source);
    const manifest = {
      name: "neutral-dependency",
      version: "1.0.0",
      scripts: { prepare: "node -e 'process.exit(42)'" },
    };
    writeFileSync(join(source, "package.json"), JSON.stringify(manifest));
    for (const platform of ["linux-x64", "darwin-arm64"]) {
      mkdirSync(join(source, "prebuilds", platform), { recursive: true });
      writeFileSync(
        join(source, "prebuilds", platform, "fixture.node"),
        `neutral-${platform}`,
      );
    }
    mkdirSync(join(source, "node_modules"));
    writeFileSync(join(source, "node_modules", "excluded"), "not payload");
    if (process.platform === "darwin")
      execFileSync("xattr", [
        "-w",
        "com.example.dsh-test",
        "neutral",
        join(source, "package.json"),
      ]);
    const artifact = packInstalledDependency(source, dir);
    // 直接读取 tar 头，避免 macOS 的 tar 隐藏 AppleDouble 成员而漏检。
    const raw = gunzipSync(readFileSync(join(dir, artifact.file)));
    for (let offset = 0; offset + 512 <= raw.length; ) {
      const header = raw.subarray(offset, offset + 512);
      const name = header.subarray(0, 100).toString().split("\0")[0];
      if (!name) break;
      assert.ok(name.startsWith("package/") || name === "package");
      assert.ok(!name.split("/").some((part) => part.startsWith("._")));
      const size = parseInt(
        header.subarray(124, 136).toString().split("\0").join("").trim() || "0",
        8,
      );
      offset += 512 + Math.ceil(size / 512) * 512;
    }
    assert.ok(!raw.includes(Buffer.from("LIBARCHIVE.xattr")));
    if (process.platform === "darwin")
      assert.equal(
        execFileSync(
          "xattr",
          ["-p", "com.example.dsh-test", join(source, "package.json")],
          { encoding: "utf8" },
        ).trim(),
        "neutral",
      );
    const unpack = join(dir, "unpack");
    mkdirSync(unpack);
    execFileSync("tar", ["-xf", join(dir, artifact.file), "-C", unpack]);
    assert.deepEqual(
      JSON.parse(readFileSync(join(unpack, "package/package.json"), "utf8")),
      manifest,
    );
    for (const platform of ["linux-x64", "darwin-arm64"])
      assert.equal(
        readFileSync(
          join(unpack, "package/prebuilds", platform, "fixture.node"),
          "utf8",
        ),
        `neutral-${platform}`,
      );
    assert.equal(existsSync(join(unpack, "package/node_modules")), false);
    assert.equal(existsSync(join(source, "node_modules/excluded")), true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
