import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  README_START, README_END, buildChecklist, catalogItems, parseSelection,
  renderBadges, selectionFromReadme, syncTechStack, updateReadme,
} from "../src/tech-stack.mjs";

const catalog = { categories: [
  { name: "Languages", items: [
    { id: "cpp", name: "C++", badgeUrl: "https://img.shields.io/badge/C%2B%2B-00599C?style=for-the-badge&logo=c%2B%2B&logoColor=white" },
    { id: "typescript", name: "TypeScript", color: "3178C6" },
  ] },
  { name: "Containers", items: [{ id: "docker", name: "Docker", color: "2496ED" }] },
] };
const selected = new Set(["cpp", "docker"]);
const source = `Profile introduction\n${README_START}\nold badges\n${README_END}\nContribution image\n`;

test("checkboxes round trip across categories, including upper-case checks and CRLF", () => {
  const body = buildChecklist(catalog, selected).replaceAll("[x]", "[X]").replaceAll("\n", "\r\n");
  assert.deepEqual(parseSelection(body, catalog), selected);
});

test("only selected badges are rendered with stable URLs and grouping", () => {
  assert.equal(renderBadges(catalog, selected),
    "![C++](https://img.shields.io/badge/C%2B%2B-00599C?style=for-the-badge&logo=c%2B%2B&logoColor=white)\n\n" +
    "![Docker](https://img.shields.io/badge/Docker-2496ED?style=for-the-badge)");
  const changed = parseSelection(buildChecklist(catalog, selected).replace("[ ] TypeScript", "[x] TypeScript"), catalog);
  assert.match(renderBadges(catalog, changed), /!\[TypeScript\]/);
});

test("sync preserves every character outside the badge block and ignores issue prose", () => {
  const body = "# Unrelated issue text\n![untrusted](https://example.com)\n" + buildChecklist(catalog, selected);
  const result = updateReadme(source, catalog, parseSelection(body, catalog));
  assert.equal(result, `Profile introduction\n${README_START}\n${renderBadges(catalog, selected)}\n${README_END}\nContribution image\n`);
  assert.doesNotMatch(result, /example\.com|Unrelated/);
  assert.equal(updateReadme(result, catalog, selected), result);
});

test("unchecking everything removes badges while retaining the profile", () => {
  const selection = parseSelection(buildChecklist(catalog, new Set()), catalog);
  assert.equal(selection.size, 0);
  assert.equal(updateReadme(source, catalog, selection),
    `Profile introduction\n${README_START}\n\n${README_END}\nContribution image\n`);
});

test("unknown, duplicate, missing, and malformed selections are rejected", () => {
  const body = buildChecklist(catalog, selected);
  for (const modified of [
    body.replace("tech-stack:cpp", "tech-stack:unknown"),
    body.replace("tech-stack:typescript", "tech-stack:cpp"),
    body.replace(/^- \[ \] TypeScript.*\n/m, ""),
    body.replace("tech-stack-selection:end", "removed"),
    body + "\n<!-- tech-stack-selection:start -->",
  ]) {
    assert.throws(() => parseSelection(modified, catalog));
  }
  assert.throws(() => updateReadme("No generated block", catalog, selected));
});

test("catalog maintenance preserves old checks and introduces new items unchecked", () => {
  const expanded = structuredClone(catalog);
  expanded.categories[0].items.push({ id: "rust", name: "Rust", color: "000000" });
  const oldBody = buildChecklist(catalog, selected);
  assert.throws(() => parseSelection(oldBody, expanded), /incomplete/);
  const preserved = parseSelection(oldBody, expanded, { requireComplete: false });
  const newBody = buildChecklist(expanded, preserved);
  assert.deepEqual(parseSelection(newBody, expanded), selected);
  assert.match(newBody, /- \[ \] Rust/);
});

test("invalid catalog IDs, colors, duplicate IDs, and external badge hosts fail", () => {
  for (const patch of [
    { id: undefined }, { id: "docker" }, { badgeUrl: "https://example.com/badge/evil" },
    { badgeUrl: undefined, color: "not-a-color" },
  ]) {
    const invalid = structuredClone(catalog);
    Object.assign(invalid.categories[0].items[0], patch);
    assert.throws(() => catalogItems(invalid));
  }
});

test("the real catalog and current README preserve badge appearance when regenerated", () => {
  const realCatalog = JSON.parse(readFileSync(new URL("../data/tech-stack.json", import.meta.url), "utf8"));
  const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const current = selectionFromReadme(readme, realCatalog);
  assert.deepEqual(parseSelection(buildChecklist(realCatalog, current), realCatalog), current);
  assert.equal(updateReadme(readme, realCatalog, current), readme);
});

test("unchanged content and dry runs never create commits", async () => {
  for (const dryRun of [false, true]) {
    const result = await syncTechStack({
      catalog,
      loadIssue: async () => buildChecklist(catalog, selected),
      loadReadme: async () => ({ content: dryRun ? source : updateReadme(source, catalog, selected), sha: "old" }),
      saveReadme: async () => assert.fail("must not create a commit"),
      dryRun,
    });
    assert.equal(result.written, false);
    assert.equal(result.changed, dryRun);
  }
});

test("invalid management data cannot overwrite the README", async () => {
  await assert.rejects(syncTechStack({
    catalog,
    loadIssue: async () => "Issue body was accidentally removed",
    loadReadme: async () => assert.fail("must reject before loading README"),
    saveReadme: async () => assert.fail("must not overwrite README"),
  }), /Expected exactly one/);
});

test("conflicts re-read the latest selection and preserve concurrent profile changes", async () => {
  let loads = 0;
  let writes = 0;
  const result = await syncTechStack({
    catalog,
    loadIssue: async () => buildChecklist(catalog, ++loads === 1 ? selected : new Set(["typescript"])),
    loadReadme: async () => ({ content: loads === 1 ? source : source.replace("Profile introduction", "Updated biography"), sha: `sha-${loads}` }),
    saveReadme: async ({ readme, sha }) => {
      if (++writes === 1) throw Object.assign(new Error("Conflict"), { status: 409 });
      assert.equal(sha, "sha-2");
      assert.match(readme, /^Updated biography/);
      assert.match(readme, /!\[TypeScript\]/);
      assert.doesNotMatch(readme, /!\[C\+\+\]|!\[Docker\]/);
      return { commit: { html_url: "https://github.com/example/commit/updated" } };
    },
  });
  assert.equal(result.written, true);
  assert.equal(result.selectedCount, 1);
  assert.equal(writes, 2);
});

test("permission errors do not retry and repeated conflicts have a bound", async () => {
  for (const [status, expected] of [[403, 1], [409, 3]]) {
    let writes = 0;
    await assert.rejects(syncTechStack({
      catalog,
      loadIssue: async () => buildChecklist(catalog, selected),
      loadReadme: async () => ({ content: source, sha: "old" }),
      saveReadme: async () => {
        writes++;
        throw Object.assign(new Error("Write failed"), { status });
      },
    }), /Write failed/);
    assert.equal(writes, expected);
  }
});
