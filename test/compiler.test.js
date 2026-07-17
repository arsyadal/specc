import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePlaybook } from "../lib/compiler.js";

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
