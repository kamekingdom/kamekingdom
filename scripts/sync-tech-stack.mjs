import { readFileSync } from "node:fs";
import { buildChecklist, parseSelection, selectionFromReadme, syncTechStack } from "../src/tech-stack.mjs";

const root = new URL("../", import.meta.url);
const catalog = JSON.parse(readFileSync(new URL("data/tech-stack.json", root), "utf8"));
const args = process.argv.slice(2);

if (args.includes("--checklist")) {
  const index = args.indexOf("--issue-file");
  const selected = index >= 0
    ? parseSelection(readFileSync(args[index + 1], "utf8"), catalog, { requireComplete: false })
    : selectionFromReadme(readFileSync(new URL("README.md", root), "utf8"), catalog);
  process.stdout.write(buildChecklist(catalog, selected));
} else {
  const config = JSON.parse(readFileSync(new URL("data/tech-stack-config.json", root), "utf8"));
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository ?? "") || !token) {
    throw new Error("GITHUB_REPOSITORY and GITHUB_TOKEN are required");
  }
  const base = `https://api.github.com/repos/${repository}`;
  async function request(path, options = {}) {
    const response = await fetch(base + path, {
      ...options,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      const error = new Error(`GitHub API ${response.status} for ${path}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  }
  const result = await syncTechStack({
    catalog,
    dryRun: args.includes("--dry-run"),
    loadIssue: async () => {
      const issue = await request(`/issues/${config.issueNumber}`);
      if (issue.pull_request) throw new Error("Tech Stack management must be an issue, not a PR");
      return issue.body;
    },
    loadReadme: async () => {
      const file = await request(`/contents/README.md?ref=${encodeURIComponent(config.branch)}`);
      if (file.encoding !== "base64" || typeof file.content !== "string") {
        throw new Error("Expected a base64 README response");
      }
      return { content: Buffer.from(file.content, "base64").toString("utf8"), sha: file.sha };
    },
    saveReadme: ({ readme, sha }) => request("/contents/README.md", {
      method: "PUT",
      body: JSON.stringify({
        message: `docs: sync selected Tech Stack (#${config.issueNumber})`,
        branch: config.branch,
        sha,
        content: Buffer.from(readme).toString("base64"),
      }),
    }),
  });
  const status = result.written ? `Updated README: ${result.result.commit.html_url}`
    : result.changed ? "README would be updated" : "README is up to date";
  console.log(`${status} (${result.selectedCount} technologies selected)`);
}
