import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { requireRuntime, importRuntime } from "./runtime.mjs";

test(
  "目标系统可加载 flock、FFI、ripgrep 与真实 PTY",
  { timeout: 30000 },
  async () => {
    assert.ok(
      ["linux", "darwin"].includes(process.platform),
      "此检查仅支持 Linux/macOS",
    );
    const pty = requireRuntime("node-pty");
    const koffi = requireRuntime("koffi");
    const { rgPath } = requireRuntime("@vscode/ripgrep");
    const { tryLockExclusive } = await importRuntime(
      "@deepseek-ai/node-addon-system/flock",
    );
    const dir = await mkdtemp(join(tmpdir(), "dsh-native-check-"));
    try {
      const file = await open(join(dir, "lock"), "w");
      try {
        await tryLockExclusive(file.fd);
      } finally {
        await file.close();
      }
      const library =
        process.platform === "linux"
          ? "libc.so.6"
          : "/usr/lib/libSystem.B.dylib";
      assert.equal(koffi.load(library).func("int getpid(void)")(), process.pid);
      const rg = spawnSync(rgPath, ["--version"], {
        encoding: "utf8",
        timeout: 10000,
      });
      assert.equal(rg.status, 0, rg.stderr);
      await new Promise((resolve, reject) => {
        const term = pty.spawn("/bin/sh", ["-c", "printf DSH_PTY_OK"], {
          cwd: dir,
          env: process.env,
        });
        let output = "";
        const timer = setTimeout(() => {
          term.kill();
          reject(new Error("PTY timeout"));
        }, 10000);
        term.onData((data) => {
          output += data;
        });
        term.onExit(({ exitCode }) => {
          clearTimeout(timer);
          try {
            assert.equal(exitCode, 0);
            assert.match(output, /DSH_PTY_OK/);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  },
);
