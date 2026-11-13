import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
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
