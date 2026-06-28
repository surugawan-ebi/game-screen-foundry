"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const skillsDir = path.join(root, "skills");

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function parseFrontmatter(text, filePath) {
  if (!text.startsWith("---\n")) {
    fail(`${filePath} must start with YAML frontmatter`);
  }
  const endIndex = text.indexOf("\n---\n", 4);
  if (endIndex === -1) {
    fail(`${filePath} must close YAML frontmatter`);
  }
  const frontmatter = text.slice(4, endIndex).split(/\r?\n/u);
  const values = {};
  for (const line of frontmatter) {
    const match = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/u);
    if (!match) {
      fail(`${filePath} has invalid frontmatter line: ${line}`);
    }
    values[match[1]] = match[2].replace(/^"|"$/g, "");
  }
  return values;
}

function validateSkill(skillPath) {
  const skillName = path.basename(skillPath);
  const skillMd = path.join(skillPath, "SKILL.md");
  const agentYaml = path.join(skillPath, "agents", "openai.yaml");

  if (!fs.existsSync(skillMd)) {
    fail(`${skillName} is missing SKILL.md`);
  }
  if (!fs.existsSync(agentYaml)) {
    fail(`${skillName} is missing agents/openai.yaml`);
  }

  const text = fs.readFileSync(skillMd, "utf8");
  const frontmatter = parseFrontmatter(text, path.relative(root, skillMd));
  if (frontmatter.name !== skillName) {
    fail(`${skillName} frontmatter name must match folder name`);
  }
  if (!frontmatter.description || frontmatter.description.length < 80) {
    fail(`${skillName} frontmatter description is too short`);
  }
  if (/TODO|\[TODO/u.test(text)) {
    fail(`${skillName} contains TODO placeholder text`);
  }

  const agentText = fs.readFileSync(agentYaml, "utf8");
  if (!agentText.includes(`$${skillName}`)) {
    fail(`${skillName} agents/openai.yaml default prompt must mention $${skillName}`);
  }
  if (/TODO|\[TODO/u.test(agentText)) {
    fail(`${skillName} agents/openai.yaml contains TODO placeholder text`);
  }
}

if (!fs.existsSync(skillsDir)) {
  process.stdout.write("Skill check skipped: no skills directory\n");
  process.exit(0);
}

const skills = fs.readdirSync(skillsDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(skillsDir, entry.name));

for (const skillPath of skills) {
  validateSkill(skillPath);
}

process.stdout.write(`Skill check ok (${skills.length} skills)\n`);

