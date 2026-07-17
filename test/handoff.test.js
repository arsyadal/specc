import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadHandoffContext } from "../lib/handoff.js";

test("loadHandoffContext parses state and deletes file", () => {
  const root = mkdtempSync(join(tmpdir(), "specc-handoff-"));
  const path = join(root, ".specc-handoff.json");
  writeFileSync(path, JSON.stringify({ branch: "main", status: "modified", diff: "diff code", commits: "first commit" }), "utf8");

  const ctx = loadHandoffContext(root);
  assert.match(ctx, /Branch: main/);
  assert.match(ctx, /diff code/);
  assert.equal(existsSync(path), false); // check deletion
});
