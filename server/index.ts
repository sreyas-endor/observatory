import { serve, spawn } from "bun";
import { join, resolve, isAbsolute } from "path";
import { readFile, writeFile, stat } from "fs/promises";

import type { LogEntry, WsData } from "./types";
import { sessions, wsClients, sessionLogs, terminals } from "./state";
import { broadcastSessions } from "./broadcast";
import { pruneStale } from "./sessions";
import { spawnTerminal, killTerminal, writeTerminal, resizeTerminal } from "./terminals";
import { handleHook } from "./hooks";
import { serveStatic, readJSON } from "./static";

// ── Server ─────────────────────────────────────────────────────────────────

const server = serve<WsData>({
  port: 7337,

  async fetch(req, server) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // WebSocket upgrade — main dashboard
    if (pathname === "/ws") {
      const upgraded = server.upgrade(req, { data: { kind: "dashboard" } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // WebSocket upgrade — terminal I/O
    if (pathname === "/ws/terminal") {
      const terminalId = url.searchParams.get("id");
      if (!terminalId || !terminals.has(terminalId)) {
        return new Response("Unknown terminal", { status: 404 });
      }
      const upgraded = server.upgrade(req, { data: { kind: "terminal", terminalId } });
      if (upgraded) return undefined;
      return new Response("WebSocket upgrade failed", { status: 400 });
    }

    // Spawn a new terminal — returns { terminalId }
    if (req.method === "POST" && pathname === "/api/terminal/spawn") {
      return readJSON(req).then((body) => {
        const cwd = (body.cwd as string) || undefined;
        const term = spawnTerminal(cwd);
        return new Response(JSON.stringify({ terminalId: term.id }), {
          headers: { "Content-Type": "application/json" },
        });
      });
    }

    // Register an external terminal (e.g. Tauri Rust PTY) so hooks can track it
    if (req.method === "POST" && pathname === "/api/terminal/register") {
      return readJSON(req).then((body) => {
        const id = body.terminalId as string;
        const cwd = (body.cwd as string) || process.env.HOME || "/";
        if (id && !terminals.has(id)) {
          terminals.set(id, {
            id,
            cwd,
            proc: null as any, // no subprocess — managed externally
            subscribers: new Set(),
            outputBuffer: [],
          });
          console.log(`[terminal] registered external terminal ${id}`);
        }
        return new Response(JSON.stringify({ terminalId: id }), {
          headers: { "Content-Type": "application/json" },
        });
      });
    }

    // Kill a terminal
    if (req.method === "POST" && pathname === "/api/terminal/kill") {
      return readJSON(req).then((body) => {
        const id = body.terminalId as string;
        if (id) {
          killTerminal(id); // handles all cleanup (maps, subscribers, broadcast)
        }
        return new Response("{}", { headers: { "Content-Type": "application/json" } });
      });
    }

    // ── File listing endpoint ─────────────────────────────────────────────
    if (req.method === "GET" && pathname === "/api/files") {
      const cwd = url.searchParams.get("cwd");
      if (!cwd) return new Response("Missing cwd", { status: 400 });

      try {
        // Try git ls-files first (respects .gitignore)
        const proc = spawn(["git", "ls-files", "--cached", "--others", "--exclude-standard"], {
          cwd,
          stdout: "pipe",
          stderr: "pipe",
        });
        const output = await new Response(proc.stdout).text();
        const exitCode = await proc.exited;

        if (exitCode === 0 && output.trim()) {
          const files = output.trim().split("\n").filter(Boolean);
          return new Response(JSON.stringify({ cwd, files }), {
            headers: { "Content-Type": "application/json" },
          });
        }
      } catch {}

      // Fallback: simple recursive readdir (skip common junk)
      const SKIP = new Set(["node_modules", ".git", "target", "dist", "build", ".next", "__pycache__", ".cache"]);
      const files: string[] = [];
      async function walk(dir: string, prefix: string) {
        const { readdir } = await import("fs/promises");
        const entries = await readdir(dir, { withFileTypes: true });
        for (const entry of entries) {
          if (SKIP.has(entry.name) || entry.name.startsWith(".")) continue;
          const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.isDirectory()) {
            if (files.length < 10000) await walk(join(dir, entry.name), rel);
          } else {
            files.push(rel);
            if (files.length >= 10000) return;
          }
        }
      }
      try {
        await walk(cwd, "");
        return new Response(JSON.stringify({ cwd, files }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e: any) {
        return new Response(e.message, { status: 500 });
      }
    }

    // ── File read endpoint ──────────────────────────────────────────────────
    if (req.method === "GET" && pathname === "/api/file") {
      const filePath = url.searchParams.get("path");
      if (!filePath) return new Response("Missing path", { status: 400 });

      const resolved = isAbsolute(filePath) ? filePath : resolve(filePath);
      try {
        const info = await stat(resolved);
        if (info.isDirectory()) return new Response("Is a directory", { status: 400 });
        if (info.size > 5 * 1024 * 1024) return new Response("File too large", { status: 413 });

        const content = await readFile(resolved, "utf-8");
        return new Response(JSON.stringify({ path: resolved, content }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (e: any) {
        const status = e.code === "ENOENT" ? 404 : 500;
        return new Response(e.message, { status });
      }
    }

    // ── File write endpoint ─────────────────────────────────────────────────
    if (req.method === "POST" && pathname === "/api/file") {
      return readJSON(req).then(async (body) => {
        const filePath = body.path as string;
        const content = body.content as string;
        if (!filePath || typeof content !== "string") {
          return new Response("Missing path or content", { status: 400 });
        }
        const resolved = isAbsolute(filePath) ? filePath : resolve(filePath);
        try {
          await writeFile(resolved, content, "utf-8");
          return new Response(JSON.stringify({ path: resolved, ok: true }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          return new Response(e.message, { status: 500 });
        }
      });
    }

    // Hook endpoints — /hook/:cli (claude, cursor, copilot, gemini)
    const hookMatch = pathname.match(/^\/hook\/(claude|cursor|copilot|gemini)$/);
    if (req.method === "POST" && hookMatch) {
      const source = hookMatch[1];
      return readJSON(req).then((body) => {
        handleHook(source, body);
        return new Response("{}", { headers: { "Content-Type": "application/json" } });
      });
    }

    // Static files
    return serveStatic(pathname);
  },

  websocket: {
    open(ws) {
      const meta = ws.data;

      if (meta.kind === "terminal") {
        const term = terminals.get(meta.terminalId!);
        if (term) {
          term.subscribers.add(ws);
          if (term.outputBuffer.length > 0) {
            const replay = term.outputBuffer.join("");
            ws.send(JSON.stringify({ type: "terminal_output", terminalId: term.id, data: replay }));
          }
          ws.send(JSON.stringify({ type: "terminal_ready", terminalId: term.id }));
        } else {
          ws.close(1008, "Terminal not found");
        }
        return;
      }

      // Dashboard client
      wsClients.add(ws);
      ws.send(JSON.stringify({ type: "sessions", data: Array.from(sessions.values()) }));
      const logs: Record<string, LogEntry[]> = {};
      for (const [id, entries] of sessionLogs) logs[id] = entries;
      ws.send(JSON.stringify({ type: "logs", data: logs }));
    },
    close(ws) {
      const meta = ws.data;

      if (meta.kind === "terminal") {
        const term = terminals.get(meta.terminalId!);
        if (term) term.subscribers.delete(ws);
        return;
      }

      wsClients.delete(ws);
    },
    message(ws, msg) {
      const meta = ws.data;

      if (meta.kind === "terminal") {
        try {
          const data = JSON.parse(msg.toString()) as Record<string, unknown>;
          if (data.type === "terminal_input" && typeof data.data === "string") {
            writeTerminal(meta.terminalId!, data.data);
          } else if (data.type === "terminal_resize") {
            resizeTerminal(meta.terminalId!, data.cols as number, data.rows as number);
          }
        } catch { /* ignore */ }
        return;
      }

      // Dashboard messages (reserved for future use)
      try {
        JSON.parse(msg.toString());
      } catch { /* ignore malformed messages */ }
    },
  },
});

// Prune stale sessions every 30 seconds, also re-broadcast for keepalive
setInterval(() => {
  pruneStale();
  broadcastSessions();
}, 30_000);

console.log("Observatory running at http://localhost:7337");
console.log(`WebSocket endpoint: ws://localhost:7337/ws`);
console.log(`Hook endpoints:`);
console.log(`  POST http://localhost:7337/hook/claude`);
console.log(`  POST http://localhost:7337/hook/cursor`);
console.log(`  POST http://localhost:7337/hook/copilot`);
console.log(`  POST http://localhost:7337/hook/gemini`);
