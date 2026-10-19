/**
 * Copies the compiled PrivateVoting ABI into the frontend so the browser build does not
 * need to reach into the Hardhat artifacts directory.
 *
 *   npm run export-abi
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const artifactPath = join(
  process.cwd(),
  "artifacts",
  "contracts",
  "PrivateVoting.sol",
  "PrivateVoting.json",
);
const outPath = join(process.cwd(), "frontend", "src", "lib", "PrivateVoting.abi.json");

try {
  const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact.abi, null, 2)}\n`);
  console.log(`Exported ${artifact.abi.length} ABI entries -> frontend/src/lib/PrivateVoting.abi.json`);
} catch (error) {
  console.error("Could not read the compiled artifact. Run `npm run compile` first.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
