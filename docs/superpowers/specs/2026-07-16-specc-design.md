# Design Spec: specc (Specification, Session, and Skill Compiler & Controller)

**Date:** 2026-07-16  
**Status:** Draft  
**Author:** Antigravity  

## 1. Problem Statement

AI coding agents (like Claude Code) suffer from **Context Bloat & Session Accumulation**. Once a skill (`SKILL.md`) is triggered, its entire instruction set (which can be thousands of tokens) remains in the session history. As the session progresses, this history accumulates, causing:
1. **Context Rot:** Model focus degrades as the context window fills up.
2. **Token Tax:** Every subsequent prompt costs more tokens since it processes the entire accumulated history.
3. **Ineffective Handoffs:** Clearing the session (`/clear`) resets the token count but wipes out the agent's memory of current progress, current git diff, and the next steps.

---

## 2. Proposed Solution (`specc`)

`specc` is a three-pronged system that optimizes both the size of skills loaded and the lifecycle of the session context:

```
                  ┌────────────────────────────────────────────────────────┐
                  │                      playbook.md                       │
                  └───────────────────────────┬────────────────────────────┘
                                              │
                                       [specc compile]
                                              │
                  ┌───────────────────────────┴────────────────────────────┐
                  │             ~/.claude/skills/ (Micro-Skills)           │
                  │  ├─ react-setup/SKILL.md                               │
                  │  ├─ react-test/SKILL.md                                │
                  │  └─ react-deploy/SKILL.md                              │
                  └────────────────────────────────────────────────────────┘
                                              │
                        ┌─────────────────────┴─────────────────────┐
                        ▼                                           ▼
            [specc handoff] CLI                               [Token Watchdog]
            - Gathers git diff / status                       - UserPromptSubmit hook
            - Saves to .specc-handoff.json                    - Warns when character count
            - User runs /clear                                  exceeds threshold
                        │                                           │
                        ▼                                           ▼
           [SessionStart Hook]                                [Prompt Alert]
           - Injects handoff summary                          "⚠️ Warning: Context > 30k"
```

### Module 1: Playbook Compiler (Micro-Skills)
Instead of one large, monolithic skill file, rules are split into highly focused **Micro-Skills**. 
- **Input:** A single `playbook.md` structured with target markers.
- **Output:** Multiple discrete skill folders containing small, single-purpose `SKILL.md` files (e.g., `git-commit`, `deploy-staging`, `react-test`).
- **Benefit:** When Claude needs a specific workflow, only a tiny (~50 lines) skill is loaded instead of a 3000-line playbook.

### Module 2: Session Handoff CLI
Provides a seamless way to clean the context window without losing project state.
- **CLI Command (`specc handoff`):**
  1. Runs git diagnostics (modified files, git diff summary, last 3 commits).
  2. Creates a `.specc-handoff.json` file in the current directory with this state.
  3. Prints instructions to the user: `Handoff state saved. Please run /clear to reset context.`
- **Claude Hook (`SessionStart`):**
  - Triggers when the user runs `/clear` or starts a new session.
  - Automatically checks if `.specc-handoff.json` exists.
  - If found, injects the summary of the previous session as initial context and deletes the handoff file.

### Module 3: Token Watchdog (Hook-based)
Monitors context size dynamically.
- **Claude Hook (`UserPromptSubmit`):**
  - Intercepts every prompt.
  - Keeps a running tally of character counts submitted in the session (as an approximation of token count).
  - If the cumulative characters exceed a warning threshold (e.g., 80,000 characters ~20,000 tokens), it prints a warning banner to stderr advising the user to run `specc handoff` or `/clear`.

---

## 3. Detailed Specifications & Implementation Plan

### Phase 1: Micro-Skills Compiler
The compiler parses a single master file (`playbook.md`) using `# Target: skill/<name>` headers to split files.
Example input:
```markdown
# Globals
All micro-skills inherit this.

# Target: skill/git-commit
---
description: Run structured git commits
---
Rules for git commit...

# Target: skill/deploy-staging
---
description: Deploy to staging server
---
Rules for deployment...
```
Output:
- `~/.claude/skills/git-commit/SKILL.md` (inherits Globals + target rules)
- `~/.claude/skills/deploy-staging/SKILL.md` (inherits Globals + target rules)

### Phase 2: Handoff CLI and Hook
- When `specc handoff` is run, it gathers:
  - Branch name
  - Git status (modified, untracked files)
  - Raw `git diff` (truncated if too large)
  - Last 3 commits
- It saves this JSON data.
- The `SessionStart` hook reads this JSON, formats it as:
  ```
  [SPECC HANDOFF STATE DETECTED]
  Branch: main
  Modified files: [src/index.ts]
  Summary of changes: ...
  Please resume the work on this task.
  ```
- It passes this as `additionalContext` in the `SessionStart` hook output.

### Phase 3: Watchdog Hook
- Hook configures `UserPromptSubmit` to monitor `process.stdin` size.
- A local cache file `.specc-session-token` keeps the running total.
- If threshold is hit, writes warning to `process.stderr`.

---

## 4. Risks & Mitigations

- **Risk:** Symlinks or active system skills might get disabled or overridden by the compiler.
  - **Mitigation:** The compiler only writes to folders it owns (using a prefix like `specc-` or matching exact targets in `playbook.md`). It will not overwrite external folders.
- **Risk:** Hook EOTP or permission issues on execution.
  - **Mitigation:** Deliver hooks as lightweight, executable Node scripts with clear instructions for registration.

---

## 5. Self-Review Checklist

1. **Placeholder Scan:** All paths, commands, and rules are explicitly defined. No "TBD".
2. **Internal Consistency:** The Handoff CLI and SessionStart hook work in unison via the `.specc-handoff.json` file.
3. **Scope Check:** This fits within a single lightweight Node.js tool without heavy dependencies.
4. **Ambiguity Check:** The transition between `/clear` and `SessionStart` is fully defined.
