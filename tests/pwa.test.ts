import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = fileURLToPath(new URL("../public", import.meta.url));

/** Reads width/height from a PNG's IHDR chunk */
function pngSize(file: string): string {
  const buf = readFileSync(join(PUBLIC, file));
  return `${buf.readUInt32BE(16)}x${buf.readUInt32BE(20)}`;
}

/** The app-shell list precached by the service worker */
function shellFiles(): string[] {
  const sw = readFileSync(join(PUBLIC, "sw.js"), "utf8");
  const list = sw.match(/const SHELL = \[([\s\S]*?)\];/);
  assert.ok(list, "SHELL list not found in sw.js");
  return [...list[1].matchAll(/"\.\/([^"]*)"/g)].map((m) => m[1]);
}

test("manifest has the fields Chrome needs to offer install", () => {
  const manifest = JSON.parse(readFileSync(join(PUBLIC, "manifest.webmanifest"), "utf8"));
  assert.ok(manifest.name);
  assert.ok(manifest.short_name);
  assert.ok(manifest.start_url);
  assert.equal(manifest.display, "standalone");

  const pngs = manifest.icons.filter((i: { type: string }) => i.type === "image/png");
  const sizes = pngs.map((i: { sizes: string }) => i.sizes);
  assert.ok(sizes.includes("192x192"), "needs a 192px icon");
  assert.ok(sizes.includes("512x512"), "needs a 512px icon");
  assert.ok(manifest.icons.some((i: { purpose?: string }) => i.purpose === "maskable"), "needs a maskable icon");
});

test("manifest icons exist with their declared sizes", () => {
  const manifest = JSON.parse(readFileSync(join(PUBLIC, "manifest.webmanifest"), "utf8"));
  for (const icon of manifest.icons) {
    assert.ok(existsSync(join(PUBLIC, icon.src)), `${icon.src} missing`);
    if (icon.type === "image/png") assert.equal(pngSize(icon.src), icon.sizes, icon.src);
  }
});

test("every precached file exists, or the service worker fails to install", () => {
  for (const file of shellFiles()) {
    const path = file === "" ? "index.html" : file;
    assert.ok(existsSync(join(PUBLIC, path)), `${path} is precached but missing`);
  }
});

test("every client script and stylesheet is precached", () => {
  const shell = new Set(shellFiles());
  const assets = readdirSync(PUBLIC).filter((f) => /\.(js|css)$/.test(f) && f !== "sw.js");
  for (const asset of assets) {
    assert.ok(shell.has(asset), `${asset} missing from SHELL in sw.js`);
  }
});
