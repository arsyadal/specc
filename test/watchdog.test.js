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
