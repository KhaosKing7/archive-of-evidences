import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const telegramRootIndex = process.argv.indexOf("--telegram-root");
const telegramRoot = telegramRootIndex >= 0 ? path.resolve(process.argv[telegramRootIndex + 1]) : null;

const decode = value => value
  .replace(/&nbsp;/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
  .replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(Number.parseInt(number, 16)));

const textOf = value => decode(value)
  .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
  .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
  .replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim();

const normalize = value => textOf(value)
  .toLowerCase()
  .replace(/\b(?:source|المصدر)\s*:[\s\S]*$/i, "")
  .replace(/open the original telegram source post/gi, "")
  .replace(/(?:arabic )?(?:source )?(?:video|scan) from the user[^.]*\.?/gi, "")
  .replace(/show (?:attached )?(?:arabic )?source (?:text|scan)/gi, "")
  .replace(/[^\p{L}\p{N}]+/gu, " ")
  .replace(/\s+/g, " ")
  .trim();

const tokens = value => new Set(normalize(value).split(" ").filter(token => token.length > 2));
const similarity = (left, right) => {
  let overlap = 0;
  for (const token of left) if (right.has(token)) overlap += 1;
  return overlap / Math.max(1, Math.min(left.size, right.size));
};

const sections = [...html.matchAll(/<h2 id="section-(\d+)">([\s\S]*?)<\/h2>/g)].map((match, index, all) => {
  const end = index + 1 < all.length ? all[index + 1].index : html.length;
  return {
    number: Number(match[1]),
    title: textOf(match[2]),
    start: match.index,
    end,
    body: html.slice(match.index, end),
  };
});

const sectionForPosition = position => {
  const section = sections.find(item => position >= item.start && position < item.end);
  return section ? `${section.number}. ${section.title}` : "Unknown section";
};

const references = [...html.matchAll(/<!-- telegram-source: ([^>]+) -->/g)];
const entries = references.map((match, index) => {
  const nextHeading = html.indexOf("<h3 ", match.index + 1);
  const headingIntroducesEntry = nextHeading >= 0 &&
    textOf(html.slice(match.index + match[0].length, nextHeading)).length === 0;
  const candidates = [
    index + 1 < references.length ? references[index + 1].index : html.length,
    html.indexOf("<hr>", match.index),
    html.indexOf("<h2 ", match.index + 1),
    headingIntroducesEntry ? -1 : nextHeading,
  ].filter(position => position >= 0 && position > match.index);
  const end = Math.min(...candidates);
  const body = html.slice(match.index, end);
  return {
    reference: match[1],
    section: sectionForPosition(match.index),
    position: match.index,
    body,
    contentBody: body.replace(/^<!-- telegram-source: [^>]+ -->\s*/, ""),
    text: textOf(body),
    normalized: normalize(body),
  };
});

const missingEvidence = entries.filter(entry => !/(?:\bSource\s*:|المصدر\s*:|source-(?:scan|video)|diagram-gallery|Open the original Telegram source post|\[[^\]]*(?:p\.?|pp\.?|page|vol\.?|\d+\s*\/\s*\d+)[^\]]*\])/i.test(entry.contentBody));

const telegramOnly = entries.filter(entry =>
  /Open the original Telegram source post/i.test(entry.contentBody) &&
  !/(?:\bSource\s*:|المصدر\s*:|source-(?:scan|video)|diagram-gallery|\[[^\]]*(?:p\.?|pp\.?|page|vol\.?|\d+\s*\/\s*\d+)[^\]]*\])/i.test(entry.contentBody),
);

const arabicOnly = entries.filter(entry => {
  const arabic = (entry.text.match(/[\u0600-\u06ff]/g) ?? []).length;
  const latin = (entry.text.match(/[A-Za-z]/g) ?? []).length;
  return arabic >= 80 && latin < 80;
});

const exactGroups = new Map();
for (const entry of entries) {
  if (entry.normalized.length < 100) continue;
  const duplicateKey = `${entry.section}\0${entry.normalized}`;
  const group = exactGroups.get(duplicateKey) ?? [];
  group.push(entry);
  exactGroups.set(duplicateKey, group);
}
const exactDuplicates = [...exactGroups.values()].filter(group => group.length > 1);

const candidates = entries
  .filter(entry => entry.normalized.length >= 180)
  .map(entry => ({ ...entry, tokenSet: tokens(entry.body) }));
const nearDuplicates = [];
for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
    const left = candidates[leftIndex];
    const right = candidates[rightIndex];
    if (left.section !== right.section) continue;
    if (left.normalized === right.normalized) continue;
    const score = similarity(left.tokenSet, right.tokenSet);
    if (score >= 0.88) nearDuplicates.push({ left, right, score });
  }
}
nearDuplicates.sort((left, right) => right.score - left.score);

const containedDuplicates = [];
for (let leftIndex = 0; leftIndex < candidates.length; leftIndex += 1) {
  for (let rightIndex = leftIndex + 1; rightIndex < candidates.length; rightIndex += 1) {
    const left = candidates[leftIndex];
    const right = candidates[rightIndex];
    if (left.section !== right.section || left.normalized === right.normalized) continue;
    const shorter = left.normalized.length <= right.normalized.length ? left : right;
    const longer = shorter === left ? right : left;
    if (shorter.normalized.length >= 140 && longer.normalized.includes(shorter.normalized)) {
      containedDuplicates.push({ shorter, longer, ratio: shorter.normalized.length / longer.normalized.length });
    }
  }
}
containedDuplicates.sort((left, right) => right.ratio - left.ratio);

const assetPaths = [...html.matchAll(/(?:src|href)="(assets\/[^"]+)"/g)].map(match => match[1]);
const missingAssets = [...new Set(assetPaths)].filter(asset => !fs.existsSync(path.join(root, asset)));

const headingMatches = [...html.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)];
const emptyHeadings = headingMatches.filter((match, index) => {
  const next = index + 1 < headingMatches.length ? headingMatches[index + 1].index : html.length;
  const body = textOf(html.slice(match.index + match[0].length, next));
  return body.length < 40;
}).map(match => ({ title: textOf(match[1]), section: sectionForPosition(match.index) }));

const translationRatios = [];
for (const match of html.matchAll(/<details class="source-panel arabic-source"[\s\S]*?<div class="arabic-text"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<\/details>([\s\S]*?)(?=<h[23]|<hr>|<!-- telegram-source:|$)/g)) {
  const arabicText = textOf(match[1]).replace(/المصدر\s*:[\s\S]*$/i, "");
  const englishText = textOf(match[2]).replace(/^English\s*/i, "").replace(/Source\s*:[\s\S]*$/i, "");
  const arabicWords = arabicText.split(/\s+/).filter(Boolean).length;
  const englishWords = englishText.split(/\s+/).filter(Boolean).length;
  if (arabicWords >= 40 && englishWords / arabicWords < 0.55) {
    const before = html.slice(Math.max(0, match.index - 500), match.index);
    const heading = [...before.matchAll(/<h3[^>]*>([\s\S]*?)<\/h3>/g)].at(-1);
    translationRatios.push({
      title: heading ? textOf(heading[1]) : "Untitled entry",
      section: sectionForPosition(match.index),
      arabicWords,
      englishWords,
      ratio: Number((englishWords / arabicWords).toFixed(2)),
    });
  }
}

const telegramMediaCandidates = [];
if (telegramRoot) {
  const exportCache = new Map();
  for (const entry of telegramOnly) {
    const reference = entry.reference.match(/^dar\/(messages\d*\.html)#message(\d+)/);
    if (!reference) continue;
    const [, fileName, messageId] = reference;
    const exportPath = path.join(telegramRoot, fileName);
    if (!fs.existsSync(exportPath)) continue;
    const exported = exportCache.get(exportPath) ?? fs.readFileSync(exportPath, "utf8");
    exportCache.set(exportPath, exported);
    const start = exported.indexOf(`id="message${messageId}"`);
    if (start < 0) continue;
    const nextMessagePattern = /<div class="message ([^"]*)" id="message(\d+)">/g;
    nextMessagePattern.lastIndex = start + 1;
    const following = nextMessagePattern.exec(exported);
    const ownEnd = following?.index ?? exported.length;
    const ownBlock = exported.slice(start, ownEnd);
    const media = [...ownBlock.matchAll(/href="((?:photos|video_files|files|audio_files|voice_messages)\/[^"]+)"/g)]
      .map(match => match[1]);

    let cursor = following;
    for (let offset = 0; offset < 2 && cursor; offset += 1) {
      const blockStart = cursor.index;
      nextMessagePattern.lastIndex = blockStart + cursor[0].length;
      const after = nextMessagePattern.exec(exported);
      const block = exported.slice(blockStart, after?.index ?? exported.length);
      const joined = cursor[1].includes("joined");
      const hasText = /<div class="text">[\s\S]*?<\/div>/.test(block);
      if (!joined || hasText) break;
      for (const match of block.matchAll(/href="((?:photos|video_files|files|audio_files|voice_messages)\/[^"]+)"/g)) {
        media.push(match[1]);
      }
      cursor = after;
    }

    if (media.length) {
      telegramMediaCandidates.push({
        reference: entry.reference,
        section: entry.section,
        media: [...new Set(media)],
      });
    }
  }
}

const sectionStats = sections.map(section => ({
  section: `${section.number}. ${section.title}`,
  telegramEntries: entries.filter(entry => entry.section === `${section.number}. ${section.title}`).length,
  headings: (section.body.match(/<h3/g) ?? []).length,
}));

const compactEntry = entry => ({
  reference: entry.reference,
  section: entry.section,
  preview: entry.text.slice(0, 180),
});

const report = {
  summary: {
    sections: sections.length,
    telegramEntries: entries.length,
    uniqueAssets: new Set(assetPaths).size,
    missingEvidence: missingEvidence.length,
    telegramOnly: telegramOnly.length,
    arabicOnly: arabicOnly.length,
    exactDuplicateGroups: exactDuplicates.length,
    nearDuplicatePairs: nearDuplicates.length,
    containedDuplicatePairs: containedDuplicates.length,
    missingAssets: missingAssets.length,
    emptyHeadings: emptyHeadings.length,
    suspiciousTranslationRatios: translationRatios.length,
    telegramMediaCandidates: telegramMediaCandidates.length,
  },
  sectionStats,
  missingAssets,
  missingEvidence: missingEvidence.map(compactEntry),
  telegramOnly: telegramOnly.map(compactEntry),
  arabicOnly: arabicOnly.map(compactEntry),
  exactDuplicates: exactDuplicates.map(group => group.map(compactEntry)),
  nearDuplicates: nearDuplicates.map(pair => ({
    score: Number(pair.score.toFixed(3)),
    left: compactEntry(pair.left),
    right: compactEntry(pair.right),
  })),
  containedDuplicates: containedDuplicates.map(pair => ({
    ratio: Number(pair.ratio.toFixed(3)),
    shorter: compactEntry(pair.shorter),
    longer: compactEntry(pair.longer),
  })),
  emptyHeadings,
  suspiciousTranslationRatios: translationRatios,
  telegramMediaCandidates,
};

const jsonMode = process.argv.includes("--json");
if (jsonMode) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  console.log("Archive of Evidences audit");
  console.table(report.summary);
  console.table(sectionStats);
  for (const [name, findings] of Object.entries({
    missingAssets,
    missingEvidence: report.missingEvidence,
    telegramOnly: report.telegramOnly,
    arabicOnly: report.arabicOnly,
    exactDuplicates: report.exactDuplicates,
    nearDuplicates: report.nearDuplicates,
    containedDuplicates: report.containedDuplicates,
    emptyHeadings,
    suspiciousTranslationRatios: translationRatios,
    telegramMediaCandidates,
  })) {
    console.log(`\n## ${name} (${findings.length})`);
    console.dir(findings, { depth: null, maxArrayLength: null });
  }
}
