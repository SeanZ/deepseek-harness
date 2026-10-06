import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { zstdCompressSync } from "node:zlib";
import { root } from "../common.mjs";
import { migrateHistory } from "../history.mjs";
import { historyFixture } from "../fixtures/history.mjs";

const runtime = resolve(
  process.env.DSH_TEST_RUNTIME ?? join(root, ".artifacts/purge/runtime"),
);
const load = (name) =>
  import(
    pathToFileURL(
      join(runtime, "node_modules/@deepseek-ai", name, "lib/index.js"),
    )
  );
const { Context } = await load("cordis");
const { default: Persistence } = await load("dsh-session-persistence-jsonl");
const { Session } = await load("dsh-session");

for (const version of [3, 4]) {
  test(`v${version} 脱敏注入日志经官方读取、追加和重开，原件不变`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "purge-history-integration-"));
    const source = join(dir, "original"),
      output = join(dir, "migrated");
    const id = `fixture-v${version}`;
    mkdirSync(join(source, "_no-cwd", id), { recursive: true });
    const file = join(
      source,
      "_no-cwd",
      id,
      version === 0 ? "session.jsonl.zstd" : `session.v${version}.jsonl.zstd`,
    );
    const text = historyFixture(version, id),
      cut = text.indexOf("\n") + 1;
    const bytes = Buffer.concat([
      zstdCompressSync(text.slice(0, cut)),
      zstdCompressSync(text.slice(cut)),
    ]);
    writeFileSync(file, bytes);
    const oldCtx = new Context(),
      ctx = new Context();
    try {
      await oldCtx.plugin(Persistence, { root: source, compression: "zstd" });
      await assert.rejects(async () => {
        const handle = await oldCtx.sessionPersistence.open(id, "read");
        try {
          await handle.read();
        } finally {
          await handle.close();
        }
      }, /unknown event type|unsupported/i);
      const receipt = migrateHistory(source, output);
      assert.equal(receipt.changedEvents, 2);
      await ctx.plugin(Persistence, { root: output, compression: "zstd" });
      const handle = await ctx.sessionPersistence.open(id, "write");
      let before, messages;
      try {
        const restored = await handle.read();
        before = restored.events;
        messages = Session.fromRestore(
          id,
          before,
          handle.header,
          handle.inheritedEventCount,
          restored.eventState,
        ).deriveMessages();
        assert.equal(
          before.filter(
            (row) => row.type === "plugin:legacy-request-injections",
          ).length,
          2,
        );
        assert.ok(
          !JSON.stringify(messages).includes("SYNTHETIC_LEGACY_CONTEXT"),
        );
        assert.ok(JSON.stringify(messages).includes("BLUE_17"));
        await handle.append([
          {
            type: "turn/start",
            seq: before.length,
            time: 100,
            data: { turn: 2 },
          },
          {
            type: "turn/end",
            seq: before.length + 1,
            time: 101,
            data: { turn: 2, reason: { kind: "completed" } },
          },
        ]);
        await handle.flush();
      } finally {
        await handle.close();
      }
      const reopened = await ctx.sessionPersistence.open(id, "read");
      try {
        const read = await reopened.read();
        assert.deepEqual(read.events.slice(0, before.length), before);
        assert.equal(read.events.length, before.length + 2);
        assert.deepEqual(
          Session.fromRestore(
            id,
            read.events,
            reopened.header,
            reopened.inheritedEventCount,
            read.eventState,
          ).deriveMessages(),
          messages,
        );
      } finally {
        await reopened.close();
      }
      assert.deepEqual(readFileSync(file), bytes);
    } finally {
      await oldCtx.fiber.dispose();
      await ctx.fiber.dispose();
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
