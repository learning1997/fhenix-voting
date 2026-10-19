import type { BrowserProvider, Signer } from "ethers";

/** Ethereum Sepolia - the chain that carries the CoFHE coprocessor. */
export const SEPOLIA_CHAIN_ID = 11155111n;
export const SEPOLIA_CHAIN_ID_HEX = "0xaa36a7";

type CofheClientModule = typeof import("./cofheClient");
let clientModulePromise: Promise<CofheClientModule> | null = null;

function loadCofheClient(): Promise<CofheClientModule> {
  clientModulePromise ??= import("./cofheClient");
  return clientModulePromise;
}

/** Loads the CoFHE SDK only when a wallet connects, keeping the initial app bundle smaller. */
export async function connectCofhe(provider: BrowserProvider, signer: Signer): Promise<void> {
  const { Ethers6Adapter, cofhe } = await loadCofheClient();
  const { publicClient, walletClient } = await Ethers6Adapter(provider, signer);
  await cofhe.connect(publicClient, walletClient);
}

export function disconnectCofhe(): void {
  if (clientModulePromise) {
    void clientModulePromise.then(({ cofhe }) => cofhe.disconnect());
  }
}

/** Revokes the site's account permission when the injected wallet supports it. */
export async function revokeWalletPermission(ethereum: Eip1193Provider): Promise<boolean> {
  try {
    await ethereum.request({
      method: "wallet_revokePermissions",
      params: [{ eth_accounts: {} }],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Asks the injected wallet to switch to Sepolia (adding the network if it is unknown).
 */
export async function ensureSepolia(ethereum: Eip1193Provider): Promise<void> {
  try {
    await ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: SEPOLIA_CHAIN_ID_HEX }],
    });
  } catch (error) {
    const code = (error as { code?: number }).code;
    if (code !== 4902) throw error;

    await ethereum.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: SEPOLIA_CHAIN_ID_HEX,
          chainName: "Ethereum Sepolia",
          nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
          blockExplorerUrls: ["https://sepolia.etherscan.io"],
        },
      ],
    });
  }
}
