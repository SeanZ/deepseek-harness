import { readdirSync } from "node:fs";
import { join } from "node:path";
import { root, run } from "./common.mjs";
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (file.endsWith(".mjs")) run(process.execPath, ["--check", file]);
  }
}
walk(join(root, "scripts/purge"));
run(
  "pnpm",
  ["exec", "oxlint", "--config", "scripts/purge/oxlint.json", "scripts/purge"],
  { stdio: "inherit" },
);
run(
  "pnpm",
  [
    "dlx",
    "prettier@3.6.2",
    "--check",
    "scripts/purge/**/*.mjs",
    "scripts/purge/*.json",
  ],
  { stdio: "inherit" },
);
