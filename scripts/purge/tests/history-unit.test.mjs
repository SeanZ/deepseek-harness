import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  rmSync,
  symlinkSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { zstdCompressSync } from "node:zlib";
import {
  migrateJsonl,
  migrateHistory,
  validateInjection,
  decompressHistory,
} from "../history.mjs";
import { historyFixture } from "../fixtures/history.mjs";

test("旧注入保留内容和事件坐标，其余行逐字不变且重复运行稳定", () => {
  for (const version of [3, 4]) {
    const source = historyFixture(version, `fixture-${version}`);
    const result = migrateJsonl(source);
    assert.equal(result.changed, 2);
    const before = source.trim().split("\n").map(JSON.parse);
    const after = result.text.trim().split("\n").map(JSON.parse);
    assert.equal(after.length, before.length);
    for (const [index, row] of before.entries()) {
      if (row.type !== "request/injections")
        assert.deepEqual(after[index], row);
      else
        assert.deepEqual(after[index], {
          ...row,
          type:
            version < 4
              ? "legacy-request-injections"
              : "plugin:legacy-request-injections",
          ignorable: true,
        });
    }
    assert.deepEqual(migrateJsonl(result.text), {
      text: result.text,
      changed: 0,
    });
  }
});

test("损坏载荷、尾部截断和未来版本不能被迁移隐藏", () => {
  for (const version of [0, 1, 2])
    assert.throws(
      () => migrateJsonl(historyFixture(version, "fixture")),
      /legacy-export/,
    );
  assert.throws(() =>
    validateInjection({ injections: [{ key: "x", role: "user" }] }),
  );
  assert.throws(
    () => migrateJsonl(historyFixture(4, "fixture").trim()),
    /未完成行/,
  );
  assert.throws(() => migrateJsonl(historyFixture(5, "fixture")), /未知历史/);
  const input = historyFixture(4, "fixture", { unknown: true });
  assert.match(migrateJsonl(input).text, /unknown\/required/);
});

test("真实压缩目录迁移保留原件，拒绝覆盖、路径重叠和链接", () => {
  const base = mkdtempSync(join(tmpdir(), "purge-history-unit-"));
  try {
    const source = join(base, "source"),
      destination = join(base, "output");
    mkdirSync(source);
    const file = join(source, "session.v4.jsonl.zstd");
    const text = historyFixture(4, "fixture");
    const cut = text.indexOf("\n") + 1;
    const original = Buffer.concat([
      zstdCompressSync(text.slice(0, cut)),
      zstdCompressSync(text.slice(cut)),
    ]);
    writeFileSync(file, original);
    writeFileSync(join(source, "metadata.txt"), "fixture-only");
    const result = migrateHistory(source, destination);
    assert.equal(result.changedEvents, 2);
    assert.equal(result.changedFiles, 1);
    assert.deepEqual(readFileSync(file), original);
    assert.match(
      decompressHistory(
        readFileSync(join(destination, "session.v4.jsonl.zstd")),
      ).toString(),
      /plugin:legacy-request-injections/,
    );
    assert.equal(
      readFileSync(join(destination, "metadata.txt"), "utf8"),
      "fixture-only",
    );
    assert.throws(() => migrateHistory(source, destination), /新目录/);
    assert.throws(() => migrateHistory(source, join(source, "nested")), /重叠/);
    symlinkSync(file, join(source, "link"));
    assert.throws(() => migrateHistory(source, join(base, "bad")), /软链接/);
    assert.ok(!existsSync(join(base, "bad")));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
