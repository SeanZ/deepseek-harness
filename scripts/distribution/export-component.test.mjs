import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { exportComponent } from "./export-component.mjs";
import { digest } from "./common.mjs";

test("组件封装保留原包字节、固定身份、拒绝覆盖并清理失败输出", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "dsh-component-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const source = join(dir, "source");
  mkdirSync(source);
  writeFileSync(
    join(source, "package.json"),
    JSON.stringify({ version: "1.0.0" }),
  );
  const expected = {
    source,
    repository: "example/dsh",
    commit: "a".repeat(40),
  };
  const names = [
    "@deepseek-ai/dsh",
    "@deepseek-ai/dsh-sdk-client",
    "@deepseek-ai/cordis",
  ];
  function collect(out) {
    return names.map((name, i) => {
      const file = `fixture-${i}.tgz`,
        bytes = Buffer.from(`original-${i}`);
      writeFileSync(join(out, file), bytes);
      return {
        name,
        version: "1.0.0",
        file,
        sha256: digest(bytes),
        family: "dsh",
      };
    });
  }
  const out = join(dir, "out"),
    manifest = exportComponent({ ...expected, out, collect });
  assert.equal(manifest.commit, expected.commit);
  assert.equal(manifest.hostMutationPolicy, "manual");
  const archive = join(out, manifest.archive.name);
  assert.equal(digest(readFileSync(archive)), manifest.archive.sha256);
  assert.equal(
    execFileSync("tar", ["-xOf", archive, "packages/fixture-0.tgz"], {
      encoding: "utf8",
    }),
    "original-0",
  );
  assert.throws(
    () => exportComponent({ ...expected, out, collect }),
    /必须不存在/,
  );
  const failed = join(dir, "failed");
  assert.throws(
    () => exportComponent({ ...expected, out: failed, collect: () => [] }),
    /缺少源码入口/,
  );
  assert.equal(existsSync(failed), false);
});
