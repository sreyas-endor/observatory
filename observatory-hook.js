#!/usr/bin/env node
// Observatory universal hook — works with Claude Code, Cursor, Copilot CLI, and Gemini CLI.
// Usage: node /path/to/observatory-hook.js <cli>
//   where <cli> is one of: claude, cursor, copilot, gemini
//
// Reads stdin (hook JSON from the CLI), injects OBSERVATORY_TERMINAL_ID, POSTs to server.
// No dependencies: uses Node 18+ native fetch and built-in JSON parsing.

const OBSERVATORY_PORT = process.env.OBSERVATORY_PORT || 7337;
const cli = process.argv[2] || "claude";
const OBSERVATORY_URL = `http://localhost:${OBSERVATORY_PORT}/hook/${cli}`;

async function main() {
  // Read all of stdin
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    // If stdin isn't valid JSON, send it as-is wrapped
    payload = { raw };
  }

  // Inject terminal ID if present
  const terminalId = process.env.OBSERVATORY_TERMINAL_ID;
  if (terminalId) {
    payload.observatory_terminal_id = terminalId;
  }

  // Fire and forget — don't block the CLI
  try {
    await fetch(OBSERVATORY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2000),
    });
  } catch {
    // Server not running — silently ignore
  }
}

main();
