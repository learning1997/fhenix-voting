import type { ProposalView } from "../lib/voting";
import { percentage } from "../lib/format";

interface Props {
  proposal: ProposalView;
  connected: boolean;
  isOwner: boolean;
  results: { yes: bigint; no: bigint } | null;
  revealing: boolean;
  revealStage: string | null;
  onReveal: () => void;
}

export function ResultsPanel({
  proposal,
  connected,
  isOwner,
  results,
  revealing,
  revealStage,
  onReveal,
}: Props) {
  const revealed = proposal.revealed && results !== null;
  const total = results ? results.yes + results.no : 0n;
  const yesPct = results ? percentage(results.yes, total) : 0;
  const noPct = results ? percentage(results.no, total) : 0;

  const closed = !proposal.votingOpen;
  const canReveal = connected && isOwner && closed && !proposal.revealed;

  return (
    <section className="panel">
      <div className="panel-title">
        Tally
        {revealed ? (
          <span className="pill revealed">Revealed on-chain</span>
        ) : (
          <span className="pill encrypted">Sealed</span>
        )}
      </div>
      <p className="panel-sub">
        {revealed
          ? "Published with a Teecryptor signature, so these numbers are provably the real ciphertext contents."
          : "Stored as two ciphertexts. Even the contract cannot read them; arithmetic happens on encrypted data."}
      </p>

      <div className="tally">
        <div className="tally-row">
          <div className="tally-head">
            <span className="label" style={{ color: "var(--accent)" }}>
              Yes
            </span>
            <span className="value">{revealed ? `${results!.yes.toString()} · ${yesPct}%` : "••• encrypted"}</span>
          </div>
          <div className={`bar yes ${revealed ? "" : "locked"}`}>
            <span style={{ width: revealed ? `${yesPct}%` : "100%" }} />
          </div>
        </div>

        <div className="tally-row">
          <div className="tally-head">
            <span className="label" style={{ color: "var(--danger)" }}>
              No
            </span>
            <span className="value">{revealed ? `${results!.no.toString()} · ${noPct}%` : "••• encrypted"}</span>
          </div>
          <div className={`bar no ${revealed ? "" : "locked"}`}>
            <span style={{ width: revealed ? `${noPct}%` : "100%" }} />
          </div>
        </div>
      </div>

      <div className="divider" />

      {revealed ? (
        <div className="notice success">
          <span className="icon">//</span>
          <div>
            <strong>
              {results!.yes === results!.no
                ? "Result: tie"
                : results!.yes > results!.no
                  ? "Result: YES wins"
                  : "Result: NO wins"}
            </strong>
            {total.toString()} ballots were decrypted in total. Individual ballots stay encrypted forever;
            only the two sums were ever revealed.
          </div>
        </div>
      ) : canReveal ? (
        <>
          <button className="btn btn-primary btn-block" onClick={onReveal} disabled={revealing}>
            {revealing ? <span className="spinner" /> : null}
            {revealing ? "Revealing" : "Reveal results"}
          </button>
          <div className="progress-line">
            Reveal is a two-step owner flow: mark the tally publicly decryptable on-chain, then publish the
            decrypted sums with their CoFHE proof.
          </div>
          {revealStage && (
            <div className="progress-line">
              <span className="spinner" />
              {revealStage}
            </div>
          )}
        </>
      ) : !closed ? (
        <div className="notice info">
          <span className="icon">//</span>
          <div>
            <strong>Results unlock when voting ends</strong>
            The tallies remain sealed while voting is open.
          </div>
        </div>
      ) : connected ? (
        <div className="notice warn">
          <span className="icon">!</span>
          <div>
            <strong>Waiting on the owner</strong>
            Voting has ended. Only the proposal owner can unlock and publish the final tally.
          </div>
        </div>
      ) : (
        <div className="notice">
          <span className="icon">//</span>
          <div>Connect your wallet to see the reveal controls.</div>
        </div>
      )}
    </section>
  );
}
