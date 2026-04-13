#!/usr/bin/env node
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const entry = resolve(__dirname, "../dist/index.js");
const tsxLoader = pathToFileURL(require.resolve("tsx")).href;

try {
  execFileSync(process.execPath, ["--import", tsxLoader, entry, ...process.argv.slice(2)], {
    stdio: "inherit",
  });
} catch (err) {
  process.exit(err.status ?? 1);
}
