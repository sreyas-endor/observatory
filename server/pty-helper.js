#!/usr/bin/env node
// PTY helper — spawned by the Bun server as a sidecar per terminal.
// Communicates via stdin/stdout using newline-delimited JSON.
// stdin  → { type: "input", data: "..." } | { type: "resize", cols, rows }
// stdout → { type: "output", data: "..." } | { type: "exit", exitCode }

const pty = require("node-pty");

const args = process.argv.slice(2);
const cols = parseInt(args[0] || "120", 10);
const rows = parseInt(args[1] || "30", 10);
const cwd = args[2] || process.env.HOME || "/";
const terminalId = args[3] || "";
const shell = process.env.SHELL || "/bin/zsh";

const ptyProcess = pty.spawn(shell, ["-l"], {
  name: "xterm-256color",
  cols,
  rows,
  cwd,
  env: { ...process.env, OBSERVATORY_TERMINAL_ID: terminalId },
});

function sendMsg(obj) {
  process.stdout.write(JSON.stringify(obj) + "\n");
}

ptyProcess.onData((data) => {
  sendMsg({ type: "output", data });
});

ptyProcess.onExit(({ exitCode, signal }) => {
  sendMsg({ type: "exit", exitCode, signal });
  setTimeout(() => process.exit(0), 100);
});

// Read JSON messages from stdin
let buf = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buf += chunk;
  let nl;
  while ((nl = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, nl);
    buf = buf.slice(nl + 1);
    try {
      const msg = JSON.parse(line);
      if (msg.type === "input" && typeof msg.data === "string") {
        ptyProcess.write(msg.data);
      } else if (msg.type === "resize") {
        ptyProcess.resize(msg.cols, msg.rows);
      } else if (msg.type === "kill") {
        ptyProcess.kill();
      }
    } catch {}
  }
});

process.stdin.on("end", () => {
  ptyProcess.kill();
  process.exit(0);
});
