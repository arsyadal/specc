# specc

[![npm version](https://img.shields.io/npm/v/specc.svg)](https://www.npmjs.com/package/specc)
[![license](https://img.shields.io/npm/l/specc.svg)](LICENSE)

**specc** is a Session & Skill Optimizer for Claude Code. It compiles a single `playbook.md` into highly focused micro-skills, tracks session character sizes, and allows clean context handoffs so you never lose task progress.

## Features

1. **Micro-Skills Compiler (`specc compile`):** Splits your monolithic playbook rules into tiny, single-purpose skills. When Claude needs a rule, only a tiny skill is loaded into context, avoiding the 8,000-character discovery ceiling and reducing token tax.
2. **Session Handoff (`specc handoff`):** Captures your current git branch, status, commits, and diff. Saves them to a temporary file, prompts you to run `/clear`, and restores the state automatically on the new session start.
3. **Token Watchdog (Hook-based):** Warns you when your session accumulates too many characters, prompting you to reset before prompts become expensive or context rot sets in.

---

## Installation

```bash
npm install -g specc
```

For development:
```bash
git clone https://github.com/arsyadal/specc.git
cd specc
npm link
```

---

## Getting Started

### 1. Compile Micro-Skills

Create a `playbook.md` in your project root:

```markdown
# Globals
All micro-skills inherit this.
- Use ES Modules.

# Target: skill/git-commit
---
description: Enforce conventional commits
---
Rules for git commit...

# Target: skill/deploy-staging
---
description: Deploy to staging
---
Rules for staging deployment...
```

Run the compiler to build individual skills in `~/.claude/skills/`:
```bash
specc compile
```

### 2. Configure Claude Code Hooks

To automate Session Handoff and the Token Watchdog, register `specc` in your project's `.claude/settings.json` or global configuration:

```json
{
  "hooks": {
    "SessionStart": "specc hook session-start",
    "UserPromptSubmit": "specc hook prompt-submit"
  }
}
```

---

## Commands

| Command | Action |
| --- | --- |
| `specc compile` | Compiles `playbook.md` into micro-skills |
| `specc handoff` | Saves git state, instructs you to run `/clear` |
| `specc hook session-start` | Restores handoff state (called by Claude Code) |
| `specc hook prompt-submit` | Warns if context size gets too large (called by Claude Code) |

---

## How it works

- **Session Handoff:** Writing the current state to `.specc-handoff.json` allows the new session to pick up right where the old one left off. The `SessionStart` hook reads this context, pushes it into Claude's memory, and deletes the temporary file.
- **Watchdog:** Character counts are cached in `.specc-token-cache` on every prompt submit. A warning is printed to `stderr` once the cache exceeds 80,000 characters (~20,000 tokens).

---

## License

MIT
