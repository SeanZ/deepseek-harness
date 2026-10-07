import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { root } from "../common.mjs";

const runtime = resolve(
  process.env.DSH_TEST_RUNTIME ?? join(root, ".artifacts/purge/runtime"),
);
const load = (name) =>
  import(pathToFileURL(join(runtime, "node_modules", name, "lib/index.js")));
const { Session } = await load("@deepseek-ai/dsh-session");
const { createAssistantMessage, createSystemMessage, createUserMessage } =
  await load("@deepseek-ai/dsh-llm");
const { Context } = await load("@deepseek-ai/cordis");
const { default: Persistence } = await load(
  "@deepseek-ai/dsh-session-persistence-jsonl",
);
const { planRewind, applyRewind, wrapSessionDeriveMessages } = await import(
  pathToFileURL(join(runtime, "node_modules/dsh-purge/lib/rewind.js"))
);

function appendTurn(session, turn, text, source = { kind: "user" }) {
  const start = session.append("turn/start", { turn });
  session.append("step/start", { turn, step: 1 });
  if (turn === 1)
    session.append(
      "system/message",
      { turn, step: 1, message: createSystemMessage("NEUTRAL_SYSTEM") },
      { surfaceOp: "append" },
    );
  session.append(
    "user/message",
    createUserMessage({ content: [{ type: "text", text }], source }),
    { surfaceOp: "append" },
  );
  session.append(
    "assistant/message",
    {
      turn,
      step: 1,
      stream: [],
      message: createAssistantMessage({
        source: { provider: "fixture", model: "fixture" },
        content: [{ type: "text", text: `NEUTRAL_REPLY_${turn}` }],
      }),
    },
    { surfaceOp: "append" },
  );
  session.append("step/end", { turn, step: 1 });
  session.append("turn/end", { turn, reason: { kind: "completed" } });
  return start.seq;
}

test("回退定位最近完成的用户轮次或 goal 轮次，跳过插件内容", () => {
  for (const source of [
    { kind: "user" },
    { kind: "goal", round: 0 },
    { kind: "goal", round: 2 },
  ]) {
    const session = Session.create("neutral-rewind-plan");
    appendTurn(session, 1, "NEUTRAL_FIRST");
    const fromSeq = appendTurn(session, 2, "NEUTRAL_SECOND", source);
    session.append(
      "user/message",
      createUserMessage({
        content: [{ type: "text", text: "NEUTRAL_PLUGIN" }],
        source: { kind: "plugin", plugin: "fixture" },
      }),
      { surfaceOp: "append" },
    );
    assert.deepEqual(planRewind(session.snapshotEvents()), {
      ok: true,
      mode: "input",
      text: "NEUTRAL_SECOND",
      fromSeq,
    });
  }
  assert.equal(planRewind([]).ok, false);
});

test("回退在同一真实 Session 保留前轮和系统消息，压缩持久化重开后不复活被回退内容", async () => {
  const directory = mkdtempSync(join(tmpdir(), "purge-rewind-integration-"));
  const ctx = new Context();
  try {
    await ctx.plugin(Persistence, { root: directory, compression: "zstd" });
    const session = Session.create("neutral-rewind-storage");
    appendTurn(session, 1, "NEUTRAL_FIRST");
    appendTurn(session, 2, "NEUTRAL_SECOND");
    const before = session.snapshotEvents();
    const services = {
      sessions: { get: (id) => (id === session.id ? session : undefined) },
      sessionController: {},
    };
    const result = await applyRewind(
      { get: (name) => services[name] },
      session.id,
      "once",
    );
    assert.equal(result.ok, true, result.error);
    assert.equal(result.sessionId, session.id);
    assert.equal(result.text, "NEUTRAL_SECOND");
    const messages = session.deriveMessages();
    const text = JSON.stringify(messages);
    for (const marker of ["NEUTRAL_SYSTEM", "NEUTRAL_FIRST", "NEUTRAL_REPLY_1"])
      assert.ok(text.includes(marker));
    for (const marker of ["NEUTRAL_SECOND", "NEUTRAL_REPLY_2", "rewind-"])
      assert.ok(!text.includes(marker));
    assert.deepEqual(session.snapshotEvents().slice(0, before.length), before);

    const handle = await ctx.sessionPersistence.create(session.header);
    try {
      await handle.append(session.snapshotEvents());
      await handle.flush();
    } finally {
      await handle.close();
    }
    const reopened = await ctx.sessionPersistence.open(session.id, "read");
    try {
      const restored = await reopened.read();
      const replay = wrapSessionDeriveMessages(
        Session.fromRestore(
          session.id,
          restored.events,
          reopened.header,
          reopened.inheritedEventCount,
          restored.eventState,
        ),
      );
      assert.deepEqual(replay.deriveMessages(), messages);
      appendTurn(replay, 3, "NEUTRAL_RESEND");
      assert.equal(planRewind(replay.snapshotEvents()).text, "NEUTRAL_RESEND");
    } finally {
      await reopened.close();
    }
  } finally {
    await ctx.fiber.dispose();
    rmSync(directory, { recursive: true, force: true });
  }
});
