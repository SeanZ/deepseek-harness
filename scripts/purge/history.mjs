import assert from "node:assert/strict";
import {
  readdirSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  realpathSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { constants, zstdCompressSync, zstdDecompressSync } from "node:zlib";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { digest, inside, json } from "./common.mjs";

/** Node 的单次同步解压只消费首帧，DSH 日志由多个可独立校验的帧连接而成。 */
export function decompressHistory(bytes) {
  const chunks = [];
  for (let offset = 0; offset < bytes.length; ) {
    const result = zstdDecompressSync(bytes.subarray(offset), { info: true });
    assert.ok(result.engine.bytesWritten > 0, "历史压缩帧没有前进");
    offset += result.engine.bytesWritten;
    chunks.push(result.buffer);
  }
  return Buffer.concat(chunks);
}

/** 仅接受已知旧注入声明；不把损坏载荷降为不可见审计数据。 */
export function validateInjection(data) {
  assert.ok(
    data && typeof data === "object" && Array.isArray(data.injections),
    "旧注入载荷不是快照",
  );
  const keys = new Set();
  for (const item of data.injections) {
    assert.ok(
      item &&
        typeof item.key === "string" &&
        item.key.length > 0 &&
        !keys.has(item.key),
      "旧注入 key 无效或重复",
    );
    keys.add(item.key);
    assert.equal(item.role, "assistant");
    assert.ok(typeof item.text === "string" && item.text.length > 0);
    assert.ok(
      item.source?.kind === "plugin" &&
        typeof item.source.plugin === "string" &&
        item.source.plugin.length > 0,
    );
    assert.ok(
      item.placement?.kind === "before-latest-user" ||
        (item.placement?.kind === "depth" &&
          Number.isSafeInteger(item.placement.depth) &&
          item.placement.depth >= 0 &&
          !Object.is(item.placement.depth, -0)),
      "旧注入位置不受支持",
    );
  }
}

/** 保留物理 header、事件坐标和 payload；旧格式由官方迁移器添加 plugin 命名空间。 */
export function migrateJsonl(text) {
  const lines = text.split("\n");
  assert.equal(lines.at(-1), "", "历史存在未完成行，先用旧运行时恢复");
  const header = JSON.parse(lines[0]);
  assert.ok(
    header.type === "session" &&
      Number.isInteger(header.version) &&
      header.version >= 0 &&
      header.version <= 4,
    "未知历史 header",
  );
  let changed = 0;
  const output = lines
    .map((line, index) => {
      if (index === 0 || line === "") return line;
      const row = JSON.parse(line);
      if (row.type !== "request/injections") return line;
      assert.ok(
        header.version >= 3,
        "V0/V1/V2 注入日志必须先用 legacy-export.mjs 导出，不能直接标为可忽略",
      );
      validateInjection(row.data);
      assert.ok(
        Number.isSafeInteger(row.seq) &&
          row.seq >= 0 &&
          Number.isSafeInteger(row.time),
        "旧注入事件坐标无效",
      );
      changed++;
      return JSON.stringify({
        ...row,
        type:
          header.version >= 4
            ? "plugin:legacy-request-injections"
            : "legacy-request-injections",
        ignorable: true,
      });
    })
    .join("\n");
  return { text: output, changed };
}

export function inventory(directory, relative = "", result = {}) {
  for (const entry of readdirSync(join(directory, relative), {
    withFileTypes: true,
  })) {
    const name = join(relative, entry.name);
    assert.ok(!entry.isSymbolicLink(), "历史目录不能含软链接");
    if (entry.isDirectory()) inventory(directory, name, result);
    else {
      assert.ok(entry.isFile(), "历史目录不能含设备文件");
      result[name] = digest(readFileSync(join(directory, name)));
    }
  }
  return result;
}

/** 原始目录只读；源哈希稳定且全批成功后才发布新的输出目录。 */
export function migrateHistory(source, destination) {
  source = realpathSync(source);
  destination = resolve(destination);
  assert.ok(!existsSync(destination), "迁移输出必须是新目录");
  const suffix = [];
  let ancestor = destination;
  while (!existsSync(ancestor)) {
    suffix.unshift(basename(ancestor));
    ancestor = dirname(ancestor);
  }
  destination = join(realpathSync(ancestor), ...suffix);
  assert.ok(
    source !== destination &&
      !inside(source, destination) &&
      !inside(destination, source),
    "输入输出目录不能重叠",
  );
  mkdirSync(dirname(destination), { recursive: true });
  const before = inventory(source),
    receipt = [];
  const stage = mkdtempSync(join(dirname(destination), ".history-migration-"));
  try {
    for (const [name, hash] of Object.entries(before)) {
      const bytes = readFileSync(join(source, name));
      assert.equal(digest(bytes), hash, "迁移期间源历史改变");
      let output = bytes,
        events = 0;
      if (/\.jsonl(?:\.zstd)?$/.test(name)) {
        const compressed = name.endsWith(".zstd");
        const text = new TextDecoder("utf-8", { fatal: true }).decode(
          compressed ? decompressHistory(bytes) : bytes,
        );
        const migrated = migrateJsonl(text);
        events = migrated.changed;
        if (events) {
          if (compressed) {
            const split = migrated.text.indexOf("\n") + 1;
            const options = { params: { [constants.ZSTD_c_checksumFlag]: 1 } };
            output = Buffer.concat([
              zstdCompressSync(migrated.text.slice(0, split), options),
              zstdCompressSync(migrated.text.slice(split), options),
            ]);
          } else output = Buffer.from(migrated.text);
        }
      }
      const path = join(stage, name);
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, output, { flag: "wx", mode: 0o600 });
      receipt.push({ path: name, before: hash, after: digest(output), events });
    }
    assert.deepEqual(inventory(source), before, "迁移期间源目录改变");
    renameSync(stage, destination);
    return {
      files: receipt,
      changedFiles: receipt.filter((row) => row.events > 0).length,
      changedEvents: receipt.reduce((n, row) => n + row.events, 0),
      originalUnchanged: true,
    };
  } finally {
    rmSync(stage, { recursive: true, force: true });
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
      receipt: { type: "string" },
    },
  });
  assert.ok(
    values.source && values.destination && values.receipt,
    "需要 --source、--destination、--receipt",
  );
  const report = migrateHistory(values.source, values.destination);
  json(values.receipt, report);
  console.log(
    JSON.stringify({
      files: report.files.length,
      changedFiles: report.changedFiles,
      changedEvents: report.changedEvents,
      originalUnchanged: report.originalUnchanged,
    }),
  );
}
