import assert from "node:assert/strict";
import { readdir, stat } from "node:fs/promises";

const assetsDirectory = new URL("../dist/assets/", import.meta.url);
const files = await readdir(assetsDirectory);
const javascriptFiles = files.filter((file) => file.endsWith(".js"));

assert.ok(javascriptFiles.length > 0, "Run npm run build before checking bundle sizes.");

const sizes = await Promise.all(
  javascriptFiles.map(async (file) => ({
    file,
    bytes: (await stat(new URL(file, assetsDirectory))).size,
  })),
);
const oversized = sizes.filter(({ bytes }) => bytes >= 500_000);

assert.deepEqual(
  oversized,
  [],
  `JavaScript chunks must stay below 500 kB:\n${oversized
    .map(({ file, bytes }) => `- ${file}: ${(bytes / 1000).toFixed(2)} kB`)
    .join("\n")}`,
);

console.log(`Bundle budget passed (${sizes.length} JavaScript chunks, all below 500 kB).`);
