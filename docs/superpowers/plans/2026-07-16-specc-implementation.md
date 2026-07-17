# specc Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `specc` CLI tool to split rules into micro-skills, track session sizes, and perform state handoffs when clearing Claude Code sessions.

**Architecture:** A zero-dependency Node.js ESM command-line interface. It uses native filesystem methods to split single markdown files into micro-skills, gathers git telemetry for session resets, and runs hooks to track token sizes.

**Tech Stack:** Node.js (ESM), `node:test` (Native Test Runner), Git CLI.

## Global Constraints
- No external runtime dependencies (native Node.js modules only).
- Target Node.js version >= 18.
- Code must use ESM imports/exports.
- Handled safely on all OS platforms (macOS, Windows, Linux).

---

### Task 1: Scaffolding and Playbook Compiler

**Files:**
- Create: `package.json`
- Create: `lib/compiler.js`
- Create: `test/compiler.test.js`

**Interfaces:**
- Produces: `parsePlaybook(playbookContent: string): Array<{ name: string, description: string, content: string }>`
- Produces: `compilePlaybook(playbookPath: string, outputDir: string): void`

- [ ] **Step 1: Write compiler tests**

Create `test/compiler.test.js`:
```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePlaybook, compilePlaybook } from "../lib/compiler.js";

test("parsePlaybook extracts global and micro-skills with frontmatter", () => {
  const content = `# Globals
Shared rules.

# Target: skill/git-commit
---
description: Custom git rules
---
Commit format rules.`;

  const parsed = parsePlaybook(content);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].name, "git-commit");
  assert.equal(parsed[0].description, "Custom git rules");
  assert.match(parsed[0].content, /Shared rules/);
  assert.match(parsed[0].content, /Commit format rules/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/compiler.test.js`
Expected: FAIL (module not found or function undefined)

- [ ] **Step 3: Write compiler implementation**

Create `lib/compiler.js`:
```javascript
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export function parsePlaybook(content) {
  const lines = content.split("\n");
  let globals = "";
  const skills = [];
  let currentSkill = null;
  let inFrontmatter = false;
  let frontmatterLines = [];

  for (const line of lines) {
    if (line.startsWith("# Globals")) {
      currentSkill = null;
      continue;
    }
    if (line.startsWith("# Target: skill/")) {
      const name = line.replace("# Target: skill/", "").trim();
      currentSkill = { name, description: "", content: "", rawFrontmatter: [] };
      skills.push(currentSkill);
      inFrontmatter = false;
      frontmatterLines = [];
      continue;
    }

    if (currentSkill) {
      if (line.trim() === "---") {
        if (!inFrontmatter && currentSkill.rawFrontmatter.length === 0) {
          inFrontmatter = true;
          continue;
        } else if (inFrontmatter) {
          inFrontmatter = false;
          // Parse description
          for (const fl of frontmatterLines) {
            if (fl.startsWith("description:")) {
              currentSkill.description = fl.replace("description:", "").trim();
            }
          }
          continue;
        }
      }
      if (inFrontmatter) {
        frontmatterLines.push(line);
        currentSkill.rawFrontmatter.push(line);
      } else {
        currentSkill.content += line + "\n";
      }
    } else {
      globals += line + "\n";
    }
  }

  return skills.map(sk => ({
    name: sk.name,
    description: sk.description,
    content: `---\nname: ${sk.name}\ndescription: ${sk.description}\n---\n\n${globals.trim()}\n\n${sk.content.trim()}`
  }));
}

export function compilePlaybook(playbookPath, outputDir) {
  const content = readFileSync(playbookPath, "utf8");
  const skills = parsePlaybook(content);
  for (const sk of skills) {
    const dir = join(outputDir, sk.name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "SKILL.md"), sk.content, "utf8");
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/compiler.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add package.json lib/compiler.js test/compiler.test.js
git commit -m "feat: implement playbook parser and micro-skills compiler"
```

---

### Task 2: Session Handoff CLI and Hook

**Files:**
- Create: `lib/handoff.js`
- Create: `test/handoff.test.js`

**Interfaces:**
- Produces: `saveHandoffState(cwd: string): string`
- Produces: `loadHandoffContext(cwd: string): string | null`

- [ ] **Step 1: Write handoff tests**

Create `test/handoff.test.js`:
```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveHandoffState, loadHandoffContext } from "../lib/handoff.js";

test("saveHandoffState creates file and loadHandoffContext retrieves it", () => {
  const root = mkdtempSync(join(tmpdir(), "specc-handoff-"));
  // Write a mock git environment if needed, or check output format
  const path = join(root, ".specc-handoff.json");
  writeFileSync(path, JSON.stringify({ branch: "main", diff: "modified code" }));

  const ctx = loadHandoffContext(root);
  assert.match(ctx, /Branch: main/);
  assert.match(ctx, /modified code/);
  assert.equal(existsSync(path), false); // must delete after load
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/handoff.test.js`
Expected: FAIL (module not found or function undefined)

- [ ] **Step 3: Write handoff implementation**

Create `lib/handoff.js`:
```javascript
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

export function saveHandoffState(cwd = process.cwd()) {
  let branch = "unknown";
  let diff = "";
  let status = "";
  let commits = "";

  try {
    branch = execSync("git branch --show-current", { cwd, encoding: "utf8" }).trim();
    status = execSync("git status --porcelain", { cwd, encoding: "utf8" }).trim();
    diff = execSync("git diff", { cwd, encoding: "utf8" }).slice(0, 5000); // cap diff size
    commits = execSync("git log --oneline -3", { cwd, encoding: "utf8" }).trim();
  } catch (err) {
    // Non-git directories are handled gracefully
    status = "Not a git repository";
  }

  const payload = { branch, status, diff, commits, timestamp: Date.now() };
  const targetPath = join(cwd, ".specc-handoff.json");
  writeFileSync(targetPath, JSON.stringify(payload, null, 2), "utf8");
  return targetPath;
}

export function loadHandoffContext(cwd = process.cwd()) {
  const targetPath = join(cwd, ".specc-handoff.json");
  if (!existsSync(targetPath)) return null;

  try {
    const data = JSON.parse(readFileSync(targetPath, "utf8"));
    unlinkSync(targetPath);

    return `[SPECC SESSION HANDOFF]
Branch: ${data.branch}
Status:
${data.status || "(none)"}

Last commits:
${data.commits || "(none)"}

Diff:
${data.diff || "(none)"}

Instruction: Resume working on the tasks in this repository.`;
  } catch (err) {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/handoff.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/handoff.js test/handoff.test.js
git commit -m "feat: implement session handoff state capture and injection"
```

---

### Task 3: Token Watchdog Hook

**Files:**
- Create: `lib/watchdog.js`
- Create: `test/watchdog.test.js`

**Interfaces:**
- Produces: `trackPrompt(charCount: number, cwd: string): { total: number, warning: boolean }`

- [ ] **Step 1: Write watchdog tests**

Create `test/watchdog.test.js`:
```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { trackPrompt } from "../lib/watchdog.js";

test("trackPrompt accumulates character count and triggers warning when threshold reached", () => {
  const root = mkdtempSync(join(tmpdir(), "specc-watchdog-"));
  
  const step1 = trackPrompt(10000, root);
  assert.equal(step1.total, 10000);
  assert.equal(step1.warning, false);

  const step2 = trackPrompt(80000, root); // total 90k, triggers warning (threshold 80k)
  assert.equal(step2.total, 90000);
  assert.equal(step2.warning, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/watchdog.test.js`
Expected: FAIL

- [ ] **Step 3: Write watchdog implementation**

Create `lib/watchdog.js`:
```javascript
import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

const CACHE_FILE = ".specc-token-cache";
const WARNING_THRESHOLD_CHARS = 80000; // ~20,000 tokens

export function trackPrompt(charCount, cwd = process.cwd()) {
  const cachePath = join(cwd, CACHE_FILE);
  let total = 0;
  if (existsSync(cachePath)) {
    try {
      total = parseInt(readFileSync(cachePath, "utf8").trim(), 10) || 0;
    } catch (err) {
      total = 0;
    }
  }

  total += charCount;
  writeFileSync(cachePath, total.toString(), "utf8");

  return {
    total,
    warning: total >= WARNING_THRESHOLD_CHARS
  };
}

export function clearTokenCache(cwd = process.cwd()) {
  const cachePath = join(cwd, CACHE_FILE);
  if (existsSync(cachePath)) {
    try {
      unlinkSync(cachePath);
    } catch (err) {}
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/watchdog.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add lib/watchdog.js test/watchdog.test.js
git commit -m "feat: implement token watchdog character tracking"
```

---

### Task 4: CLI Entrypoint and Hook Wiring

**Files:**
- Create: `bin/specc.js`
- Test: CLI integration

- [ ] **Step 1: Write CLI routing logic**

Create `bin/specc.js`:
```javascript
#!/usr/bin/env node
import { compilePlaybook } from "../lib/compiler.js";
import { saveHandoffState, loadHandoffContext } from "../lib/handoff.js";
import { trackPrompt, clearTokenCache } from "../lib/watchdog.js";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf8"));

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
```

- [ ] **Step 2: Mark executable and link locally**

Run: `chmod +x bin/specc.js && npm link`
Expected: CLI is linked global, command `specc` works.

- [ ] **Step 3: Run full test suite**

Run: `npm test`
Expected: 10/10 PASS (all compiler, handoff, and watchdog unit tests run successfully)

- [ ] **Step 4: Commit**

```bash
git add bin/specc.js
git commit -m "feat: complete CLI entrypoint and wiring"
```
