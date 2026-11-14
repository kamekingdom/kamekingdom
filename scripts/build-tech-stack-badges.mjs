import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { makeBadge } from "badge-maker";
import { catalogItems } from "../src/tech-stack.mjs";

const root = new URL("../", import.meta.url);
const catalog = JSON.parse(readFileSync(new URL("data/tech-stack.json", root), "utf8"));
const manifestPath = new URL("data/tech-stack-logo-sources.json", root);
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const refresh = process.argv.includes("--refresh");
const output = new URL("assets/tech-stack/", root);
const sources = new URL("assets/tech-stack/sources/", root);
mkdirSync(sources, { recursive: true });

function inkFor(hex) {
  const [r, g, b] = hex.match(/../g).map((x) => parseInt(x, 16));
  return r * 0.299 + g * 0.587 + b * 0.114 > 160 ? "#111111" : "#ffffff";
}

function categorySymbol(kind, ink) {
  const paths = {
    languages: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 18"/>',
    databases: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
    "data-science": '<path d="M4 3v18h17M8 17v-5m5 5V8m5 9V4"/>',
    ai: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>',
    cloud: '<path d="M6 19h12a5 5 0 0 0 0-10 7 7 0 0 0-13-1 5.5 5.5 0 0 0 1 11Z"/>',
    "mobile-desktop": '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>',
    backend: '<rect x="3" y="3" width="18" height="7" rx="1"/><rect x="3" y="14" width="18" height="7" rx="1"/><path d="M7 6h1m-1 11h1"/>',
  };
  const path = paths[kind] ?? '<path d="M3 6h18v13H3zM7 3v3m10-3v3M7 10h10m-10 5h6"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="${ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function tinted(svg, ink) {
  if (/<script|<foreignObject|(?:href|src)=["']https?:/i.test(svg)) {
    throw new Error("Logo SVG must be self-contained");
  }
  return svg
    .replace(/currentColor/g, ink)
    .replace(/(fill|stroke)=(['"])(?!none|transparent)([^'"]+)\2/g, (_, property) => `${property}="${ink}"`)
    .replace(/(fill|stroke)\s*:\s*(?!none|transparent)[^;"}]+/g, (_, property) => `${property}:${ink}`)
    .replace(/<svg\b(?![^>]*\bfill=)/, `<svg fill="${ink}"`);
}

// Source URLs and hashes are tracked; routine regeneration uses only cached files.
for (const [key, source] of Object.entries(manifest.sources)) {
  const extension = /\.png(?:$|\?)/.test(source.url) ? "png" : "svg";
  const path = new URL(`${key}.${extension}`, sources);
  if (refresh || !existsSync(path)) {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`Logo ${key}: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (extension === "svg" && !bytes.toString("utf8").includes("<svg")) {
      throw new Error(`Logo ${key} is not an SVG`);
    }
    if (extension === "png" && bytes.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
      throw new Error(`Logo ${key} is not a PNG`);
    }
    writeFileSync(path, bytes);
  }
  const bytes = readFileSync(path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (!refresh && source.sha256 && source.sha256 !== sha256) {
    throw new Error(`Logo source checksum changed: ${key}`);
  }
  source.file = `assets/tech-stack/sources/${key}.${extension}`;
  source.sha256 = sha256;
}
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

let count = 0;
for (const item of catalogItems(catalog)) {
  const ink = inkFor(item.color);
  let logo;
  let mime = "image/svg+xml";
  if (item.icon.provider === "simple-icons") {
    logo = tinted(readFileSync(new URL(import.meta.resolve(`simple-icons/icons/${item.icon.key}.svg`)), "utf8"), ink);
  } else if (item.icon.provider === "category") {
    logo = categorySymbol(item.icon.key, ink);
  } else {
    const source = manifest.sources[item.icon.key];
    if (!source) throw new Error(`Missing source: ${item.icon.key}`);
    if (source.file.endsWith(".png")) {
      logo = readFileSync(new URL(source.file, root));
      mime = "image/png";
    } else {
      logo = tinted(readFileSync(new URL(source.file, root), "utf8"), ink);
    }
  }
  const svg = makeBadge({
    message: item.name,
    color: item.color,
    style: "for-the-badge",
    logoBase64: `data:${mime};base64,${Buffer.from(logo).toString("base64")}`,
  });
  writeFileSync(new URL(item.badgePath, root), svg + "\n");
  count++;
}
console.log(`Generated ${count} self-contained Tech Stack badges`);
