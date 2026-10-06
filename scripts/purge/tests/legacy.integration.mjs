import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { zstdCompressSync } from "node:zlib";
import { exportLegacyHistory } from "../legacy-export.mjs";
import { historyFixture } from "../fixtures/history.mjs";

function compress(text) {
  const split = text.indexOf("\n") + 1;
  return Buffer.concat([
    zstdCompressSync(text.slice(0, split)),
    zstdCompressSync(text.slice(split)),
  ]);
}

assert.ok(
  process.env.DSH_LEGACY_RUNTIME && process.env.DSH_TEST_RUNTIME,
  "一次性旧数据验收需显式提供旧、新运行时",
);
test("一次性导出 V0–V4 注入日志与分叉会话，保留原始压缩文件", async () => {
  const directory = mkdtempSync(join(tmpdir(), "purge-legacy-test-"));
  const source = join(directory, "source"),
    destination = join(directory, "output");
  const originals = new Map();
  try {
    for (const version of [0, 1, 2, 3, 4]) {
      const id = `fixture-v${version}`;
      const file = join(
        source,
        "_no-cwd",
        id,
        version === 0 ? "session.jsonl.zstd" : `session.v${version}.jsonl.zstd`,
      );
      mkdirSync(join(source, "_no-cwd", id), { recursive: true });
      const bytes = compress(historyFixture(version, id));
      writeFileSync(file, bytes);
      originals.set(file, bytes);
    }
    const child = join(source, "_no-cwd/fixture-child/session.v4.jsonl.zstd");
    mkdirSync(join(source, "_no-cwd/fixture-child"));
    const childBytes = compress(
      historyFixture(4, "fixture-child", {
        seeded: true,
        parent: "fixture-v4",
      }),
    );
    writeFileSync(child, childBytes);
    originals.set(child, childBytes);
    const report = await exportLegacyHistory({
      source,
      destination,
      legacyRuntime: resolve(process.env.DSH_LEGACY_RUNTIME),
      runtime: resolve(process.env.DSH_TEST_RUNTIME),
    });
    assert.equal(report.readable, 6);
    assert.equal(report.convertedSessions, 6);
    assert.equal(report.convertedEvents, 12);
    assert.equal(report.preExistingUnreadable, 0);
    for (const [file, bytes] of originals)
      assert.deepEqual(readFileSync(file), bytes);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
