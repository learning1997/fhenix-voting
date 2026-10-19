import { ethers } from "ethers";

/**
 * Generates a throwaway wallet for testnet use.
 *
 *   npx hardhat run scripts/wallet.ts
 *
 * Fund the printed address from a Sepolia faucet, then put the key in .env as PRIVATE_KEY.
 */
function main() {
  const wallet = ethers.Wallet.createRandom();

  console.log("New testnet wallet\n");
  console.log(`Address    : ${wallet.address}`);
  console.log(`Private key: ${wallet.privateKey}`);
  console.log(`\nMnemonic   : ${wallet.mnemonic?.phrase}\n`);
  console.log("Next steps:");
  console.log("  1. Fund the address with Sepolia ETH (https://sepoliafaucet.com or https://sepolia-faucet.pk910.de)");
  console.log("  2. Add the key to .env as PRIVATE_KEY=0x...");
  console.log("  3. npm run deploy:sepolia");
}

main();
