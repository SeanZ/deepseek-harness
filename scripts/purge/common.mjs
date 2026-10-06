import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

export const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const workspace = root;
export const lock = JSON.parse(
  readFileSync(new URL("./lock.json", import.meta.url), "utf8"),
);
export const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
export const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
export function json(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}
export function inside(parent, child) {
  const name = relative(resolve(parent), resolve(child));
  return (
    name !== "" && name !== ".." && !name.startsWith("../") && !isAbsolute(name)
  );
}
export function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.signal || result.status !== 0)
    throw new Error(
      `${command} failed (${result.signal ?? result.status})\n${result.stderr ?? ""}\n${result.stdout ?? ""}`,
    );
  return result.stdout?.trim() ?? "";
}
