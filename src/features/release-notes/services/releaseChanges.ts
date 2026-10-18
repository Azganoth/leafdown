export interface ReleaseChangeGroup {
  name: string;
  entries: string[];
  rest: string;
}

const GROUP_HEADING = /^### +(.+?) *$/u;
const ENTRY = /^[-*+] +/u;
const CONTINUATION = /^ {2,}\S/u;

const sentenceSegmenter = new Intl.Segmenter("en", { granularity: "sentence" });

export const getReleaseChangeGroups = (notes: string): ReleaseChangeGroup[] => {
  const groups: ReleaseChangeGroup[] = [];
  let group: ReleaseChangeGroup | null = null;
  let rest: string[] = [];
  let inEntry = false;

  const finish = () => {
    if (group) {
      group.rest = rest.join("\n").trim();
      if (group.entries.length || group.rest) {
        groups.push(group);
      }
    }
    rest = [];
  };

  for (const line of notes.split(/\r?\n/u)) {
    const heading = GROUP_HEADING.exec(line);
    if (heading) {
      finish();
      group = { name: heading[1], entries: [], rest: "" };
      inEntry = false;
    } else if (!group) {
      continue;
    } else if (ENTRY.test(line)) {
      group.entries.push(line.replace(ENTRY, ""));
      inEntry = true;
    } else if (inEntry && CONTINUATION.test(line)) {
      group.entries[group.entries.length - 1] += ` ${line.trim()}`;
    } else {
      inEntry = false;
      if (line.trim() || rest.length) {
        rest.push(line);
      }
    }
  }
  finish();
  return groups;
};

// Code spans and link destinations can hold periods that do not end a sentence, so they are
// masked before segmenting. The mask keeps every offset, which lets the split use the source.
const maskNonProse = (entry: string) =>
  entry
    .replace(/`+[^`]*`+/gu, (code) => "x".repeat(code.length))
    .replace(/\]\([^)]*\)/gu, (destination) => "x".repeat(destination.length));

export const splitLeadSentence = (entry: string): [lead: string, rest: string] => {
  const first = sentenceSegmenter.segment(maskNonProse(entry))[Symbol.iterator]().next();
  if (first.done) {
    return [entry, ""];
  }
  const end = first.value.segment.length;
  const lead = entry.slice(0, end).trimEnd();
  const opensMarkup =
    (lead.match(/\*\*/gu)?.length ?? 0) % 2 === 1 ||
    (lead.match(/\[/gu)?.length ?? 0) !== (lead.match(/\]/gu)?.length ?? 0);
  return opensMarkup ? ["", entry] : [lead, entry.slice(end).trimStart()];
};
