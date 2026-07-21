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
if (!/<!-- evidence-id: \d{6} -->/.test(markdown)) {
  throw new Error("Evidence IDs are missing. Run: node tools/assign_evidence_ids.mjs");
}
let html = fs.readFileSync(htmlPath, "utf8");

const tawhidStart = markdown.indexOf("## 1. ");
const otherTawhidStart = markdown.indexOf("## 10. ");
const istighathaStart = markdown.indexOf("## 11. ");
if (tawhidStart < 0 || otherTawhidStart < 0 || istighathaStart < 0) {
  throw new Error("Could not find the collection boundaries in evidence-bank.md");
}

// Section 10 was an uncategorized import bucket. It is intentionally excluded
// from the published collection while its genuinely relevant entries are
// reviewed and moved into the defined topical sections.
let rawTawhid = markdown.slice(tawhidStart, otherTawhidStart).trim();
let rawIstighatha = markdown.slice(istighathaStart).trim();
let subsection = 0;

function replaceSection(source, number, transform) {
  const startMarker = `## ${number}. `;
  const nextMarker = `## ${number + 1}. `;
  const start = source.indexOf(startMarker);
  const end = source.indexOf(nextMarker, start);
  if (start < 0 || end < 0) throw new Error(`Could not isolate section ${number}`);
  return source.slice(0, start) + transform(source.slice(start, end)) + source.slice(end);
}

function removeTelegramEntry(source, reference) {
  const escaped = reference.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.replace(
    new RegExp(`<!-- telegram-source: ${escaped} -->[\\s\\S]*?(?:\\n---\\s*\\n|(?=\\n### ))`, "g"),
    "",
  );
}

function extractHeadingBlock(source, heading) {
  const marker = `### ${heading}`;
  const start = source.indexOf(marker);
  if (start < 0) return { source, block: "" };
  const next = source.indexOf("\n### ", start + marker.length);
  const end = next < 0 ? source.length : next + 1;
  return {
    source: source.slice(0, start) + source.slice(end),
    block: source.slice(start, end).trim(),
  };
}

function insertBeforeHeading(source, heading, block) {
  if (!block || source.includes(block)) return source;
  const marker = `### ${heading}`;
  const position = source.indexOf(marker);
  if (position < 0) throw new Error(`Could not find insertion heading: ${heading}`);
  return source.slice(0, position) + block.trim() + "\n\n" + source.slice(position);
}

function hasVisibleEvidence(body) {
  return /(?:\bSource\s*:|المصدر\s*:|source-scan|source-video|media-file|\[[^\]]*(?:p\.?|pp\.?|page|vol\.?|\d+\s*\/\s*\d+)[^\]]*\])/i.test(body);
}

function addPublicTelegramSources(source) {
  return source.replace(
    /<!-- telegram-source: dar\/messages[^#]*\.html#message(\d+)(?:-message\d+)? -->\s*([\s\S]*?)(?=\n---\s*\n|\n### |\n## |$)/g,
    (entry, messageId, body) => {
      if (hasVisibleEvidence(body)) return entry;
      return entry.trimEnd() +
        `\n\n[Open the original Telegram source post](https://t.me/salafsaqeedah/${messageId})\n`;
    },
  );
}

rawTawhid = replaceSection(rawTawhid, 7, section => {
  let curated = section.replace(
    /### Scholars explaining or transmitting Ibn Taymiyyah’s position[\s\S]*?(?=### The name of shirk and punishment before the message)/,
    "",
  );
  for (const reference of [
    "dar/messages3.html#message2605",
    "dar/messages2.html#message1594",
    "dar/messages4.html#message3784",
    "dar/messages.html#message540",
    "dar/messages4.html#message3636",
    "dar/messages2.html#message2072",
    "personal/messages.html#message608",
    "dar/messages3.html#message2388",
    "dar/messages2.html#message1878",
    "dar/messages3.html#message2562",
    "dar/messages2.html#message1997",
    "dar/messages3.html#message2902",
    "dar/messages2.html#message1985",
    "personal/messages.html#message517",
    "dar/messages5.html#message4482",
    "dar/messages3.html#message2628",
    "dar/messages4.html#message3606",
    "dar/messages4.html#message3924",
    "personal/messages.html#message751",
  ]) {
    curated = removeTelegramEntry(curated, reference);
  }
  return curated;
});

// Keep each quotation under the user's defined subject. The Ibn Taymiyyah
// passage concerns the name/ruling of a mushrik, not the independent duty of
// declaring the mushrikin disbelievers, so it belongs in section 5 and is also
// mirrored in the Ibn Taymiyyah-only section 7. The other two general passages
// already appear in their proper sections 2 and 3.
let sectionFour = "";
let ibnTaymiyyahNamesBlock = "";
rawTawhid = replaceSection(rawTawhid, 4, section => {
  let result = extractHeadingBlock(
    section,
    "Ibn Taymiyyah: religious descriptions follow the person’s own belief and action",
  );
  ibnTaymiyyahNamesBlock = result.block;
  section = result.source;

  result = extractHeadingBlock(
    section,
    "ʿAbd al-Raḥmān ibn Ḥasan: consensus concerning disavowal from major shirk and its people",
  );
  section = result.source;

  result = extractHeadingBlock(section, "Full statement of ʿAbd Allāh al-Ghunaymān");
  section = result.source;

  const aymanPattern = /### Ayman al-ʿAnqarī: takfīr of the mushrikīn is part of kufr biṭ-ṭāghūt[\s\S]*?\n---\s*\n/;
  const ayman = section.match(aymanPattern)?.[0]?.trim() ?? "";
  section = section.replace(aymanPattern, "");
  sectionFour = section.trimEnd() + (ayman ? `\n\n${ayman}\n` : "");
  return sectionFour;
});

rawTawhid = replaceSection(rawTawhid, 5, section =>
  insertBeforeHeading(section, "The name of shirk and punishment before the message", ibnTaymiyyahNamesBlock),
);

rawTawhid = replaceSection(rawTawhid, 5, section => {
  let curated = section;
  // These imports address other sects or unrelated general rulings rather than
  // the ignorant person who commits major shirk.
  for (const reference of [
    "dar/messages3.html#message2605",
    "dar/messages2.html#message1594",
    "dar/messages4.html#message3784",
    "dar/messages.html#message540",
    "personal/messages.html#message751",
    "dar/messages3.html#message2268",
    "dar/messages5.html#message4732",
  ]) {
    curated = removeTelegramEntry(curated, reference);
  }
  return curated;
});

rawTawhid = replaceSection(rawTawhid, 7, section =>
  insertBeforeHeading(section, "The name of shirk and punishment before the message", ibnTaymiyyahNamesBlock),
);

rawTawhid = replaceSection(rawTawhid, 8, section => {
  let curated = section;
  for (const reference of [
    "dar/messages3.html#message3168",
    "dar/messages5.html#message4248",
  ]) {
    curated = removeTelegramEntry(curated, reference);
  }
  return curated;
});

rawTawhid = addPublicTelegramSources(rawTawhid);
rawIstighatha = addPublicTelegramSources(rawIstighatha);

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

  rendered = rendered.replace(
    /(<p class="arabic-citation">)([\s\S]*?)(<\/p>)/g,
    (_, opening, citation, closing) => {
      const formattedCitation = citation.replace(
        /[0-9٠-٩]+\/[0-9٠-٩]+(?:[–—-][0-9٠-٩]+)?/g,
        reference => `<bdi class="citation-ref" dir="ltr">&#8206;${reference.replace(/[–—]/g, "-")}&#8206;</bdi>`,
      );
      return opening + formattedCitation + closing;
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
