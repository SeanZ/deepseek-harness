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

/** 从实际启动入口计算运行闭包；源码测试工具仍交付，但不自动装入生产服务。 */
export function sourceRuntimePackages(entries, extraRoots = []) {
  assertSourceClosure(entries);
  const indexed = new Map(entries.map((entry) => [entry.name, entry]));
  const pending = [
    "@deepseek-ai/dsh",
    "@deepseek-ai/dsh-sdk-client",
    ...extraRoots,
  ];
  const selected = new Set();
  for (const name of pending) {
    assert.ok(indexed.has(name), `运行入口未打包 ${name}`);
  }
  while (pending.length) {
    const name = pending.pop();
    if (selected.has(name) || !indexed.has(name)) continue;
    selected.add(name);
    const entry = indexed.get(name);
    for (const section of runtimeSections)
      pending.push(...Object.keys(entry[section] ?? {}));
  }
  return entries.filter((entry) => selected.has(entry.name));
}
