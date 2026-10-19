import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@cofhe/hardhat-plugin";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * `localcofhe` is injected by @cofhe/hardhat-plugin. Sepolia networks are declared here so blank
 * optional RPC variables in `.env` fall back to the public endpoints. The plugin deploys mock contracts
 * automatically before `hardhat test` / `hardhat node`, enabling local FHE operations.
 */
const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      // CoFHE contracts need the Cancun EVM version.
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  cofhe: {
    gasWarning: false,
    mocksDeployVerbosity: "v",
  },
  defaultNetwork: "hardhat",
  networks: {
    // Explicit configs make empty optional .env values fall back to the public RPC endpoints.
    "eth-sepolia": {
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia.publicnode.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 11155111,
      gas: "auto",
      gasMultiplier: 1.2,
      gasPrice: "auto",
      timeout: 60000,
      httpHeaders: {},
    },
    "arb-sepolia": {
      url: process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 421614,
      gas: "auto",
      gasMultiplier: 1.2,
      gasPrice: "auto",
      timeout: 60000,
      httpHeaders: {},
    },
    // Base Sepolia has no CoFHE preset, so it is declared manually.
    "base-sepolia": {
      url: process.env.BASE_SEPOLIA_RPC_URL || "https://sepolia.base.org",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId: 84532,
      gasMultiplier: 1.2,
      timeout: 120000,
    },
  },
  etherscan: {
    apiKey: {
      "eth-sepolia": process.env.ETHERSCAN_API_KEY || "",
      "arb-sepolia": process.env.ARBISCAN_API_KEY || "",
      "base-sepolia": process.env.BASESCAN_API_KEY || "",
    },
  },
};

export default config;
