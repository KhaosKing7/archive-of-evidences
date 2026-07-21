import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const markdownPath = path.join(root, "evidence-bank.md");
const original = fs.readFileSync(markdownPath, "utf8");
const lines = original.split(/\r?\n/);
const existingIds = [...original.matchAll(/<!-- evidence-id: (\d{6}) -->/g)].map(match => Number(match[1]));
let nextId = Math.max(0, ...existingIds) + 1;
let assigned = 0;
let afterRule = false;
const output = [];

const marker = () => {
  assigned += 1;
  return `<!-- evidence-id: ${String(nextId++).padStart(6, "0")} -->`;
};

for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  const trimmed = line.trim();
  const heading = /^###\s+/.test(line);
  const telegram = /^<!-- telegram-source: /.test(trimmed);
  const rule = /^---\s*$/.test(trimmed);
  const section = /^##\s+/.test(line);

  if (heading || telegram) {
    output.push(line);
    if (!/^<!-- evidence-id: \d{6} -->$/.test(lines[index + 1]?.trim() || "")) output.push(marker());
    afterRule = false;
    continue;
  }
  if (rule) {
    output.push(line);
    afterRule = true;
    continue;
  }
  if (section) {
    output.push(line);
    afterRule = false;
    continue;
  }
  if (afterRule && trimmed) {
    if (!/^<!-- evidence-id: \d{6} -->$/.test(trimmed) && !heading && !telegram && !section) output.push(marker());
    afterRule = false;
  }
  output.push(line);
}

fs.writeFileSync(markdownPath, output.join("\n"), "utf8");
console.log(`Assigned ${assigned} new immutable evidence IDs; ${existingIds.length + assigned} total`);
