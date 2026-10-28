import assert from "node:assert/strict";

export const runtimeSections = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
];

/** 原生组件有独立发布序列；DSH 和 vendor 不允许静默回落到 registry。 */
export function assertSourceClosure(entries) {
  const names = new Set(entries.map((entry) => entry.name));
  assert.equal(names.size, entries.length, "重复的源码制品");
  for (const required of [
    "@deepseek-ai/dsh",
    "@deepseek-ai/dsh-sdk-client",
    "@deepseek-ai/cordis",
  ])
    assert.ok(names.has(required), `缺少源码入口 ${required}`);
  for (const entry of entries) {
    for (const section of runtimeSections) {
      for (const [name, version] of Object.entries(entry[section] ?? {})) {
        assert.ok(
          !/^(workspace:|link:)/.test(version),
          `未转换的 workspace 依赖 ${entry.name} -> ${name}`,
        );
        if (
          /^@deepseek-ai\/(?:dsh(?:-|$)|cordis(?:-|$)|cosmokit$|schemastery$)/.test(
            name,
          )
        )
          assert.ok(
            names.has(name),
            `源码依赖闭包缺失 ${entry.name} -> ${name}`,
          );
      }
    }
  }
}
