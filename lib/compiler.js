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
