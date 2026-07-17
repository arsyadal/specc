#!/usr/bin/env node
import { compilePlaybook } from "../lib/compiler.js";
import { saveHandoffState, loadHandoffContext } from "../lib/handoff.js";
import { trackPrompt, clearTokenCache } from "../lib/watchdog.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { createRequire } from "node:module";

const pkg = createRequire(import.meta.url)("../package.json");

const HELP = `specc - Session & Skill Optimizer for Claude Code

Usage:
  specc compile                  Compile playbook.md into micro-skills in ~/.claude/skills/
  specc handoff                  Generate .specc-handoff.json and notify user to run /clear
  specc hook session-start       System hook for SessionStart context injection
  specc hook prompt-submit       System hook for UserPromptSubmit token auditing

Options:
  -h, --help                     Show this help info
  -v, --version                  Show version info
`;

const cmd = process.argv[2];

if (cmd === "compile") {
  const playbook = "playbook.md";
  const output = join(homedir(), ".claude", "skills");
  if (!existsSync(playbook)) {
    console.error("Error: playbook.md not found in current directory.");
    process.exit(1);
  }
  compilePlaybook(playbook, output);
  console.log(`Successfully compiled playbook.md into skills at ${output}`);
} else if (cmd === "handoff") {
  const path = saveHandoffState();
  console.log(`Handoff state saved to ${path}`);
  console.log("\n⚠️ PLEASE RUN /clear IN CLAUDE CODE NOW.");
  console.log("On restart, your progress and git state will be automatically restored.");
} else if (cmd === "hook" && process.argv[3] === "session-start") {
  // SessionStart hook prints JSON to stdout with hookSpecificOutput
  const context = loadHandoffContext();
  clearTokenCache(); // Reset watchdog on fresh session
  if (context) {
    console.log(JSON.stringify({
      hookSpecificOutput: {
        additionalContext: context
      }
    }));
  } else {
    console.log(JSON.stringify({}));
  }
} else if (cmd === "hook" && process.argv[3] === "prompt-submit") {
  // Reads prompt from stdin and tracks size
  let data = "";
  process.stdin.on("data", chunk => {
    data += chunk;
  });
  process.stdin.on("end", () => {
    let promptText = "";
    try {
      const payload = JSON.parse(data);
      promptText = payload.prompt || "";
    } catch (err) {}
    
    const result = trackPrompt(promptText.length);
    if (result.warning) {
      console.warn(`\n⚠️  [SPECC WARNING] Session context is getting large (${result.total} characters).`);
      console.warn("   Run 'specc handoff' and then '/clear' to refresh your context window.\n");
    }
    // Return empty additionalContext
    console.log(JSON.stringify({}));
  });
} else if (cmd === "-v" || cmd === "--version") {
  console.log(pkg.version);
} else {
  console.log(HELP);
  process.exit(cmd === undefined ? 1 : 0);
}
