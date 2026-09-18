import { execFileSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const cliEntry = resolve(packageRoot, "dist/index.js");
const mcpEntry = resolve(packageRoot, "dist/mcp-server.js");

// turbo runs `test` after `^build` — dependencies' builds, not this package's —
// so a clean checkout reaches this with no dist and compiles here.
const BUILD_TIMEOUT_MS = 180_000;
const RPC_TIMEOUT_MS = 30_000;

interface JsonRpcReply {
  id: number;
  result?: { tools?: unknown[] };
  error?: { message: string };
}

function ensureBuilt(): void {
  if (!existsSync(cliEntry) || !existsSync(mcpEntry)) {
    execFileSync("npm", ["run", "build"], { cwd: packageRoot, stdio: "inherit" });
  }
}

/**
 * Both `bin` entries run under plain Node, with no loader in front of them.
 *
 * They used to be launched through tsx, whose resolver tolerated the
 * extensionless relative specifiers `@decibeltrade/sdk` shipped before 0.8.2.
 * Nothing else here would notice that regressing: vitest resolves the SDK to
 * its source, so only a real `node dist/…` catches it.
 */
describe("published entry points", () => {
  it(
    "run the CLI under plain Node",
    () => {
      ensureBuilt();
      const out = execFileSync(process.execPath, [cliEntry, "--version"], {
        cwd: packageRoot,
        encoding: "utf8",
        stdio: "pipe",
      });
      expect(out.trim()).toMatch(/^\d+\.\d+\.\d+/);
    },
    BUILD_TIMEOUT_MS,
  );

  it(
    "serve MCP tools under plain Node",
    async () => {
      ensureBuilt();
      const server = spawn(process.execPath, [mcpEntry], {
        cwd: packageRoot,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stderr = "";
      server.stderr.on("data", (chunk) => (stderr += chunk));

      const pending = new Map<number, (message: JsonRpcReply, failure?: Error) => void>();
      let death: string | undefined;
      let buffered = "";
      server.stdout.on("data", (chunk: Buffer) => {
        buffered += chunk.toString();
        for (let end = buffered.indexOf("\n"); end !== -1; end = buffered.indexOf("\n")) {
          const line = buffered.slice(0, end).trim();
          buffered = buffered.slice(end + 1);
          if (!line) continue;
          let message: JsonRpcReply;
          try {
            message = JSON.parse(line) as JsonRpcReply;
          } catch {
            continue; // the server is free to write non-JSON to stdout
          }
          pending.get(message.id)?.(message);
          pending.delete(message.id);
        }
      });

      // Settle on the matching id rather than after a fixed delay: a loaded
      // runner that answers slowly should take longer, not fail.
      const call = (id: number, method: string, params?: object) =>
        new Promise<JsonRpcReply>((resolve, reject) => {
          // A crash has to fail the call it happened on. Resolving here would
          // let the next call run against a dead process and report a timeout
          // instead of the crash.
          if (death) {
            reject(new Error(death));
            return;
          }
          const timer = setTimeout(() => {
            pending.delete(id);
            reject(new Error(`no reply to ${method} within ${RPC_TIMEOUT_MS}ms`));
          }, RPC_TIMEOUT_MS);
          pending.set(id, (message, failure) => {
            clearTimeout(timer);
            if (failure) reject(failure);
            else if (message.error) reject(new Error(`${method} failed: ${message.error.message}`));
            else resolve(message);
          });
          server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
        });

      const exited = new Promise<void>((resolve) => server.once("exit", () => resolve()));
      server.once("exit", (code, signal) => {
        const detail = stderr.trim().split("\n")[0];
        death =
          `server exited (code ${code}, signal ${signal}) before replying` +
          (detail ? `: ${detail}` : "");
        for (const [id, settle] of pending) {
          pending.delete(id);
          settle({ id }, new Error(death));
        }
      });

      let tools: unknown[] | undefined;
      try {
        await call(1, "initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test", version: "1" },
        });
        tools = (await call(2, "tools/list")).result?.tools;
      } finally {
        server.kill();
        await exited;
      }

      expect(stderr).toBe("");
      expect(tools?.length).toBeGreaterThan(0);
    },
    BUILD_TIMEOUT_MS,
  );
});
