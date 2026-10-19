import { ethers, network } from "hardhat";

/**
 * Deploys PrivateVoting and (optionally) opens a demo proposal.
 *
 *   npx hardhat run scripts/deploy.ts --network eth-sepolia
 *
 * Env:
 *   DEMO_PROPOSAL_TITLE       - creates a proposal with this title when set
 *   DEMO_PROPOSAL_HOURS       - how long voting stays open (default 24)
 */
async function main() {
  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);

  console.log(`Network : ${network.name}`);
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance : ${ethers.formatEther(balance)} ETH`);

  const factory = await ethers.getContractFactory("PrivateVoting");
  const voting = await factory.deploy(deployer.address);
  await voting.waitForDeployment();

  const address = await voting.getAddress();
  console.log(`\nPrivateVoting deployed to: ${address}`);
  console.log(`\nAdd this to frontend/.env:\n  VITE_CONTRACT_ADDRESS=${address}\n`);

  const title = process.env.DEMO_PROPOSAL_TITLE;
  if (title) {
    const hours = Number(process.env.DEMO_PROPOSAL_HOURS ?? 24);
    const latest = await ethers.provider.getBlock("latest");
    const deadline = BigInt(latest!.timestamp) + BigInt(Math.round(hours * 3600));

    const tx = await voting.createProposal(title, deadline);
    await tx.wait();

    console.log(`Demo proposal #1 created: "${title}"`);
    console.log(`Voting closes at ${new Date(Number(deadline) * 1000).toISOString()}`);
  } else {
    console.log(`Tip: set DEMO_PROPOSAL_TITLE="Ship v2?" to open a proposal during deploy.`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
