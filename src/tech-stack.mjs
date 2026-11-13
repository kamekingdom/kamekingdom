export const README_START = "<!-- tech-stack:start -->";
export const README_END = "<!-- tech-stack:end -->";
export const SELECTION_START = "<!-- tech-stack-selection:start -->";
export const SELECTION_END = "<!-- tech-stack-selection:end -->";

export function catalogItems(catalog) {
  if (!Array.isArray(catalog?.categories) || catalog.categories.length === 0) {
    throw new Error("Tech Stack catalog must contain categories");
  }
  const seen = new Set();
  return catalog.categories.flatMap((category) => {
    if (typeof category.name !== "string" || !Array.isArray(category.items)) {
      throw new Error("Invalid Tech Stack category");
    }
    return category.items.map((item) => {
      if (typeof item.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id) || seen.has(item.id)) {
        throw new Error(`Invalid or duplicate Tech Stack ID: ${item.id}`);
      }
      if (typeof item.name !== "string" || !item.name.trim() || /[\r\n]/.test(item.name)) {
        throw new Error(`Invalid Tech Stack name: ${item.id}`);
      }
      if (item.badgeUrl) {
        const url = new URL(item.badgeUrl);
        if (url.protocol !== "https:" || url.hostname !== "img.shields.io" ||
            !url.pathname.startsWith("/badge/") || /[\s()]/.test(item.badgeUrl)) {
          throw new Error(`Invalid badge URL: ${item.id}`);
        }
      } else if (!/^[A-Fa-f0-9]{6}$/.test(item.color)) {
        throw new Error(`Invalid badge color: ${item.id}`);
      }
      seen.add(item.id);
      return item;
    });
  });
}

function markedRegion(text, start, end) {
  if (typeof text !== "string" || text.split(start).length !== 2 || text.split(end).length !== 2) {
    throw new Error(`Expected exactly one ${start} / ${end} block`);
  }
  const from = text.indexOf(start) + start.length;
  const to = text.indexOf(end);
  if (from > to) throw new Error("Tech Stack markers are out of order");
  return { from, to, content: text.slice(from, to) };
}

export function parseSelection(body, catalog, { requireComplete = true } = {}) {
  const allowed = new Set(catalogItems(catalog).map((item) => item.id));
  const { content } = markedRegion(body, SELECTION_START, SELECTION_END);
  const seen = new Set();
  const selected = new Set();
  for (const match of content.matchAll(/^- \[([ xX])\] .*?<!-- tech-stack:([a-z0-9-]+) -->\s*$/gm)) {
    const [, checked, id] = match;
    if (!allowed.has(id)) throw new Error(`Unknown Tech Stack ID: ${id}`);
    if (seen.has(id)) throw new Error(`Duplicate checklist ID: ${id}`);
    seen.add(id);
    if (checked.toLowerCase() === "x") selected.add(id);
  }
  if (requireComplete && seen.size !== allowed.size) {
    throw new Error(`Checklist is incomplete: found ${seen.size} of ${allowed.size} technologies`);
  }
  return selected;
}

const escapeMarkdown = (text) => text.replace(/[\\[\]]/g, "\\$&");
const escapeHtml = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export function badgeUrl(item) {
  if (item.badgeUrl) return item.badgeUrl;
  const label = encodeURIComponent(item.name.replaceAll("_", "__").replaceAll("-", "--"));
  return `https://img.shields.io/badge/${label}-${item.color}?style=for-the-badge`;
}

export function renderBadges(catalog, selected) {
  const allowed = new Set(catalogItems(catalog).map((item) => item.id));
  for (const id of selected) {
    if (!allowed.has(id)) throw new Error(`Unknown selected Tech Stack ID: ${id}`);
  }
  return catalog.categories.map((category) => category.items
    .filter((item) => selected.has(item.id))
    .map((item) => `![${escapeMarkdown(item.name)}](${badgeUrl(item)})`).join("\n"))
    .filter(Boolean).join("\n\n");
}

export function updateReadme(readme, catalog, selected) {
  const { from, to } = markedRegion(readme, README_START, README_END);
  return readme.slice(0, from) + "\n" + renderBadges(catalog, selected) + "\n" + readme.slice(to);
}

export function selectionFromReadme(readme, catalog) {
  const { content } = markedRegion(readme, README_START, README_END);
  return new Set(catalogItems(catalog)
    .filter((item) => content.includes(`](${badgeUrl(item)})`)).map((item) => item.id));
}

export function buildChecklist(catalog, selected) {
  // Validate selection before emitting a new management checklist.
  renderBadges(catalog, selected);
  const groups = catalog.categories.map((category) => `<details>\n<summary>${escapeHtml(category.name)}</summary>\n\n` +
    category.items.map((item) => `- [${selected.has(item.id) ? "x" : " "}] ${escapeMarkdown(item.name)} <!-- tech-stack:${item.id} -->`).join("\n") +
    "\n\n</details>");
  return `## READMEに表示するTech Stack\n\n` +
    `カテゴリを開き、READMEに掲載したい技術にチェックしてください。チェックを外すとREADMEからも消えます。保存後、GitHub ActionsがTech Stack欄だけを自動更新します。\n\n` +
    `初期選択は、元のREADMEに掲載されていた27項目です。追加候補は未選択です。候補に載っていることは、習得済みという意味ではありません。\n\n` +
    `このIssueは管理用です。完了として閉じずに使ってください。項目名の後ろの非表示IDと区切りコメントは削除しないでください。\n\n` +
    `${SELECTION_START}\n\n${groups.join("\n\n")}\n\n${SELECTION_END}\n\n` +
    `候補の追加・管理方法: [Tech Stack管理ガイド](https://github.com/kamekingdom/kamekingdom/blob/main/docs/tech-stack.md)\n`;
}

export async function syncTechStack({ catalog, loadIssue, loadReadme, saveReadme, dryRun = false }) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const selected = parseSelection(await loadIssue(), catalog);
    const file = await loadReadme();
    const after = updateReadme(file.content, catalog, selected);
    if (after === file.content || dryRun) {
      return { changed: after !== file.content, written: false, selectedCount: selected.size };
    }
    try {
      const result = await saveReadme({ readme: after, sha: file.sha });
      return { changed: true, written: true, selectedCount: selected.size, result };
    } catch (error) {
      if (error.status !== 409 || attempt === 2) throw error;
      // A concurrent commit won: re-read both selection and README before retrying.
    }
  }
}
