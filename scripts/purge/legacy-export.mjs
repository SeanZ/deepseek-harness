import assert from "node:assert/strict";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  renameSync,
  readdirSync,
  copyFileSync,
  realpathSync,
} from "node:fs";
import { join, resolve, dirname, basename } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { inside, json } from "./common.mjs";
import { inventory, validateInjection } from "./history.mjs";

async function services(runtime, directory) {
  const load = (name) =>
    import(
      pathToFileURL(
        join(runtime, "node_modules/@deepseek-ai", name, "lib/index.js"),
      )
    );
  const { Context } = await load("cordis");
  const { default: Persistence } = await load("dsh-session-persistence-jsonl");
  const api = await load("dsh-session");
  const ctx = new Context();
  await ctx.plugin(Persistence, { root: directory, compression: "zstd" });
  return { ctx, api };
}

async function read(service, id) {
  const handle = await service.ctx.sessionPersistence.open(id, "read");
  try {
    const { events, eventState } = await handle.read();
    const { header, inheritedEventCount } = handle;
    const messages = service.api.Session.fromRestore(
      id,
      events,
      header,
      inheritedEventCount,
      eventState,
    ).deriveMessages();
    return { events, header, inheritedEventCount, messages };
  } finally {
    await handle.close();
  }
}

/** 一次性调用已保留的旧运行时读取，输出只需官方运行时；不把旧实现打进新制品。 */
export async function exportLegacyHistory({
  source,
  destination,
  legacyRuntime,
  runtime,
  expectedUnreadable = 0,
}) {
  source = realpathSync(source);
  destination = resolve(destination);
  assert.ok(!existsSync(destination), "输出目录必须不存在");
  const suffix = [];
  let ancestor = destination;
  while (!existsSync(ancestor)) {
    suffix.unshift(basename(ancestor));
    ancestor = dirname(ancestor);
  }
  destination = join(realpathSync(ancestor), ...suffix);
  assert.ok(
    !inside(source, destination) &&
      !inside(destination, source) &&
      source !== destination,
    "输入输出不能重叠",
  );
  mkdirSync(dirname(destination), { recursive: true });
  const before = inventory(source);
  const scratch = mkdtempSync(join(dirname(destination), ".legacy-export-"));
  const copied = join(scratch, "copy"),
    exported = join(scratch, "exported"),
    final = join(scratch, "final");
  const report = {
    listed: 0,
    readable: 0,
    preExistingUnreadable: 0,
    convertedSessions: 0,
    convertedEvents: 0,
    sourceFiles: Object.keys(before).length,
  };
  let old, writer, verifier;
  try {
    cpSync(source, copied, { recursive: true });
    cpSync(source, final, { recursive: true });
    old = await services(resolve(legacyRuntime), copied);
    writer = await services(resolve(runtime), exported);
    const entries = await old.ctx.sessionPersistence.list();
    const directories = new Set(
      Object.keys(before)
        .filter((name) =>
          /(?:^|\/)session(?:\.v[1-9][0-9]*)?\.jsonl\.zstd$/.test(name),
        )
        .map((name) => dirname(name)),
    );
    assert.ok(
      entries.length > 0 && entries.length === directories.size,
      "旧读取器没有列出全部物理会话，不能发布不完整迁移",
    );
    report.listed = entries.length;
    const snapshots = new Map(),
      unreadable = [];
    for (const entry of entries) {
      const id = entry.id ?? entry.header?.id;
      let snapshot;
      try {
        snapshot = await read(old, id);
      } catch {
        unreadable.push(id);
        continue;
      }
      snapshots.set(id, snapshot);
      report.readable++;
      const count = snapshot.events.filter(
        (row) => row.type === "request/injections",
      ).length;
      if (!count) continue;
      const events = snapshot.events.map((row) => {
        if (row.type !== "request/injections") return row;
        validateInjection(row.data);
        return {
          ...row,
          type: "plugin:legacy-request-injections",
          ignorable: true,
        };
      });
      assert.equal(snapshot.header.version, 4, "旧读取器未导出 V4，需重新审查");
      const handle = await writer.ctx.sessionPersistence.create(
        snapshot.header,
        { inheritedEventCount: snapshot.inheritedEventCount },
      );
      try {
        await handle.append(events);
        await handle.flush();
      } finally {
        await handle.close();
      }
      report.convertedSessions++;
      report.convertedEvents += count;
    }
    report.preExistingUnreadable = unreadable.length;
    assert.equal(
      unreadable.length,
      expectedUnreadable,
      "旧运行时不可读会话数量与冻结基线不符",
    );
    // 只覆盖输出副本中的当前 V4 generation，较早 generation 与源目录全部保留。
    function overlay(directory, relative = "") {
      for (const entry of readdirSync(join(directory, relative), {
        withFileTypes: true,
      })) {
        const name = join(relative, entry.name);
        if (entry.isDirectory()) overlay(directory, name);
        else if (entry.isFile() && name.endsWith("session.v4.jsonl.zstd")) {
          mkdirSync(dirname(join(final, name)), { recursive: true });
          copyFileSync(join(directory, name), join(final, name));
        }
      }
    }
    if (existsSync(exported)) overlay(exported);
    verifier = await services(resolve(runtime), final);
    for (const [id, snapshot] of snapshots) {
      const next = await read(verifier, id);
      assert.deepEqual(next.messages, snapshot.messages, "可见历史发生变化");
      assert.equal(
        next.inheritedEventCount,
        snapshot.inheritedEventCount,
        "分叉继承位置变化",
      );
      const expected = snapshot.events.map((row) =>
        row.type === "request/injections"
          ? {
              ...row,
              type: "plugin:legacy-request-injections",
              ignorable: true,
            }
          : row,
      );
      assert.deepEqual(next.events, expected, "迁移修改了注入以外的事件");
    }
    for (const id of unreadable) await assert.rejects(() => read(verifier, id));
    await verifier.ctx.fiber.dispose();
    verifier = undefined;
    assert.deepEqual(inventory(source), before, "原始历史发生变化");
    renameSync(final, destination);
    return { ...report, originalUnchanged: true };
  } finally {
    for (const service of [old, writer, verifier])
      await service?.ctx.fiber.dispose();
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const { values } = parseArgs({
    options: {
      source: { type: "string" },
      destination: { type: "string" },
      "legacy-runtime": { type: "string" },
      runtime: { type: "string" },
      "expected-unreadable": { type: "string", default: "0" },
      receipt: { type: "string" },
    },
  });
  assert.ok(
    values.source &&
      values.destination &&
      values["legacy-runtime"] &&
      values.runtime &&
      values.receipt,
  );
  const report = await exportLegacyHistory({
    source: values.source,
    destination: values.destination,
    legacyRuntime: values["legacy-runtime"],
    runtime: values.runtime,
    expectedUnreadable: Number(values["expected-unreadable"]),
  });
  json(values.receipt, report);
  console.log(JSON.stringify(report));
}
