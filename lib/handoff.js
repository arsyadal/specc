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
