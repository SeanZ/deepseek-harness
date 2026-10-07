import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { card, markers } from "./fixtures.mjs";
import { apply as registerNativeEvidence } from "./native-evidence.mjs";
import {
  summarizeRequest,
  successfulTools,
  successfulToolCalls,
  stableChat,
  inspectChat,
} from "./evidence.mjs";

test("原生证据路由只允许隔离 home、回环来源和有效会话标识", async () => {
  const previous = {
    home: process.env.DSH_HOME,
    acceptance: process.env.TAVERN_ACCEPTANCE_HOME,
  };
  let route;
  const reads = [];
  const ctx = {
    connection: {
      fetch: {
        register(value) {
          route = value;
        },
      },
    },
    sessionQuery: {
      async readSession(id) {
        reads.push(id);
        return { events: [] };
      },
    },
  };
  try {
    process.env.DSH_HOME = "/synthetic-home";
    process.env.TAVERN_ACCEPTANCE_HOME = "/other-home";
    assert.throws(() => registerNativeEvidence(ctx));
    process.env.TAVERN_ACCEPTANCE_HOME = "/synthetic-home";
    registerNativeEvidence(ctx);
    const invoke = (origin, sessionId) =>
      route.fetch(
        new Request("http://dsh.internal/api/tavern-acceptance/native", {
          method: "POST",
          headers: { origin, "content-type": "application/json" },
          body: JSON.stringify({ sessionId }),
        }),
      );
    const id = "session-11111111-1111-1111-1111-111111111111";
    assert.equal((await invoke("https://example.com", id)).status, 403);
    assert.equal(
      (await invoke("http://127.0.0.1:12345", "../private")).status,
      400,
    );
    assert.deepEqual(reads, []);
    assert.equal((await invoke("http://127.0.0.1:12345", id)).status, 200);
    assert.deepEqual(reads, [id]);
  } finally {
    for (const [key, value] of [
      ["DSH_HOME", previous.home],
      ["TAVERN_ACCEPTANCE_HOME", previous.acceptance],
    ]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("请求摘要保留来源证据，不泄露配置、正文和密钥", () => {
  const request = {
    system: "synthetic secret text",
    apiKey: "secret-value",
    messages: [
      {
        role: "system",
        content: markers.card + markers.worldbook,
        source: { sections: [{ name: "tavern:card" }] },
      },
    ],
    tools: [{ name: "mvu_submit_update" }],
  };
  const result = summarizeRequest(request);
  assert.equal(result.markers.card, 1);
  assert.equal(result.markers.worldbook, 1);
  assert.deepEqual(result.sources, ["tavern:card"]);
  assert.ok(!JSON.stringify(result).includes("secret"));
  assert.ok(!JSON.stringify(result).includes(markers.card));
});

test("重复 system 与指定注入重复会形成可拒绝证据", () => {
  const paragraph = "x".repeat(110);
  const result = summarizeRequest(
    {
      system: `${paragraph}\n\n${paragraph}`,
      messages: [{ content: "INJECT INJECT" }],
    },
    "INJECT",
  );
  assert.equal(result.repeatedSystemParagraphs, 1);
  assert.equal(result.injectionOccurrences, 2);
});

test("只有匹配 callId 的成功工具结果才算实际调用", () => {
  const call = {
    type: "tool/call",
    data: { callId: "a", name: "mvu_submit_update" },
  };
  const result = (id, isError) => ({
    type: "tool/result",
    data: {
      message: {
        source: { kind: "tool", callId: id },
        content: [
          {
            type: "tool-result",
            toolCallId: id,
            isError,
            content: [{ type: "text", text: "ok" }],
          },
        ],
      },
    },
  });
  assert.deepEqual(successfulTools([call]), []);
  assert.deepEqual(successfulTools([call, result("a", true)]), []);
  assert.deepEqual(successfulTools([call, result("b", false)]), []);
  assert.deepEqual(successfulTools([call, result("a", false)]), [
    "mvu_submit_update",
  ]);
  assert.deepEqual(successfulToolCalls([call, result("a", false)]), [
    call.data,
  ]);
  const inconsistent = result("a", false);
  inconsistent.data.message.source.callId = "b";
  assert.deepEqual(successfulTools([call, inconsistent]), []);
});

test("真实 JSON 夹具往返及状态断言拒绝重复轮次、错误变量与未结算结果", async () => {
  const root = await mkdtemp(join(tmpdir(), "tavern-fixture-"));
  try {
    await writeFile(join(root, "card.json"), JSON.stringify(card));
    const restored = JSON.parse(
      await readFile(join(root, "card.json"), "utf8"),
    );
    assert.equal(restored.spec, "chara_card_v2");
    assert.ok(
      restored.data.character_book.entries.some((entry) =>
        entry.comment.startsWith("[initvar]"),
      ),
    );
    const chat = {
      id: "synthetic",
      posture: "站在观星台旁。",
      messages: [
        { role: "assistant", greeting: true, text: restored.data.first_mes },
        { role: "user", text: "领取徽章" },
        {
          role: "assistant",
          text: "已有一枚徽章",
          variables: [{ stat_data: { badges: 1 } }],
          mvu: { receipt: { status: "updated" } },
        },
      ],
    };
    await writeFile(join(root, "chat.json"), JSON.stringify(chat));
    const disk = JSON.parse(await readFile(join(root, "chat.json"), "utf8"));
    assert.deepEqual(inspectChat(disk, 1, 1, "徽章"), {
      rounds: 1,
      badges: 1,
      mvu: "updated",
      posture: true,
    });
    assert.deepEqual(stableChat(disk), stableChat(chat));
    disk.posture = "观测台旁，管理员站着。";
    assert.equal(inspectChat(disk, 1, 1, "徽章").posture, true);
    disk.posture = " ";
    assert.throws(() => inspectChat(disk, 1, 1, "徽章"));
    disk.posture = chat.posture;
    assert.throws(() => inspectChat(disk, 2, 1, "徽章"));
    assert.throws(() => inspectChat(disk, 1, 2, "徽章"));
    disk.messages.at(-1).mvu.receipt.status = "pending";
    assert.throws(() => inspectChat(disk, 1, 1, "徽章"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("来源元数据不重复计数，插件消息与空白通过摘要逐字比较", () => {
  const content = [
    { type: "text", text: markers.whitespace + "\n" + markers.card },
  ];
  const source = {
    kind: "plugin",
    plugin: "dsh-tavern",
    form: "card-memory",
    sections: [{ name: "tavern:card", text: markers.card }],
  };
  const input = {
    sessionId: "synthetic-session",
    messages: [{ role: "user", content, source }],
  };
  const exact = summarizeRequest(input, markers.card);
  assert.equal(exact.injectionOccurrences, 1);
  assert.equal(exact.markers.whitespace, 1);
  assert.equal(exact.sectionDigests[0].preserved, true);
  assert.equal(exact.pluginMessages[0].form, "card-memory");
  const trimmed = structuredClone(input);
  trimmed.messages[0].content[0].text =
    trimmed.messages[0].content[0].text.replace(/  /g, " ");
  const changed = summarizeRequest(trimmed, markers.card);
  assert.equal(changed.markers.whitespace, 0);
  assert.notEqual(
    changed.pluginMessages[0].contentSha256,
    exact.pluginMessages[0].contentSha256,
  );
});
