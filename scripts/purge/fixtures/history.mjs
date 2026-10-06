/** 依据实际历史的版本、preset 和注入结构构造；内容、路径、ID 均为虚构。 */
export function historyFixture(
  version,
  id,
  { seeded = false, parent = "fixture-parent", unknown = false } = {},
) {
  const rows = [
    { type: "turn/start", data: { turn: 1 } },
    { type: "step/start", data: { turn: 1, step: 1 } },
    {
      type: "user/message",
      surfaceOp: "append",
      data: {
        id: "user-fixture",
        role: "user",
        source: { kind: "user" },
        content: [{ type: "text", text: "请记住合成测试标识 BLUE_17。" }],
      },
    },
    {
      type: "request/injections",
      data: {
        injections: [
          {
            key: "fixture-context",
            role: "assistant",
            text: "SYNTHETIC_LEGACY_CONTEXT",
            source: { kind: "plugin", plugin: "fixture-legacy" },
            placement: { kind: "before-latest-user" },
          },
        ],
      },
    },
    {
      type: "request/header",
      data: {
        header: {
          config: { provider: "fixture", model: "fixture" },
          ...(version < 3 ? { system: "neutral system" } : {}),
        },
        reason: "initial",
      },
    },
    { type: "request/injections", data: { injections: [] } },
    { type: "step/end", data: { turn: 1, step: 1 } },
    { type: "turn/end", data: { turn: 1, reason: { kind: "completed" } } },
    ...(seeded
      ? [{ type: "session/end-seed", data: { inherited: true } }]
      : []),
    ...(unknown ? [{ type: "unknown/required", data: {} }] : []),
  ];
  return (
    [
      {
        type: "session",
        version,
        id,
        createdAt: seeded ? 2 : 1,
        delegationDepth: seeded ? 1 : 0,
        agentPreset: "creative",
        ...(version >= 2
          ? { isSeeded: seeded }
          : seeded
            ? { seedLength: 8 }
            : {}),
        ...(seeded ? { parentSession: parent, origin: "subagent" } : {}),
      },
      ...rows.map((row, seq) => ({ ...row, seq, time: seq + 10 })),
    ]
      .map((row) => JSON.stringify(row))
      .join("\n") + "\n"
  );
}
