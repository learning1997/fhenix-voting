import { Contract, JsonRpcProvider, type InterfaceAbi, type Provider, type Signer } from "ethers";
import abiJson from "./PrivateVoting.abi.json";

/** ABI exported from the compiled contract via `npm run export-abi`. */
const abi = abiJson as InterfaceAbi;

/** The deployed PrivateVoting address, injected at build time via frontend/.env. */
export const CONTRACT_ADDRESS = (import.meta.env.VITE_CONTRACT_ADDRESS ?? "").trim();

const READ_RPC =
  import.meta.env.VITE_SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";

/**
 * Read-only provider, so the proposal is visible before a wallet is connected.
 * Point `VITE_SEPOLIA_RPC_URL` at `http://127.0.0.1:8545` to read from a local Hardhat node.
 */
export const readProvider = new JsonRpcProvider(READ_RPC);

async function loadCofheTools() {
  const [sdk, { cofhe }] = await Promise.all([import("@cofhe/sdk"), import("./cofheClient")]);
  return { sdk, cofhe };
}

export interface ProposalView {
  id: bigint;
  title: string;
  deadline: bigint;
  ballotsCast: bigint;
  exists: boolean;
  resultsUnlocked: boolean;
  revealed: boolean;
  votingOpen: boolean;
}

export interface TallyResult {
  yes: bigint;
  no: bigint;
  yesSignature: string;
  noSignature: string;
}

export function readContract(provider: Provider = readProvider): Contract {
  return new Contract(CONTRACT_ADDRESS, abi, provider);
}

export function writeContract(signer: Signer): Contract {
  return new Contract(CONTRACT_ADDRESS, abi, signer);
}

export async function fetchProposals(count: bigint, provider?: Provider): Promise<ProposalView[]> {
  const contract = readContract(provider);
  const ids = Array.from({ length: Number(count) }, (_, i) => BigInt(i + 1));

  const proposals = await Promise.all(
    ids.map(async (id) => {
      const p = await contract.getProposal(id);
      return {
        id: p.id as bigint,
        title: p.title as string,
        deadline: p.deadline as bigint,
        ballotsCast: p.ballotsCast as bigint,
        exists: p.exists as boolean,
        resultsUnlocked: p.resultsUnlocked as boolean,
        revealed: p.revealed as boolean,
        votingOpen: p.votingOpen as boolean,
      } satisfies ProposalView;
    }),
  );

  return proposals.filter((p) => p.exists);
}

/**
 * Encrypts a yes/no ballot in the browser and proves it is well formed.
 *
 * The proof binds the ciphertext to this specific contract and to the connected account, so it
 * cannot be replayed anywhere else. `onStep` surfaces the five encryption stages to the UI.
 */
export async function encryptBallot(
  choice: 0 | 1,
  onStep?: (step: string, done: boolean) => void,
): Promise<{ handle: string; proof: string }> {
  const { sdk, cofhe } = await loadCofheTools();
  let builder = cofhe
    .encryptInputs([sdk.Encryptable.uint32(BigInt(choice))])
    .setConsumingContract(CONTRACT_ADDRESS);

  if (onStep) {
    builder = builder.onStep((step, ctx) => onStep(step, Boolean(ctx?.isEnd)));
  }

  const [handle, proof] = await builder.execute();
  return { handle, proof };
}

/**
 * Phase two of the reveal: asks the CoFHE Teecryptor for the plaintext tallies plus the
 * signatures that prove they came from the real ciphertexts.
 *
 * No ACP is needed because the contract called `FHE.allowPublic` on both tallies first.
 */
export async function decryptTallies(yesHandle: string, noHandle: string): Promise<TallyResult> {
  const { cofhe } = await loadCofheTools();
  const yes = await cofhe.decryptForTx(yesHandle).withoutACP().execute();
  const no = await cofhe.decryptForTx(noHandle).withoutACP().execute();

  return {
    yes: yes.decryptedValue,
    no: no.decryptedValue,
    yesSignature: yes.signature,
    noSignature: no.signature,
  };
}

/**
 * Lets a voter decrypt their *own* ballot. This uses an ACP (Access Control Permission), the
 * EIP-712 signature that authorises a specific account to read a specific ciphertext.
 */
export async function decryptMyBallot(ballotHandle: string): Promise<bigint> {
  const { sdk, cofhe } = await loadCofheTools();
  await cofhe.acp.getOrCreateSelfACP();
  const value = await cofhe.decryptForView(ballotHandle, sdk.FheTypes.Uint32).execute();
  return value as bigint;
}
