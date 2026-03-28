#!/usr/bin/env node
// Observatory setup script — cross-platform (macOS, Linux, Windows)
// Configures hooks for Claude Code, Cursor, and Gemini CLI to report to Observatory.
// Copilot CLI uses project-level hooks only — instructions printed at the end.
//
// Usage: node setup.js

const fs = require("fs");
const path = require("path");
const os = require("os");
const readline = require("readline");

// ── Paths ────────────────────────────────────────────────────────────────────

const HOME = os.homedir();
const HOOK_SCRIPT = path.resolve(__dirname, "observatory-hook.js");
const OBSERVATORY_MARKER = "observatory-hook.js";

// ── Colors (ANSI, disabled if no TTY) ────────────────────────────────────────

const isTTY = process.stdout.isTTY;
const c = {
  green: (s) => (isTTY ? `\x1b[32m${s}\x1b[0m` : s),
  yellow: (s) => (isTTY ? `\x1b[33m${s}\x1b[0m` : s),
  blue: (s) => (isTTY ? `\x1b[34m${s}\x1b[0m` : s),
  dim: (s) => (isTTY ? `\x1b[2m${s}\x1b[0m` : s),
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function loadJSON(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function saveJSON(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function hookCommand(cli) {
  return `node ${JSON.stringify(HOOK_SCRIPT)} ${cli}`;
}

function hasObservatoryHook(entry) {
  if (typeof entry === "string") return entry.includes(OBSERVATORY_MARKER);
  if (typeof entry !== "object" || entry === null) return false;
  // Claude format: { hooks: [{ command: "..." }] }
  if (Array.isArray(entry.hooks)) {
    return entry.hooks.some(
      (h) => typeof h.command === "string" && h.command.includes(OBSERVATORY_MARKER)
    );
  }
  // Cursor/Gemini format: { command: "..." }
  if (typeof entry.command === "string") return entry.command.includes(OBSERVATORY_MARKER);
  return false;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

// ── CLI Installers ───────────────────────────────────────────────────────────

function setupClaude() {
  const settingsPath = path.join(HOME, ".claude", "settings.json");
  const settings = loadJSON(settingsPath);
  if (!settings.hooks) settings.hooks = {};

  const events = ["PreToolUse", "PostToolUse", "Stop", "UserPromptSubmit"];
  const cmd = hookCommand("claude");
  const added = [];
  const skipped = [];

  for (const event of events) {
    if (!Array.isArray(settings.hooks[event])) settings.hooks[event] = [];

    if (settings.hooks[event].some(hasObservatoryHook)) {
      skipped.push(event);
      continue;
    }

    settings.hooks[event].push({
      matcher: "",
      hooks: [{ type: "command", command: cmd }],
    });
    added.push(event);
  }

  saveJSON(settingsPath, settings);
  return { path: settingsPath, added, skipped };
}

function setupCursor() {
  const hooksPath = path.join(HOME, ".cursor", "hooks.json");
  const config = loadJSON(hooksPath);

  // Cursor hooks.json uses { version: 1, hooks: { ... } } wrapper
  if (!config.version) config.version = 1;
  if (!config.hooks) config.hooks = {};
  const hooks = config.hooks;

  const events = [
    "beforeShellExecution",
    "beforeReadFile",
    "afterFileEdit",
    "beforeMCPExecution",
    "stop",
  ];
  const cmd = hookCommand("cursor");
  const added = [];
  const skipped = [];

  for (const event of events) {
    if (!Array.isArray(hooks[event])) hooks[event] = [];

    if (hooks[event].some(hasObservatoryHook)) {
      skipped.push(event);
      continue;
    }

    hooks[event].push({ command: cmd });
    added.push(event);
  }

  saveJSON(hooksPath, config);
  return { path: hooksPath, added, skipped };
}

function setupGemini() {
  const settingsPath = path.join(HOME, ".gemini", "settings.json");
  const settings = loadJSON(settingsPath);
  if (!settings.hooks) settings.hooks = {};

  const events = [
    { name: "BeforeTool", matcher: ".*" },
    { name: "AfterTool", matcher: ".*" },
    { name: "UserPromptSubmit", matcher: undefined },
    { name: "SessionEnd", matcher: undefined },
  ];
  const cmd = hookCommand("gemini");
  const added = [];
  const skipped = [];

  for (const { name, matcher } of events) {
    if (!Array.isArray(settings.hooks[name])) settings.hooks[name] = [];

    if (settings.hooks[name].some(hasObservatoryHook)) {
      skipped.push(name);
      continue;
    }

    const entry = { command: cmd };
    if (matcher !== undefined) entry.matcher = matcher;
    settings.hooks[name].push(entry);
    added.push(name);
  }

  saveJSON(settingsPath, settings);
  return { path: settingsPath, added, skipped };
}

// ── CLI detection ────────────────────────────────────────────────────────────

function detectCLIs() {
  const detected = [];

  // Claude Code — check if ~/.claude/ exists
  if (fs.existsSync(path.join(HOME, ".claude"))) {
    detected.push("claude");
  }

  // Cursor — check if ~/.cursor/ exists
  if (fs.existsSync(path.join(HOME, ".cursor"))) {
    detected.push("cursor");
  }

  // Gemini CLI — check if ~/.gemini/ exists
  if (fs.existsSync(path.join(HOME, ".gemini"))) {
    detected.push("gemini");
  }

  return detected;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("");
  console.log(c.blue("  Observatory Setup"));
  console.log(c.blue("  ─────────────────"));
  console.log("");

  // Verify hook script exists
  if (!fs.existsSync(HOOK_SCRIPT)) {
    console.error(`  Error: Hook script not found at ${HOOK_SCRIPT}`);
    console.error(`  Run this script from the observatory directory.`);
    process.exit(1);
  }

  const detected = detectCLIs();
  const allCLIs = ["claude", "cursor", "gemini"];

  if (detected.length === 0) {
    console.log(c.yellow("  No supported CLIs detected."));
    console.log(`  Looked for: ${allCLIs.map((c) => "~/." + c + "/").join(", ")}`);
    console.log("");
    const answer = await ask("  Set up all anyway? (y/N) ");
    if (answer !== "y" && answer !== "yes") {
      console.log("  Aborted.");
      process.exit(0);
    }
    detected.push(...allCLIs);
  } else {
    console.log(`  Detected: ${detected.map(c.green).join(", ")}`);
    const missing = allCLIs.filter((c) => !detected.includes(c));
    if (missing.length > 0) {
      console.log(`  Not found: ${missing.map(c.dim).join(", ")}`);
    }
    console.log("");
  }

  // Set up each detected CLI
  const installers = { claude: setupClaude, cursor: setupCursor, gemini: setupGemini };
  const results = [];

  for (const cli of detected) {
    const installer = installers[cli];
    if (!installer) continue;

    console.log(c.yellow(`  Setting up ${cli}...`));
    const result = installer();

    if (result.added.length > 0) {
      console.log(`    Added: ${result.added.join(", ")}`);
    }
    if (result.skipped.length > 0) {
      console.log(`    Already configured: ${result.skipped.join(", ")}`);
    }
    console.log(c.green(`    Written to ${result.path}`));
    console.log("");
    results.push({ cli, ...result });
  }

  // Summary
  console.log(c.green("  Setup complete!"));
  console.log("");
  console.log("  Hook script: " + HOOK_SCRIPT);
  console.log("");
  console.log("  Configured endpoints:");
  for (const r of results) {
    console.log(`    http://localhost:7337/hook/${r.cli}`);
  }

  // Copilot instructions
  console.log("");
  console.log(c.yellow("  Copilot CLI (manual setup):"));
  console.log("  Copilot uses project-level hooks only.");
  console.log("  Add this to .github/hooks/observatory.json in your project:");
  console.log("");
  console.log(c.dim("    {"));
  console.log(c.dim('      "preToolUse": [{'));
  console.log(c.dim(`        "bash": "${hookCommand("copilot").replace(/"/g, '\\"')}"`));
  console.log(c.dim("      }],"));
  console.log(c.dim('      "postToolUse": [{'));
  console.log(c.dim(`        "bash": "${hookCommand("copilot").replace(/"/g, '\\"')}"`));
  console.log(c.dim("      }],"));
  console.log(c.dim('      "userPromptSubmitted": [{'));
  console.log(c.dim(`        "bash": "${hookCommand("copilot").replace(/"/g, '\\"')}"`));
  console.log(c.dim("      }],"));
  console.log(c.dim('      "sessionEnd": [{'));
  console.log(c.dim(`        "bash": "${hookCommand("copilot").replace(/"/g, '\\"')}"`));
  console.log(c.dim("      }]"));
  console.log(c.dim("    }"));

  console.log("");
  console.log(c.yellow("  Start Observatory:"));
  console.log("    bun run dev");
  console.log("");
}

main();
