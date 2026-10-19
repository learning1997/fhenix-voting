import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, type Signer } from "ethers";
import { ConnectWallet } from "./components/ConnectWallet";
import { ProposalCard } from "./components/ProposalCard";
import { ProposalList } from "./components/ProposalList";
import { ResultsPanel } from "./components/ResultsPanel";
import { PrivacyExplainer } from "./components/PrivacyExplainer";
import { SEPOLIA_CHAIN_ID, connectCofhe, disconnectCofhe, ensureSepolia, revokeWalletPermission } from "./lib/cofhe";
import { readableError } from "./lib/format";
import {
  CONTRACT_ADDRESS,
  decryptMyBallot,
  decryptTallies,
  encryptBallot,
  fetchProposals,
  readContract,
  writeContract,
  type ProposalView,
} from "./lib/voting";

export default function App() {
  const [account, setAccount] = useState<string | null>(null);
  const [signer, setSigner] = useState<Signer | null>(null);
  const [isSepolia, setIsSepolia] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const [proposals, setProposals] = useState<ProposalView[]>([]);
  const [selectedId, setSelectedId] = useState<bigint | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const [hasVoted, setHasVoted] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  const [pendingChoice, setPendingChoice] = useState<0 | 1 | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [encryptStep, setEncryptStep] = useState<{ step: string; done: boolean } | null>(null);

  const [confirmedBallot, setConfirmedBallot] = useState<bigint | null>(null);
  const [confirming, setConfirming] = useState(false);

  const [results, setResults] = useState<{ yes: bigint; no: bigint } | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [revealStage, setRevealStage] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = useMemo(
    () => proposals.find((p) => p.id === selectedId) ?? null,
    [proposals, selectedId],
  );

  const secondsLeft = selected ? Number(selected.deadline) - now : 0;

  // ------------------------------------------------------------------ reads

  const refresh = useCallback(async () => {
    if (!CONTRACT_ADDRESS) return;
    try {
      const count: bigint = await readContract().proposalCount();
      const list = await fetchProposals(count);
      setProposals(list);

      setSelectedId((current) => {
        if (current !== null && list.some((p) => p.id === current)) return current;
        const open = [...list].reverse().find((p) => p.votingOpen);
        return (open ?? list[list.length - 1])?.id ?? null;
      });
    } catch (e) {
      setError(readableError(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 12000);
    return () => clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  // Per-proposal UI state resets only when the user actually switches proposal.
  useEffect(() => {
    setConfirmedBallot(null);
  }, [selectedId]);

  const revealed = selected?.revealed ?? false;
  const ballotsCast = selected?.ballotsCast;

  // Load the published plaintext sums once the proposal has been revealed.
  useEffect(() => {
    if (selectedId === null || !revealed) {
      setResults(null);
      return;
    }

    let cancelled = false;

    (async () => {
      const contract = readContract();
      try {
        const [publishedYes, publishedNo] = await Promise.all([
          contract.revealedYes(selectedId),
          contract.revealedNo(selectedId),
        ]);
        if (!cancelled) setResults({ yes: publishedYes, no: publishedNo });
      } catch {
        /* transient RPC hiccup - the poll will retry */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedId, revealed]);

  // Whether *this* wallet has voted, and whether it is the proposal owner.
  // Re-runs when the ballot count changes so a vote from another tab is picked up too.
  useEffect(() => {
    if (!account || selectedId === null) {
      setHasVoted(false);
      setIsOwner(false);
      return;
    }

    let cancelled = false;

    (async () => {
      const contract = readContract();
      try {
        const [voted, ownerAddress] = await Promise.all([
          contract.hasVoted(selectedId, account),
          contract.owner(),
        ]);
        if (cancelled) return;
        setHasVoted(voted);
        setIsOwner(String(ownerAddress).toLowerCase() === account.toLowerCase());
      } catch {
        /* transient RPC hiccup - the poll will retry */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account, selectedId, ballotsCast]);

  // ------------------------------------------------------------------ wallet

  const setupWallet = useCallback(async (ethereum: Eip1193Provider, requestAccounts: boolean) => {
    if (requestAccounts) {
      await ethereum.request({ method: "eth_requestAccounts" });
      await ensureSepolia(ethereum);
    }

    // A fresh provider, because the network may have just changed.
    const provider = new BrowserProvider(ethereum as never);
    const network = await provider.getNetwork();
    const onSepolia = network.chainId === SEPOLIA_CHAIN_ID;
    setIsSepolia(onSepolia);

    const nextSigner = await provider.getSigner();
    setSigner(nextSigner);
    setAccount(await nextSigner.getAddress());

    if (onSepolia) {
      await connectCofhe(provider, nextSigner);
    } else {
      disconnectCofhe();
    }
  }, []);

  useEffect(() => {
    const ethereum = window.ethereum;
    if (!ethereum) return;

    void setupWallet(ethereum, false).catch(() => {
      /* not connected yet - the user will click Connect */
    });

    const onAccountsChanged = (...args: unknown[]) => {
      const accounts = args[0];
      if (Array.isArray(accounts) && accounts.length === 0) {
        disconnectCofhe();
        setAccount(null);
        setSigner(null);
        setHasVoted(false);
        setIsOwner(false);
        setConfirmedBallot(null);
        setNotice(null);
        return;
      }
      void setupWallet(ethereum, false).catch(() => undefined);
    };
    const onChainChanged = () => void setupWallet(ethereum, false).catch(() => undefined);

    ethereum.on("accountsChanged", onAccountsChanged);
    ethereum.on("chainChanged", onChainChanged);
    return () => {
      ethereum.removeListener("accountsChanged", onAccountsChanged);
      ethereum.removeListener("chainChanged", onChainChanged);
    };
  }, [setupWallet]);

  const handleConnect = async () => {
    if (!window.ethereum) {
      setError("No injected EVM wallet was detected. Enable an EIP-1193 wallet and reload the page.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      await setupWallet(window.ethereum, true);
    } catch (e) {
      setError(readableError(e));
    } finally {
      setConnecting(false);
    }
  };

  const handleSwitchNetwork = async () => {
    if (!window.ethereum) return;
    setError(null);
    try {
      await ensureSepolia(window.ethereum);
      await setupWallet(window.ethereum, false);
    } catch (e) {
      setError(readableError(e));
    }
  };

  const handleDisconnect = async () => {
    const ethereum = window.ethereum;
    disconnectCofhe();
    setAccount(null);
    setSigner(null);
    setHasVoted(false);
    setIsOwner(false);
    setConfirmedBallot(null);
    setNotice(null);

    if (!ethereum) return;
    const revoked = await revokeWalletPermission(ethereum);
    setNotice(
      revoked
        ? "Wallet access revoked. Connect again to approve this site."
        : "Disconnected from this app. This wallet keeps its permission; revoke this site's access in wallet settings to get a prompt next time.",
    );
  };

  // ------------------------------------------------------------------ actions

  const handleVote = async (choice: 0 | 1) => {
    if (!signer || !selected) return;

    setPendingChoice(choice);
    setSubmitting(true);
    setError(null);
    setNotice(null);
    setConfirmedBallot(null);

    try {
      // 1. Encrypt in the browser and prove the ciphertext is well formed.
      const { handle, proof } = await encryptBallot(choice, (step, done) =>
        setEncryptStep({ step, done }),
      );

      // 2. Send the ciphertext + proof. This is the only thing that ever leaves the browser.
      setEncryptStep(null);
      setNotice("Submitting your encrypted ballot…");
      const tx = await writeContract(signer).vote(selected.id, handle, proof);
      await tx.wait();

      setNotice(null);
      setHasVoted(true);
      await refresh();
    } catch (e) {
      setError(readableError(e));
    } finally {
      setSubmitting(false);
      setPendingChoice(null);
      setEncryptStep(null);
    }
  };

  const handleConfirmBallot = async () => {
    if (!signer || !selected) return;
    setConfirming(true);
    setError(null);
    try {
      const handle: string = await writeContract(signer).getMyBallot(selected.id);
      setConfirmedBallot(await decryptMyBallot(handle));
    } catch (e) {
      setError(readableError(e));
    } finally {
      setConfirming(false);
    }
  };

  const handleReveal = async () => {
    if (!signer || !selected) return;
    setRevealing(true);
    setError(null);

    const contract = writeContract(signer);

    try {
      if (!selected.resultsUnlocked) {
        setRevealStage("Step 1 of 3 · marking the encrypted tally publicly decryptable…");
        await (await contract.unlockResults(selected.id)).wait();
      }

      setRevealStage("Step 2 of 3 · asking the CoFHE Teecryptor for the sealed sums…");
      const { yesVotes, noVotes } = await contract.getEncryptedTally(selected.id);
      const tallies = await decryptTallies(yesVotes, noVotes);

      setRevealStage("Step 3 of 3 · publishing the signed result on-chain…");
      await (
        await contract.revealResults(
          selected.id,
          tallies.yes,
          tallies.yesSignature,
          tallies.no,
          tallies.noSignature,
        )
      ).wait();

      setResults({ yes: tallies.yes, no: tallies.no });
      await refresh();
    } catch (e) {
      setError(readableError(e));
    } finally {
      setRevealStage(null);
      setRevealing(false);
    }
  };

  // ------------------------------------------------------------------ render

  if (!CONTRACT_ADDRESS) {
    return (
      <div className="app">
        <div className="panel">
          <div className="panel-title">Setup needed</div>
          <p className="panel-sub">
            No contract address configured. Deploy the contract, then create <code>frontend/.env</code>{" "}
            with:
          </p>
          <pre className="mono" style={{ overflowX: "auto" }}>
            VITE_CONTRACT_ADDRESS=0xYourDeployedAddress
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="masthead">
        <div>
          <h1 className="wordmark">
            Private Voting<span>.</span>
          </h1>
          <p className="masthead-note">Fhenix CoFHE / Ethereum Sepolia</p>
        </div>
        <div className="masthead-actions">
          {isOwner && account && <span className="pill revealed">owner</span>}
          <ConnectWallet
            account={account}
            isSepolia={isSepolia}
            connecting={connecting}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
          />
        </div>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">
          <span className="eyebrow-index">01</span> Private DAO voting / Sepolia
        </p>
        <h2 className="hero-title" id="hero-title">
          Your choice is encrypted.
          <span> Turnout stays visible.</span>
        </h2>
        <p className="hero-lead">
          Choose a proposal, connect your wallet, and vote. Your yes or no is encrypted in your browser
          before it reaches the chain.
        </p>

        <div className="hero-cta">
          {account ? (
            <a className="btn btn-primary" href="#ballot">
              Cast your ballot
            </a>
          ) : (
            <button className="btn btn-primary" onClick={handleConnect} disabled={connecting}>
              {connecting ? <span className="spinner" /> : null}
              {connecting ? "Connecting" : "Connect wallet"}
            </button>
          )}
          <span className="hero-cta-note">
            {isSepolia ? "Sepolia ready" : "Wrong network"} / one wallet, one vote
          </span>
        </div>

        <div className="spec" aria-label="What voting reveals">
          <div className="spec-head">
            <span className="spec-kicker">Privacy at a glance</span>
            <span className="spec-note">What stays sealed, what is public</span>
          </div>
          <dl className="spec-rows">
            <div className="spec-row">
              <dt>Individual choice</dt>
              <dd className="sealed">Hidden</dd>
            </div>
            <div className="spec-row">
              <dt>Total turnout</dt>
              <dd>{selected ? selected.ballotsCast.toString() : "—"}</dd>
            </div>
            <div className="spec-row">
              <dt>Wallet + vote time</dt>
              <dd className="public">Public</dd>
            </div>
            <div className="spec-row">
              <dt>Aggregate totals</dt>
              <dd>{selected?.revealed ? "Published" : "After deadline"}</dd>
            </div>
          </dl>
          <p className="spec-caveat">
            Everyone can see turnout, wallet addresses, and vote times. The owner cannot decrypt individual
            choices; very small turnouts can still make choices easier to infer after totals are revealed.
          </p>
        </div>

        <a className="hero-link" href="#how-to-vote">
          See how voting works <span aria-hidden="true">↓</span>
        </a>
      </section>

      <section className="howto" id="how-to-vote" aria-labelledby="howto-title">
        <div className="howto-head">
          <div>
            <p className="eyebrow">
              <span className="eyebrow-index">02</span> A simple, private flow
            </p>
            <h2 id="howto-title">How voting works</h2>
          </div>
          <p>One clear choice. Encrypted before it leaves your browser.</p>
        </div>

        <div className="howto-rows">
          <article className="howto-step">
            <span className="step-number">01 / Step</span>
            <h3>Connect and choose</h3>
            <p>Connect a wallet on Ethereum Sepolia and select an open proposal.</p>
          </article>
          <article className="howto-step">
            <span className="step-number">02 / Step</span>
            <h3>Vote yes or no</h3>
            <p>Your browser encrypts your choice before the ballot is sent.</p>
          </article>
          <article className="howto-step">
            <span className="step-number">03 / Step</span>
            <h3>Confirm the transaction</h3>
            <p>The chain records your wallet, vote time, and total turnout, not your selection.</p>
          </article>
          <article className="howto-step">
            <span className="step-number">04 / Step</span>
            <h3>See the final totals</h3>
            <p>After the deadline, the owner publishes signed aggregate yes/no totals.</p>
          </article>
        </div>

        <p className="howto-footnote">
          Individual ballots are never published. Privacy hides your choice, not your identity or
          participation.
        </p>
      </section>

      {account && !isSepolia && (
        <div className="notice warn" style={{ marginTop: 22 }}>
          <span className="icon">!</span>
          <div style={{ flex: 1 }}>
            <strong>Wrong network</strong>
            This dApp talks to the CoFHE coprocessor on Ethereum Sepolia.
          </div>
          <button className="btn btn-sm btn-primary" onClick={handleSwitchNetwork}>
            Switch to Sepolia
          </button>
        </div>
      )}

      {error && (
        <div className="notice error" style={{ marginTop: 22 }}>
          <span className="icon">!</span>
          <div>{error}</div>
        </div>
      )}

      {notice && (
        <div className="notice info" style={{ marginTop: 22 }}>
          <span className="icon">
            <span className="spinner" />
          </span>
          <div>{notice}</div>
        </div>
      )}

      {!selected ? (
        <section className="panel" style={{ marginTop: "clamp(34px, 5vw, 56px)" }}>
          <div className="panel-title">No proposals yet</div>
          <div className="empty">
            The owner has not created a proposal on this contract yet. Voting starts after the owner opens
            one on-chain.
          </div>
        </section>
      ) : (
        <div className="grid" id="ballot">
          <div className="stack">
            <ProposalCard
              proposal={selected}
              secondsLeft={secondsLeft}
              connected={Boolean(account && isSepolia)}
              hasVoted={hasVoted}
              pendingChoice={pendingChoice}
              submitting={submitting}
              encryptStep={encryptStep}
              onVote={handleVote}
              confirmedBallot={confirmedBallot}
              confirming={confirming}
              onConfirmBallot={handleConfirmBallot}
            />
            <ProposalList proposals={proposals} selectedId={selectedId} onSelect={setSelectedId} />
          </div>

          <div className="stack">
            <ResultsPanel
              proposal={selected}
              connected={Boolean(account && isSepolia)}
              isOwner={isOwner}
              results={results}
              revealing={revealing}
              revealStage={revealStage}
              onReveal={handleReveal}
            />
            <PrivacyExplainer />
          </div>
        </div>
      )}

      <footer className="footer">
        Built with{" "}
        <a href="https://docs.fhenix.io" target="_blank" rel="noreferrer">
          Fhenix CoFHE
        </a>{" "}
        / contracts on Ethereum Sepolia /{" "}
        <a href="https://github.com/FhenixProtocol/cofhesdk" target="_blank" rel="noreferrer">
          @cofhe/sdk
        </a>
      </footer>
    </div>
  );
}
