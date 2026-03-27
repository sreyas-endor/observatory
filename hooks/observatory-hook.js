#!/usr/bin/env node
// Observatory hook — cross-platform (macOS/Windows/Linux)
// Reads stdin (Claude hook JSON), injects OBSERVATORY_TERMINAL_ID, POSTs to server.
// No dependencies: uses Node 18+ native fetch and built-in JSON parsing (no jq, no curl).

const OBSERVATORY_URL = "http://localhost:7337/hook/claude";

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

  // Fire and forget — don't block Claude Code
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
