import { spawn } from "bun";
import { join } from "path";
import type { Terminal } from "./types";
import { terminals, cliSessionToTerminal, nextTerminalId, sessions, sessionLogs, MAX_OUTPUT_BUFFER } from "./state";
import { broadcastSessions } from "./broadcast";

const PTY_HELPER = join(import.meta.dir, "pty-helper.js");

export function spawnTerminal(cwd?: string): Terminal {
  const id = `term-${nextTerminalId()}-${Date.now()}`;
  const workDir = cwd || process.env.HOME || "/";

  const proc = spawn(["node", PTY_HELPER, "120", "30", workDir, id], {
    cwd: workDir,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });

  const term: Terminal = { id, cwd: workDir, proc, subscribers: new Set(), outputBuffer: [] };
  terminals.set(id, term);

  // Read newline-delimited JSON from the helper's stdout
  const reader = proc.stdout.getReader();
  let buffer = "";

  (async () => {
    const decoder = new TextDecoder();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          try {
            const msg = JSON.parse(line);
            if (msg.type === "output") {
              // Guard: terminal may have been killed while we were reading
              if (!terminals.has(id)) break;
              // Buffer for replay on reconnect
              term.outputBuffer.push(msg.data);
              if (term.outputBuffer.length > MAX_OUTPUT_BUFFER) {
                term.outputBuffer.splice(0, term.outputBuffer.length - MAX_OUTPUT_BUFFER);
              }
              const payload = JSON.stringify({ type: "terminal_output", terminalId: id, data: msg.data });
              for (const ws of term.subscribers) {
                try { ws.send(payload); } catch { term.subscribers.delete(ws); }
              }
            } else if (msg.type === "exit") {
              cleanupTerminal(id, msg.exitCode);
            }
          } catch {}
        }
      }
    } catch (e) {
      console.error(`[terminal] reader error for ${id}:`, e);
    } finally {
      // Always release the reader lock to avoid resource leaks
      try { reader.releaseLock(); } catch {}
    }
  })();

  console.log(`[terminal] spawned ${id} (pid=${proc.pid})`);
  return term;
}

/** Shared cleanup — safe to call multiple times for the same id */
function cleanupTerminal(id: string, exitCode?: number) {
  const term = terminals.get(id);
  if (!term) return; // already cleaned up (killed via API or duplicate exit)

  const payload = JSON.stringify({ type: "terminal_exit", terminalId: id, exitCode: exitCode ?? -1 });
  for (const ws of term.subscribers) {
    try { ws.send(payload); } catch {}
  }
  term.subscribers.clear();
  terminals.delete(id);

  // Clean up claude→terminal mapping
  for (const [cid, tid] of cliSessionToTerminal) {
    if (tid === id) cliSessionToTerminal.delete(cid);
  }
  // Remove session so character disappears
  sessions.delete(id);
  sessionLogs.delete(id);
  broadcastSessions();
  console.log(`[terminal] ${id} cleaned up (exitCode=${exitCode ?? "killed"})`);
}

function sendToHelper(term: Terminal, msg: unknown) {
  try {
    const stdin = term.proc.stdin as import("bun").FileSink;
    stdin.write(new TextEncoder().encode(JSON.stringify(msg) + "\n"));
  } catch {}
}

export function resizeTerminal(id: string, cols: number, rows: number) {
  const term = terminals.get(id);
  if (term) sendToHelper(term, { type: "resize", cols, rows });
}

export function writeTerminal(id: string, data: string) {
  const term = terminals.get(id);
  if (term) sendToHelper(term, { type: "input", data });
}

export function killTerminal(id: string) {
  const term = terminals.get(id);
  if (!term) return;

  // Tell the helper to kill the PTY, then kill the helper process itself
  sendToHelper(term, { type: "kill" });
  try { term.proc.kill(); } catch {}

  // Shared cleanup (removes from maps, notifies subscribers, broadcasts)
  cleanupTerminal(id);
}
