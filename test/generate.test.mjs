import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const entrypoint = fileURLToPath(new URL("../src/generate.mjs", import.meta.url));

test("demo CLI writes an SVG without credentials, including to a path with spaces", () => {
  const directory = mkdtempSync(join(tmpdir(), "pacman-test-"));
  const out = join(directory, "demo output");
  try {
    const result = spawnSync(process.execPath, [entrypoint, "--demo", "--out", out], {
      encoding: "utf8",
      env: { ...process.env, GH_USERNAME: "", GITHUB_TOKEN: "" },
    });
    assert.equal(result.status, 0, result.stderr);
    const svg = readFileSync(join(out, "pacman-contributions.svg"), "utf8");
    assert.match(svg, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
    assert.doesNotMatch(svg, /NaN|Infinity|undefined/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("live CLI rejects missing credentials before creating output", () => {
  const directory = mkdtempSync(join(tmpdir(), "pacman-test-"));
  const out = join(directory, "missing");
  try {
    const result = spawnSync(process.execPath, [entrypoint, "--out", out], {
      encoding: "utf8",
      env: { ...process.env, GH_USERNAME: "", GITHUB_TOKEN: "" },
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Need --user/);
    assert.equal(existsSync(out), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("API failures leave an existing SVG unchanged and keep credentials out of CLI output", () => {
  const directory = mkdtempSync(join(tmpdir(), "pacman-test-"));
  const filename = join(directory, "pacman-contributions.svg");
  const original = '<svg xmlns="http://www.w3.org/2000/svg"><title>Existing output</title></svg>';
  const token = "fixture-secret-token";
  const failures = [
    "globalThis.fetch = async () => new Response('Denied fixture-secret-token', {status: 403})",
    "globalThis.fetch = async () => new Response('{broken json')",
    "globalThis.fetch = async () => Response.json({data:{user:{contributionsCollection:{contributionCalendar:{weeks:[{contributionDays:[{weekday:8,contributionCount:1}]}]}}}}})",
    "globalThis.fetch = async () => { throw new Error('Connection failed fixture-secret-token') }",
  ];
  try {
    for (const preload of failures) {
      writeFileSync(filename, original);
      const result = spawnSync(process.execPath, [
        "--import", `data:text/javascript,${encodeURIComponent(preload)}`,
        entrypoint, "--out", directory,
      ], {
        encoding: "utf8",
        env: { ...process.env, GH_USERNAME: "example", GITHUB_TOKEN: token },
      });
      assert.equal(result.status, 1, result.stdout);
      assert.equal(readFileSync(filename, "utf8"), original);
      assert.doesNotMatch(result.stdout + result.stderr, /fixture-secret-token/);
      assert.doesNotMatch(result.stdout, /Wrote/);
      assert.match(result.stderr, /GitHub API 403|invalid JSON|invalid weekday|Connection failed/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
