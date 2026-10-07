import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { root } from "../common.mjs";

test("封存的真实客户端收到回退标记时立即重建窗口，重复事件不再次更新", () => {
  const runtime = resolve(
    process.env.DSH_TEST_RUNTIME ?? join(root, ".artifacts/purge/runtime"),
  );
  const source = readFileSync(
    join(
      runtime,
      "node_modules/@deepseek-ai/dsh-client-ui-conversation/lib/client.js",
    ),
    "utf8",
  );
  // 执行产物中的纯增量方法；浏览器展示另由真实页面验收。
  const markerStart = source.indexOf("function isRewindMarker(event) {");
  const markerEnd = source.indexOf(
    "function rewindVisibleEntries(entries) {",
    markerStart,
  );
  const appendStart = source.indexOf("append(record) {", markerEnd);
  const appendEnd = source.indexOf("\n\t\t\t/**", appendStart);
  assert.ok(markerStart >= 0 && markerEnd > markerStart);
  assert.ok(appendStart > markerEnd && appendEnd > appendStart);
  const append = new Function(
    `${source.slice(markerStart, markerEnd)}\nreturn ({${source.slice(appendStart, appendEnd)}}).append;`,
  )();
  const first = {
    event: { type: "user/message", seq: 1, data: { id: "user-first" } },
  };
  const cut = {
    event: { type: "user/message", seq: 2, data: { id: "user-cut" } },
  };
  const marker = {
    event: {
      type: "user/message",
      seq: 3,
      data: { id: "rewind-fixture" },
      surfaceOp: { op: "replace", startSeq: 2, endSeq: 2 },
    },
  };
  let rebuilds = 0;
  const owner = {
    inputs: new Map([
      [1, first],
      [2, cut],
    ]),
    hasMore: true,
    replaceWindow(entries, hasMore) {
      rebuilds++;
      assert.deepEqual(entries, [first, cut, marker]);
      assert.equal(hasMore, true);
      return "immediate";
    },
  };
  assert.equal(append.call(owner, marker), "immediate");
  assert.equal(rebuilds, 1);
  owner.inputs.set(3, marker);
  assert.equal(append.call(owner, marker), "none");
  assert.equal(rebuilds, 1);
});
