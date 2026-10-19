import { Ethers6Adapter } from "@cofhe/sdk/adapters";
import { chains } from "@cofhe/sdk/chains";
import { createCofheClient, createCofheConfig } from "@cofhe/sdk/web";

const config = createCofheConfig({
  supportedChains: [chains.sepolia],
  // Keep proving inline; the SDK reports encryption progress to the UI.
  useWorkers: false,
});

/** One CoFHE client for the whole app, mirroring the connected wallet. */
export const cofhe = createCofheClient(config);

export { Ethers6Adapter };
