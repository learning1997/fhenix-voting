import type { ProposalView } from "../lib/voting";
import { formatCountdown, formatDeadline } from "../lib/format";
import { VoteCard } from "./VoteCard";

/** The five stages @cofhe/sdk runs for every `encryptInputs(...).execute()` batch. */
const ENCRYPT_STEPS = ["InitTfhe", "FetchKeys", "Pack", "Prove", "Verify"];

interface Props {
  proposal: ProposalView;
  secondsLeft: number;
  connected: boolean;
  hasVoted: boolean;
  pendingChoice: 0 | 1 | null;
  submitting: boolean;
  encryptStep: { step: string; done: boolean } | null;
  onVote: (choice: 0 | 1) => void;
  confirmedBallot: bigint | null;
  confirming: boolean;
  onConfirmBallot: () => void;
  isOwner?: boolean;
  onCancel?: () => void;
}

export function ProposalCard({
  proposal,
  secondsLeft,
  connected,
  hasVoted,
  pendingChoice,
  submitting,
  encryptStep,
  onVote,
  confirmedBallot,
  confirming,
  onConfirmBallot,
  isOwner = false,
  onCancel,
}: Props) {
  const isOpen = proposal.votingOpen;
  const canVote = connected && isOpen && !hasVoted && !submitting;
  const currentIndex = encryptStep ? ENCRYPT_STEPS.indexOf(encryptStep.step) : -1;

  return (
    <section className="panel">
      <div className="panel-title">
        Proposal #{proposal.id.toString()}
        {isOpen ? (
          <span className="pill live">
            <span className="dot" /> Voting open
          </span>
        ) : (
          <span className="pill closed">Voting closed</span>
        )}
        <span className="pill encrypted">Encrypted end to end</span>
      </div>

      <h2 className="proposal-title">{proposal.title}</h2>

      <div className="proposal-meta">
        <div className="stat">
          <div className="stat-label">{isOpen ? "Time left" : "Status"}</div>
          <div className="stat-value mono">{isOpen ? formatCountdown(secondsLeft) : "deadline passed"}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Ballots cast (public)</div>
          <div className="stat-value mono">{proposal.ballotsCast.toString()}</div>
        </div>
        <div className="stat">
          <div className="stat-label">Deadline</div>
          <div className="stat-value mono" style={{ fontSize: 13 }}>
            {formatDeadline(proposal.deadline)}
          </div>
        </div>
      </div>

      <div className="notice info" style={{ marginBottom: 18 }}>
        <span className="icon">//</span>
        <div>
          <strong>Live encrypted counter</strong>
          Everyone can see that your wallet voted and when, plus the total number of ballots. The yes/no
          split stays encrypted, including from the owner, until results are revealed after the deadline.
        </div>
      </div>

      {hasVoted ? (
        <div className="stack" style={{ gap: 12 }}>
          <div className="notice success">
            <span className="icon">//</span>
            <div>
              <strong>Your vote is private and encrypted</strong>
              Your ballot was encrypted in your browser and submitted as a ciphertext. No plaintext yes/no
              ever left your device.
            </div>
          </div>

          {confirmedBallot !== null ? (
            <div className="notice">
              <span className="icon">✓</span>
              <div>
                <strong>Ballot verified from your own key</strong>
                You decrypted your own ciphertext locally: you voted{" "}
                <b style={{ color: confirmedBallot === 1n ? "var(--accent)" : "var(--danger)" }}>
                  {confirmedBallot === 1n ? "YES" : "NO"}
                </b>
                . Nobody else can perform this decryption.
              </div>
            </div>
          ) : (
            <button className="btn btn-block" onClick={onConfirmBallot} disabled={confirming}>
              {confirming ? <span className="spinner" /> : null}
              {confirming ? "Decrypting your ballot" : "Confirm my encrypted ballot"}
            </button>
          )}

          <VoteCard proposal={proposal} />
        </div>
      ) : (
        <>
          <div className="vote-row">
            <button
              className={`vote-btn btn yes ${pendingChoice === 1 ? "selected" : ""}`}
              onClick={() => onVote(1)}
              disabled={!canVote}
            >
              <span className="vote-glyph">✓</span>
              <span className="vote-label">Vote Yes</span>
              <small>ENCRYPTED IN BROWSER</small>
            </button>
            <button
              className={`vote-btn btn no ${pendingChoice === 0 ? "selected" : ""}`}
              onClick={() => onVote(0)}
              disabled={!canVote}
            >
              <span className="vote-glyph">✕</span>
              <span className="vote-label">Vote No</span>
              <small>ENCRYPTED IN BROWSER</small>
            </button>
          </div>

          {!connected && (
            <div className="notice" style={{ marginTop: 14 }}>
              <span className="icon">//</span>
              <div>Connect your wallet to cast an encrypted ballot.</div>
            </div>
          )}

          {connected && !isOpen && (
            <div className="notice warn" style={{ marginTop: 14 }}>
              <span className="icon">!</span>
              <div>
                <strong>Voting has closed</strong>
                The encrypted tally is frozen. It becomes readable only when the owner reveals the result.
              </div>
            </div>
          )}
        </>
      )}

      {submitting && encryptStep && (
        <>
          <div className="progress-line">
            <span className="spinner" />
            Encrypting your vote locally, proving it is well-formed before it is sent…
          </div>
          <ul className="steps">
            {ENCRYPT_STEPS.map((name, index) => {
              const state =
                currentIndex === -1
                  ? "pending"
                  : index < currentIndex || (index === currentIndex && encryptStep.done)
                    ? "done"
                    : index === currentIndex
                      ? "active"
                      : "pending";
              return (
                <li key={name} className={state}>
                  <span className="tick">{state === "done" ? "✓" : state === "active" ? "▸" : "·"}</span>
                  {name}
                </li>
              );
            })}
          </ul>
        </>
      )}

      {isOwner && onCancel ? (
        <div className="owner-row">
          <button type="button" className="btn btn-sm btn-danger" onClick={onCancel}>
            Cancel proposal
          </button>
        </div>
      ) : null}
    </section>
  );
}
