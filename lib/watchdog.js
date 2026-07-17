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
