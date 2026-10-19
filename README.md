# Private On-Chain Voting — Fhenix CoFHE

A decentralized voting dApp where **individual ballots are never revealed**. Votes are encrypted in the
browser, tallied on-chain while still encrypted, and only the two final sums are decrypted — after the
deadline, by the owner, with a cryptographic proof that the numbers are genuine.

Built on **Fhenix CoFHE** (Fully Homomorphic Encryption coprocessor) and deployed to **Ethereum Sepolia**.

---

## Table of contents

- [What it does](#what-it-does)
- [Why FHE keeps your vote private](#why-fhe-keeps-your-vote-private)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Repo layout](#repo-layout)
- [Prerequisites](#prerequisites)
- [Quick start](#quick-start)
- [Using the app](#using-the-app)
- [Contract API](#contract-api)
- [The reveal flow, step by step](#the-reveal-flow-step-by-step)
- [Security model & limitations](#security-model--limitations)
- [Gas](#gas)
- [Troubleshooting](#troubleshooting)
- [Notes on the older Fhenix API](#notes-on-the-older-fhenix-api)
- [Resources](#resources)

---

## What it does

| Feature | Where |
| --- | --- |
| Owner opens a proposal with a title and a voting deadline | `createProposal` |
| Anyone casts an **encrypted** yes/no ballot | `vote` |
| One ballot per address, enforced on-chain | `hasVoted` mapping |
| Tally accumulates **without decrypting anything** | `FHE.add` |
| Live counter of ballots cast (count only, never the split) | `ballotsCast` |
| After the deadline the owner unlocks + reveals the tally | `unlockResults` → `revealResults` |
| Voter can decrypt **their own** ballot to confirm it landed | `getMyBallot` + ACP |
| `VoteCast` / `ResultRevealed` events | contract events |

The frontend shows a live countdown, a live *encrypted* ballot counter, an in-browser "your vote is private
and encrypted" confirmation, an owner-only Reveal button, and the final tally once it is published.

---

## Why FHE keeps your vote private

Fully Homomorphic Encryption lets a program compute on data **without being able to read it**. CoFHE brings
that to an ordinary EVM chain: your contract writes normal Solidity, but some of its variables hold
ciphertexts instead of numbers.

### The locked-box analogy

1. **You encrypt on your own device.** The browser (via `@cofhe/sdk`) encrypts `1` (yes) or `0` (no) and
   produces a ciphertext plus a zero-knowledge proof that the ciphertext is well formed. Only that
   ciphertext ever leaves your machine. The plaintext never touches the network, the RPC, or the mempool.
2. **The contract receives a handle, not a number.** An `euint32` in Solidity is a `bytes32` *handle* — an
   identifier pointing at a ciphertext the CoFHE coprocessor holds. A handle reveals nothing. It sits in
   storage, calldata and event logs, and is completely opaque.
3. **The tally is added while still encrypted.** `FHE.add(yesVotes, ballot)` asks the coprocessor to add two
   ciphertexts. It returns a new ciphertext. At no point does any component hand the contract a plaintext,
   and the contract holds no decryption key.
4. **Only the totals are ever opened.** Once the deadline passes, the owner marks the two tallies publicly
   decryptable. The CoFHE Teecryptor (a hardware-attested service) returns the plaintexts plus a signature,
   and the contract verifies that signature on-chain before accepting the numbers.

### What is public vs. private

| Public forever | Private (until/unless revealed) |
| --- | --- |
| That address `0xabc…` voted | *How* `0xabc…` voted |
| When each ballot was cast | The running yes/no split during voting |
| The total number of ballots cast | Individual ballots — these stay encrypted permanently |
| The final yes/no sums, after the reveal | |

The **live counter** in the UI deliberately shows only the number of ballot ciphertexts recorded. That is
public information (it is just the length of a storage counter). The interesting number — the split — is
unreadable to everyone, including the contract, until the reveal.

### Why the reveal can be trusted

The owner cannot lie about the result. `FHE.publishDecryptResult` verifies a Teecryptor signature over
`(ciphertext handle, plaintext)` before storing anything, so a fabricated tally is rejected on-chain. There
is a test for exactly this in [`test/PrivateVoting.test.ts`](test/PrivateVoting.test.ts).

### Why the mid-vote tally leaks nothing

Encrypted addition is deterministic inside the coprocessor, but the on-chain ciphertext is opaque. Watching
a voter's transaction tells you they voted; it does not tell you how, and it does not move the visible
numbers. There is no partial result, no exit poll, and no way to vote strategically off other people's
choices.

---

## Architecture

```
┌──────────────────────────── your browser ────────────────────────────┐
│  React + ethers.js                                                   │
│                                                                      │
│   1. user clicks Vote Yes                                            │
│   2. @cofhe/sdk encrypts 1  ──►  ciphertext + ZK proof               │
│   3. The connected EVM wallet sends (handle, proof) to the contract │
└───────────────────────────────┬──────────────────────────────────────┘
                                │
┌───────────────────────────────▼──────────────────────────────────────┐
│  PrivateVoting.sol  (Ethereum Sepolia)                               │
│                                                                      │
│   euint32 yesVotes   ← FHE.add(yesVotes, ballot)   [never decrypted] │
│   euint32 noVotes    ← FHE.add(noVotes, 1-ballot)  [never decrypted] │
│   uint32  ballotsCast                              [public counter]  │
└───────────────────────────────┬──────────────────────────────────────┘
                                │ FHE op requested
┌───────────────────────────────▼──────────────────────────────────────┐
│  CoFHE coprocessor                                                   │
│   ZK Verifier    – validates encrypted inputs                        │
│   TaskManager    – runs FHE ops off-chain, commits results on-chain   │
│   ACL            – decides who may touch which handle                 │
│   Teecryptor     – TEE-backed decryption, signs results               │
└──────────────────────────────────────────────────────────────────────┘

Later, after the deadline:
   owner → allowPublic(tallies) → Teecryptor decrypts → owner publishes
   (plaintext + signature) → contract verifies signature → ResultRevealed
```

---

## Tech stack

| Layer | Choice |
| --- | --- |
| Smart contract | Solidity `0.8.28`, `@fhenixprotocol/cofhe-contracts` 1.0.1 (`FHE.sol`) |
| Dev / test | Hardhat 2 + `@cofhe/hardhat-plugin` 1.0.0 (mock coprocessor, no Docker needed) |
| Client SDK | `@cofhe/sdk` 1.0.0 (`@cofhe/sdk/web`, `/adapters`, `/chains`) |
| Frontend | React 18 + TypeScript + Vite 5, **ethers v6** |
| Wallet | Injected EIP-1193 EVM wallet (e.g. MetaMask, Rabby) |
| Network | **Ethereum Sepolia** (chain ID `11155111`) |

> **Note on networks:** the prompt mentions Fhenix Helium. Helium has been retired and is no longer in the
> SDK's supported chain list. The current CoFHE testnets are Ethereum Sepolia, Arbitrum Sepolia, Base
> Sepolia, and a local devnet. This project targets **Ethereum Sepolia**, which is also what the prompt's
> primary requirement asks for. Switching to Arbitrum Sepolia only means changing `chains.sepolia` →
> `chains.arbSepolia` and the network name in the deploy scripts.

---

## Repo layout

```
voting-dao/
├── contracts/
│   └── PrivateVoting.sol          # the FHE voting contract
├── test/
│   └── PrivateVoting.test.ts      # 20 tests, incl. the full reveal flow
├── scripts/
│   ├── deploy.ts                  # deploy (+ optionally open a demo proposal)
│   ├── wallet.ts                  # generate a throwaway testnet key
│   └── export-abi.mjs             # copy the ABI into the frontend
├── hardhat.config.ts
├── frontend/
│   ├── src/
│   │   ├── lib/cofhe.ts           # CoFHE client + wallet plumbing
│   │   ├── lib/voting.ts          # encrypt / decrypt / read helpers
│   │   ├── components/            # ProposalCard, ResultsPanel, PrivacyExplainer, …
│   │   └── App.tsx
│   └── vite.config.ts
└── README.md
```

---

## Prerequisites

- **Node.js 20+**
- **An injected EIP-1193 EVM wallet** (for example MetaMask, Rabby, or Coinbase Wallet extension)
- **Sepolia ETH** for gas — see [faucets](https://sepoliafaucet.com)

### Windows

Hardhat's local EVM (`@nomicfoundation/edr`) is a native module and needs the **Microsoft Visual C++
Redistributable (x64)**. Without it `npx hardhat test` fails with:

```
Error: The specified module could not be found.
...\edr-win32-x64-msvc\edr.win32-x64-msvc.node
```

Install it from <https://aka.ms/vs/17/release/vc_redist.x64.exe>, then re-run the tests. (If you cannot
install it, the contract still compiles and deploys — only the local in-process EVM needs it.)

---

## Quick start

### 1. Contracts

```bash
npm install
npm run compile
npm test
```

`npm test` runs against the **mock coprocessor** that `@cofhe/hardhat-plugin` deploys automatically — no
Docker, no testnet, no keys needed. It exercises encryption, homomorphic tallying, ACL denials, the
deadline, double-vote prevention, and the full two-phase reveal.

### 2. Fund a deployer wallet

```bash
npm run wallet                  # prints a fresh address + private key
```

Send Sepolia ETH to that address, then create `.env` from the template:

```bash
cp .env.example .env            # then set PRIVATE_KEY=0x...
```

Faucets: <https://sepoliafaucet.com> · <https://sepolia-faucet.pk910.de>

### 3. Deploy to Sepolia

```bash
npm run deploy:sepolia
```

To open a proposal at the same time:

```bash
# PowerShell
$env:DEMO_PROPOSAL_TITLE="Ship treasury v2?"; $env:DEMO_PROPOSAL_HOURS="24"; npm run deploy:sepolia
```

The script prints the deployed address.

### 4. Frontend

```bash
cd frontend
npm install
cp .env.example .env            # set VITE_CONTRACT_ADDRESS=0x...
npm run dev                     # http://localhost:5173
npm test                        # frontend regression tests
npm run build                   # type-check and production build
```

If you redeploy the contract, refresh the ABI copy:

```bash
npm run export-abi              # from the repo root
```

---

## Using the app

1. **Connect an EVM wallet.** The app asks to switch to Sepolia (and offers to add the network if it is missing).
2. **Read the proposal** — title, live countdown, and the live encrypted ballot counter.
3. **Vote Yes / Vote No.** Your browser encrypts the choice (a 5-stage progress list is shown: `InitTfhe`,
   `FetchKeys`, `Pack`, `Prove`, `Verify`), then your wallet asks you to send the ciphertext + proof.
4. **Confirmation.** You get the *"Your vote is private and encrypted"* message. Because the contract
   granted you access to your own ballot, you can also click **Confirm my encrypted ballot** — this uses an
   ACP (an EIP-712 signature) to decrypt *only your own* ciphertext locally. Nobody else can do this; there
   is a test that asserts a third party is refused.
5. **After the deadline**, the **Reveal results** button appears for the owner only. It runs the
   three-stage flow described below and then the tally is displayed with counts and percentages.
6. The **"Why is this private?"** panel in the UI explains all of the above in plain language.

---

## Contract API

`contracts/PrivateVoting.sol`

### Write

| Function | Access | Description |
| --- | --- | --- |
| `createProposal(string title, uint64 deadline)` | owner | Opens a proposal. `deadline` is a unix timestamp in the future. |
| `cancelProposal(uint256 id)` | owner | Retires a proposal: it stops accepting votes and is hidden from the app. One-way. |
| `vote(uint256 id, externalEuint32 encryptedVote, bytes proof)` | anyone | Casts an encrypted `1`/`0`. Reverts if closed, unknown, or already voted. |
| `unlockResults(uint256 id)` | owner, after deadline | `FHE.allowPublic` on both tallies. Phase 1 of the reveal. |
| `revealResults(uint256 id, uint32 yes, bytes yesSig, uint32 no, bytes noSig)` | owner | Verifies and publishes the decrypted sums. Phase 2. |

### Read

| Function | Returns |
| --- | --- |
| `getProposal(uint256 id)` | title, deadline, `ballotsCast`, status flags, `votingOpen` |
| `getEncryptedTally(uint256 id)` | the two `euint32` handles (opaque identifiers) |
| `getMyBallot(uint256 id)` | the caller's own encrypted ballot |
| `hasVoted(uint256 id, address)` | whether that address already voted |
| `revealedYes` / `revealedNo` | plaintext sums, `0` until revealed |
| `proposalCount` / `owner` | counters / admin address |

### Events

```solidity
event ProposalCreated(uint256 indexed proposalId, string title, uint64 deadline);
event VoteCast(uint256 indexed proposalId, address indexed voter, bytes32 encryptedBallot);
event ResultsUnlocked(uint256 indexed proposalId);
event ResultRevealed(uint256 indexed proposalId, uint32 yesVotes, uint32 noVotes);
```

`VoteCast` carries a **handle**, not a choice. Note that the handle in the event differs from the handle the
client submitted: every FHE operation produces a new ciphertext with a fresh handle (this contract
normalises the ballot with `FHE.select`, which is one such operation). A handle identifies one specific
ciphertext — it is not a stand-in for the value.

### How a ballot is tallied

```solidity
// 1. verify the client's ciphertext + proof and get a usable encrypted value
euint32 rawVote = FHE.asEuint32(encryptedVote, inputProof);

// 2. you cannot `require` on encrypted data, so normalise instead:
//    anything that is not 0 or 1 is folded down to 0 (no)
ebool  isValid = FHE.lte(rawVote, FHE.asEuint32(1));
euint32 ballot = FHE.select(isValid, rawVote, FHE.asEuint32(0));

// 3. add to the encrypted tallies - no decryption anywhere
yesVotes = FHE.add(yesVotes, ballot);
noVotes  = FHE.add(noVotes, FHE.sub(FHE.asEuint32(1), ballot));
```

Without step 2 a malicious client could submit `1000` and skew the tally, because `require` cannot inspect
an encrypted value. Normalising homomorphically closes that hole.

---

## The reveal flow, step by step

CoFHE decryption is deliberately **two-phase**, because a smart contract cannot decrypt anything by itself.

```
PHASE 1 — on-chain, owner, one transaction
  unlockResults(id)
      FHE.allowPublic(yesVotes)
      FHE.allowPublic(noVotes)
  → anyone may now request these ciphertexts off-chain. Nothing is published yet.

PHASE 2 — off-chain, client
  client.decryptForTx(yesHandle).withoutACP().execute()
  client.decryptForTx(noHandle).withoutACP().execute()
  → { decryptedValue, signature }   (signature comes from the CoFHE Teecryptor)

PHASE 3 — on-chain, owner, one transaction
  revealResults(id, yes, yesSig, no, noSig)
      FHE.publishDecryptResult(yesVotes, yes, yesSig)   // verifies the signature
      FHE.publishDecryptResult(noVotes,  no,  noSig)
  → emits ResultRevealed, stores the plaintexts
```

`.withoutACP()` is correct here because `allowPublic` was called: there is no ACL restriction left to
satisfy, and it does not matter *who* submits the reveal, only that the signature verifies.

In the UI this is one button and three progress lines.

---

## Security model & limitations

**Trusted components.** CoFHE is not a pure on-chain construction. You are trusting that the ZK verifier
correctly validates inputs, the TaskManager correctly commits FHE results, and the Teecryptor correctly
performs TEE-attested decryption and cannot be induced to sign a wrong value. This is the usual trust
profile for a coprocessor-based FHE system and is strictly stronger than trusting a single server, but it is
not "trust nothing".

**What still leaks by design.** Ballot *timing* and *participation* are public. If a proposal has two voters
and one votes after the other, the reveal makes the mapping obvious. Encryption hides the choice, not the
timestamp. If that matters for your use case, add a commit-reveal layer or a batching phase.

**One address, one vote.** Enforced with `hasVoted[proposalId][msg.sender]`. This is per-address, not
per-person; Sybil resistance is out of scope.

**The admin can see nothing early.** The owner has no special decryption power — `unlockResults` can only be
called after the deadline (there is a test for this), and it only *marks* the tallies; it does not reveal
them. The owner also cannot fake the tally, since `publishDecryptResult` verifies the Teecryptor signature.

**Ballots stay encrypted forever.** Only `yesVotes` and `noVotes` are ever granted public access. Each
individual `_ballots[id][voter]` is readable only by that voter.

**Testnet only.** CoFHE mainnet (Ethereum, Arbitrum One) is rolling out; this project targets Sepolia.

---

## Gas

FHE operations are more expensive than plain arithmetic because the coprocessor's work is committed on-chain.
Measure real `vote` gas on Sepolia. The mock environment used by `npm test` deliberately over-reports gas because it simulates off-chain work on-chain, so do not use its raw figures as estimates. Set `cofhe.gasSummary: true` in `hardhat.config.ts` to print adjusted gas numbers.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| `The specified module could not be found ... edr.win32-x64-msvc.node` | Install the [VC++ Redistributable x64](https://aka.ms/vs/17/release/vc_redist.x64.exe) (Windows). |
| `Property 'execute' does not exist` on `encryptInputs(...)` | You forgot `.setConsumingContract(address)`. The verifier binds the signed batch to one contract. |
| Encryption fails with a contract-mismatch error | `setConsumingContract` must name the contract that calls `FHE.asEuint32` — i.e. `PrivateVoting`, not a helper. |
| Wallet signature prompt when confirming your ballot | Expected: that is the ACP (EIP-712) that authorises *your* account to read *your* ciphertext. It is cached afterwards. |
| Reveal fails right after `unlockResults` | The ciphertext may not be visible to the Teecryptor yet. The SDK retries `404`s for 10s by default; `.set404RetryTimeout(ms)` extends it. |
| `VITE_CONTRACT_ADDRESS` empty in the UI | Create `frontend/.env` and restart `npm run dev`. |
| Tests hang or RPC errors | `npm run compile` first; make sure no `.env` points the default network at a remote RPC. |

---

## Notes on the older Fhenix API

The original brief used the pre-CoFHE Fhenix stack. Some of those names no longer exist, so here is the
mapping used in this project:

| Old (brief / pre-CoFHE) | This project (CoFHE 1.x) |
| --- | --- |
| `fhenix-contracts` npm package | `@fhenixprotocol/cofhe-contracts` (provides `FHE.sol`) |
| `TFHE.asEuint32(value)` | `FHE.asEuint32(externalEuint32 handle, bytes proof)` |
| `TFHE.add(a, b)` | `FHE.add(a, b)` |
| `InEuint32` input structs | `externalEuint32` handle + `bytes inputProof` |
| `FhenixPermit` for decryption | **ACP** — Access Control Permissions, `client.acp.getOrCreateSelfACP()` |
| `TFHE.decrypt()` in a transaction | `FHE.allowPublic` → off-chain `decryptForTx` → `FHE.publishDecryptResult` |
| Fhenix Helium testnet | Ethereum / Arbitrum / Base Sepolia (Helium retired) |

The decryption change is the biggest one: a contract can never decrypt synchronously. Decryption is always
"publish the handle, decrypt off-chain, submit the signed result back".

---

## Resources

- Fhenix CoFHE docs — <https://docs.fhenix.io>
- CoFHE contracts (`FHE.sol`) — <https://github.com/FhenixProtocol/cofhe-contracts>
- Client SDK — <https://github.com/FhenixProtocol/cofhesdk>
- Hardhat starter used as a reference — <https://github.com/FhenixProtocol/cofhe-hardhat-starter>
- Sepolia faucets — <https://sepoliafaucet.com> · <https://sepolia-faucet.pk910.de>

---

## License

MIT
