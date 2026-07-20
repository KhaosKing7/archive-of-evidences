import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const markedPath =
  "C:/Users/ymelt/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/marked";
const { marked } = require(markedPath);

const root = path.resolve(import.meta.dirname, "..");
const markdownPath = path.join(root, "evidence-bank.md");
const htmlPath = path.join(root, "index.html");

const markdown = fs.readFileSync(markdownPath, "utf8");
let html = fs.readFileSync(htmlPath, "utf8");

const tawhidStart = markdown.indexOf("## 1. ");
const istighathaStart = markdown.indexOf("## 11. ");
if (tawhidStart < 0 || istighathaStart < 0) {
  throw new Error("Could not find the two collection boundaries in evidence-bank.md");
}

const rawTawhid = markdown.slice(tawhidStart, istighathaStart).trim();
const rawIstighatha = markdown.slice(istighathaStart).trim();
let subsection = 0;

function renderCollection(source) {
  let rendered = marked.parse(source, { gfm: true, breaks: false });

  rendered = rendered.replace(
    /<h2>(\d+)\.\s*([\s\S]*?)<\/h2>/g,
    (_, number, title) => `<h2 id="section-${number}">${number}. ${title}</h2>`,
  );

  rendered = rendered.replace(
    /<h([34])>([\s\S]*?)<\/h\1>/g,
    (_, level, title) => {
      subsection += 1;
      const direction = /[\u0600-\u06ff]/.test(title) ? ' dir="rtl"' : "";
      return `<h${level}${direction} id="subsection-${subsection}">${title}</h${level}>`;
    },
  );

  return rendered.trim();
}

const tawhidHtml = renderCollection(rawTawhid);
const istighathaHtml = renderCollection(rawIstighatha);

const tawhidPanel =
  `<section class="topic-panel" id="topic-tawhid" data-topic-panel="tawhid">\n` +
  `${tawhidHtml}\n</section>`;
const istighathaPanel =
  `<section class="topic-panel" id="topic-istighatha" data-topic-panel="istighatha" hidden>\n` +
  `${istighathaHtml}\n</section>`;

html = html.replace(
  /<section class="topic-panel" id="topic-tawhid"[\s\S]*?<\/section>\s*<section class="topic-panel" id="topic-istighatha"[\s\S]*?<\/section>/,
  `${tawhidPanel}\n${istighathaPanel}`,
);

const h3Map = new Map();
for (const match of html.matchAll(/<h3(?:\s+[^>]*)?\s+id="([^"]+)"[^>]*>([\s\S]*?)<\/h3>/g)) {
  const label = match[2].replace(/<[^>]+>/g, "").trim();
  h3Map.set(label, match[1]);
}

const istighathaLinks = [
  ["Foundations: duʿāʾ, worship, and istighāthah", "Foundations"],
  ["Istighāthah and calling upon the dead or absent", "Istighāthah"],
  ["Ṭalab al-duʿāʾ and requesting intercession from the dead", "Ṭalab al-duʿāʾ"],
  ["Tawassul: meanings and distinctions", "Tawassul"],
  ["What may be requested from a living, present, capable person", "Living and capable"],
  ["Grave visitation and the pathways leading to shirk", "Grave visitation"],
];

for (const [heading] of istighathaLinks) {
  if (!h3Map.has(heading)) throw new Error(`Missing rendered heading: ${heading}`);
}

const linksLiteral = istighathaLinks
  .map(([heading, label]) => `          ['${h3Map.get(heading)}', '${label}']`)
  .join(",\n");

html = html.replace(
  /(istighatha:\s*\{\s*summary:[\s\S]*?links:\s*\[)[\s\S]*?(\]\s*\})/,
  `$1\n${linksLiteral}\n        $2`,
);

fs.writeFileSync(htmlPath, html, "utf8");
console.log(`Rendered ${subsection} subsections into index.html`);
