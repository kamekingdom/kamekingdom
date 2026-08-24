import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { demoCalendar, fetchCalendar } from "./contributions.mjs";
import { buildSvg } from "./svg.mjs";

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const out = value("--out", "dist");
const demo = has("--demo");
const username = value("--user", process.env.GH_USERNAME);
const token = process.env.GITHUB_TOKEN;

if (!demo && (!username || !token)) {
  console.error("Need --user (or GH_USERNAME) and GITHUB_TOKEN env var.");
  process.exit(1);
}

const grid = demo ? demoCalendar() : await fetchCalendar({ username, token });
const filename = "pacman-contributions.svg";

mkdirSync(out, { recursive: true });
const svg = buildSvg(grid);
writeFileSync(join(out, filename), svg);
console.log(`Wrote ${join(out, filename)} (${(svg.length / 1024).toFixed(1)} KB)`);
