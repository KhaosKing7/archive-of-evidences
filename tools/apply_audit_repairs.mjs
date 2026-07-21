import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const bankPath = path.join(root, "evidence-bank.md");
let markdown = fs.readFileSync(bankPath, "utf8");

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const blocksFor = reference => {
  const marker = `<!-- telegram-source: ${reference} -->`;
  const blocks = [];
  let cursor = 0;
  while (true) {
    const start = markdown.indexOf(marker, cursor);
    if (start < 0) break;
    const separator = markdown.indexOf("\n---", start + marker.length);
    const nextEntry = markdown.indexOf("\n<!-- telegram-source:", start + marker.length);
    let end;
    if (separator >= 0 && (nextEntry < 0 || separator < nextEntry)) {
      end = separator + 4;
      while (end < markdown.length && /[\r\n]/.test(markdown[end])) end += 1;
    } else if (nextEntry >= 0) {
      end = nextEntry + 1;
    } else {
      end = markdown.length;
    }
    blocks.push({ reference, start, end, text: markdown.slice(start, end) });
    cursor = end;
  }
  return blocks;
};

const mediaBlocks = block => [
  ...block.matchAll(/<details class="source-panel scan-source"[\s\S]*?<\/details>/g),
  ...block.matchAll(/<div class="video-source"[\s\S]*?<\/div>/g),
].map(match => match[0]);

const mediaSources = block => [...block.matchAll(/(?:src|href)="(assets\/(?:scans|videos)\/[^"]+)"/g)]
  .map(match => match[1]);

const insertBeforeSeparator = (block, addition) => {
  const separator = block.lastIndexOf("\n---");
  const insertion = `\n\n${addition.trim()}\n`;
  return separator >= 0
    ? `${block.slice(0, separator).trimEnd()}${insertion}${block.slice(separator)}`
    : `${block.trimEnd()}${insertion}`;
};

const replaceRanges = replacements => {
  for (const replacement of [...replacements].sort((left, right) => right.start - left.start)) {
    markdown = `${markdown.slice(0, replacement.start)}${replacement.text}${markdown.slice(replacement.end)}`;
  }
};

const mergeGroup = (references, preferredReference = references[0]) => {
  const blocks = references.flatMap(blocksFor);
  if (blocks.length < 2) return;
  const preferred = blocks.filter(block => block.reference === preferredReference);
  const candidates = preferred.length ? preferred : blocks;
  const survivor = [...candidates].sort((left, right) => {
    const mediaDifference = mediaSources(right.text).length - mediaSources(left.text).length;
    return mediaDifference || right.text.length - left.text.length;
  })[0];

  let survivorText = survivor.text;
  const existingSources = new Set(mediaSources(survivorText));
  for (const block of blocks) {
    for (const media of mediaBlocks(block.text)) {
      const sources = mediaSources(media);
      if (sources.some(source => !existingSources.has(source))) {
        survivorText = insertBeforeSeparator(survivorText, media);
        for (const source of sources) existingSources.add(source);
      }
    }
  }

  replaceRanges(blocks.map(block => ({
    start: block.start,
    end: block.end,
    text: block === survivor ? survivorText : "",
  })));
};

const removeAll = reference => {
  const blocks = blocksFor(reference);
  replaceRanges(blocks.map(block => ({ start: block.start, end: block.end, text: "" })));
};

const attachVideo = (reference, assetPath) => {
  const blocks = blocksFor(reference);
  if (!blocks.length) throw new Error(`Cannot attach ${assetPath}: missing ${reference}`);
  const video = `<div class="video-source" data-origin="telegram-attachment">\n<video class="source-video" controls preload="metadata" src="${assetPath}"></video>\n<p class="media-caption">Video source from the Telegram export.</p>\n</div>`;
  replaceRanges(blocks
    .filter(block => !block.text.includes(assetPath))
    .map(block => ({ start: block.start, end: block.end, text: insertBeforeSeparator(block.text, video) })));
};

const markPrimarySourceNeeded = reference => {
  const blocks = blocksFor(reference);
  if (!blocks.length) throw new Error(`Cannot flag missing primary source: ${reference}`);
  const block = blocks[0];
  if (/Primary source needed/i.test(block.text)) return;
  const markerEnd = block.text.indexOf("-->") + 3;
  const updated = `${block.text.slice(0, markerEnd)}\n\n**Source status: Primary source needed.**${block.text.slice(markerEnd)}`;
  replaceRanges([{ start: block.start, end: block.end, text: updated }]);
};

// Remove same-section repetitions while preserving every distinct scan and video.
for (const group of [
  [["dar/messages4.html#message3723"]],
  [["dar/messages4.html#message3280"]],
  [["dar/messages4.html#message3282", "personal/messages.html#message561"], "personal/messages.html#message561"],
  [["dar/messages4.html#message3397"]],
  [["dar/messages5.html#message4682", "personal/messages.html#message525"], "personal/messages.html#message525"],
  [["dar/messages4.html#message3973", "personal/messages.html#message581"], "dar/messages4.html#message3973"],
  [["dar/messages5.html#message5069"]],
  [["dar/messages5.html#message4824", "personal/messages.html#message513"], "dar/messages5.html#message4824"],
  [["dar/messages4.html#message3969", "personal/messages.html#message558"], "dar/messages4.html#message3969"],
  [["dar/messages4.html#message3905", "personal/messages.html#message546"], "dar/messages4.html#message3905"],
  [["dar/messages4.html#message3503"]],
  [["dar/messages4.html#message3747", "personal/messages.html#message550"], "dar/messages4.html#message3747"],
  [["dar/messages4.html#message3977"]],
  [["dar/messages4.html#message3770"]],
  [["dar/messages5.html#message4921", "personal/messages.html#message544"], "personal/messages.html#message544"],
  [["dar/messages4.html#message3965"]],
]) {
  mergeGroup(group[0], group[1]);
}

// The 1/163 excerpt is a shorter same-section duplicate of the complete 1/161 entry.
removeAll("personal/messages.html#message520");

// Unsupported Telegram filler that contains no usable evidence.
for (const reference of [
  "dar/messages4.html#message4228",
  "dar/messages4.html#message3846",
  "dar/messages4.html#message3862",
  "dar/messages2.html#message1226",
]) removeAll(reference);

const darExport = "C:/Users/ymelt/Downloads/Java programs/archival website/Archive/ChatExport_2026-05-15";
const personalExport = "C:/Users/ymelt/Downloads/Telegram Desktop/ChatExport_2026-07-20";
const videos = [
  ["dar/messages4.html#message4113", darExport, "video_files/IMG_0293.MP4", "assets/videos/dar-messages4-4113.mp4"],
  ["dar/messages5.html#message4482", darExport, "video_files/IMG_2076.MOV", "assets/videos/dar-messages5-4482.mp4"],
  ["dar/messages3.html#message2853", darExport, "video_files/IMG_5871.MP4", "assets/videos/dar-messages3-2853.mp4"],
  ["dar/messages.html#message491", darExport, "video_files/IMG_9793.MP4", "assets/videos/dar-messages-491.mp4"],
  ["dar/messages4.html#message3417", darExport, "video_files/IMG_7768.MOV", "assets/videos/dar-messages4-3417.mp4"],
  ["dar/messages2.html#message1102", darExport, "video_files/IMG_1638.MOV", "assets/videos/dar-messages2-1102.mp4"],
  ["dar/messages3.html#message3100", darExport, "video_files/IMG_6663.MP4", "assets/videos/dar-messages3-3100.mp4"],
  ["dar/messages3.html#message2941", darExport, "video_files/IMG_6107.MP4", "assets/videos/dar-messages3-2941.mp4"],
  ["dar/messages3.html#message2696", darExport, "video_files/IMG_5401.MP4", "assets/videos/dar-messages3-2696.mp4"],
  ["dar/messages4.html#message3223", darExport, "video_files/IMG_7026.MP4", "assets/videos/dar-messages4-3223.mp4"],
  ["dar/messages5.html#message4290", darExport, "video_files/IMG_1215.MP4", "assets/videos/dar-messages5-4290.mp4"],
  ["dar/messages5.html#message4886", darExport, "video_files/IMG_4860.MP4", "assets/videos/dar-messages5-4886.mp4"],
  ["dar/messages3.html#message3133", darExport, "video_files/IMG_6762.MOV", "assets/videos/dar-messages3-3133.mp4"],
  ["dar/messages5.html#message4365", darExport, "video_files/IMG_1573.MOV", "assets/videos/dar-messages5-4365.mp4"],
  ["dar/messages3.html#message3181", darExport, "video_files/IMG_6893.MOV", "assets/videos/dar-messages3-3181.mp4"],
  ["dar/messages5.html#message4552", darExport, "video_files/IMG_2335.MP4", "assets/videos/dar-messages5-4552.mp4"],
  ["dar/messages4.html#message4111", darExport, "video_files/IMG_0290.MOV", "assets/videos/dar-messages4-4111.mp4"],
  ["dar/messages5.html#message4324", darExport, "video_files/IMG_1336.MP4", "assets/videos/dar-messages5-4324.mp4"],
  ["dar/messages2.html#message1575", darExport, "video_files/IMG_2867.MP4", "assets/videos/dar-messages2-1575.mp4"],
  ["dar/messages.html#message642", darExport, "video_files/IMG_0178.MP4", "assets/videos/dar-messages-642.mp4"],
  ["dar/messages5.html#message4914", darExport, "video_files/IMG_5006.MP4", "assets/videos/dar-messages5-4914.mp4"],
  ["dar/messages4.html#message4176", darExport, "video_files/IMG_0579.MP4", "assets/videos/dar-messages4-4176.mp4"],
  ["dar/messages.html#message984", darExport, "video_files/IMG_1276.MP4", "assets/videos/dar-messages-984.mp4"],
  ["dar/messages3.html#message2848", darExport, "video_files/IMG_5868.MP4", "assets/videos/dar-messages3-2848.mp4"],
  ["dar/messages5.html#message4278", darExport, "video_files/IMG_1167.MP4", "assets/videos/dar-messages5-4278.mp4"],
  ["dar/messages3.html#message2654", darExport, "video_files/IMG_5246.MP4", "assets/videos/dar-messages3-2654.mp4"],
  ["dar/messages5.html#message4647", darExport, "video_files/IMG_3054.MP4", "assets/videos/dar-messages5-4647.mp4"],
  ["dar/messages4.html#message4116", darExport, "video_files/IMG_0296.MP4", "assets/videos/dar-messages4-4116.mp4"],
  ["dar/messages4.html#message3327", darExport, "video_files/IMG_7514.MOV", "assets/videos/dar-messages4-3327.mp4"],
  ["dar/messages2.html#message1388", darExport, "video_files/IMG_2330.MP4", "assets/videos/dar-messages2-1388.mp4"],
  ["dar/messages4.html#message3191", darExport, "video_files/IMG_6902.MP4", "assets/videos/dar-messages4-3191.mp4"],
  ["dar/messages3.html#message2871", darExport, "video_files/IMG_5921.MP4", "assets/videos/dar-messages3-2871.mp4"],
  ["dar/messages4.html#message3705", darExport, "video_files/IMG_8833.MOV", "assets/videos/dar-messages4-3705.mp4"],
  ["dar/messages4.html#message3280", darExport, "video_files/IMG_7252.MP4", "assets/videos/dar-messages4-3280.mp4"],
  ["personal/messages.html#message561", darExport, "video_files/IMG_7255.MP4", "assets/videos/dar-messages4-3282.mp4"],
  ["dar/messages4.html#message3725", darExport, "video_files/IMG_8891.MP4", "assets/videos/dar-messages4-3725.mp4"],
  ["dar/messages4.html#message4218", darExport, "video_files/IMG_0808.MP4", "assets/videos/dar-messages4-4218.mp4"],
  ["dar/messages5.html#message4444", darExport, "video_files/IMG_1941.MP4", "assets/videos/dar-messages5-4444.mp4"],
  ["dar/messages4.html#message4063", darExport, "video_files/IMG_0143.MP4", "assets/videos/dar-messages4-4063.mp4"],
  ["dar/messages4.html#message3289", darExport, "video_files/IMG_7279.MP4", "assets/videos/dar-messages4-3289.mp4"],
  ["personal/messages.html#message503", personalExport, "video_files/IMG_7188.MP4", "assets/videos/personal-503.mp4"],
  ["personal/messages.html#message905", personalExport, "video_files/IMG_7916.MP4", "assets/videos/personal-905.mp4"],
];

for (const [reference, exportRoot, sourceRelative, targetRelative] of videos) {
  const source = path.join(exportRoot, sourceRelative);
  const target = path.join(root, targetRelative);
  if (!fs.existsSync(source)) throw new Error(`Missing source video: ${source}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) fs.copyFileSync(source, target);
  attachVideo(reference, targetRelative.replaceAll("\\", "/"));
}

for (const reference of [
  "dar/messages2.html#message1590",
  "dar/messages2.html#message1902",
  "dar/messages2.html#message1706",
  "dar/messages3.html#message3046",
  "dar/messages5.html#message4377",
  "dar/messages2.html#message1923",
  "dar/messages2.html#message1608",
  "dar/messages2.html#message1876",
  "dar/messages3.html#message2635",
]) markPrimarySourceNeeded(reference);

fs.writeFileSync(bankPath, markdown);
console.log(`Repaired ${path.relative(root, bankPath)} and attached ${videos.length} source videos.`);
