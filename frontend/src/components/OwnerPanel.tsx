import { useState, type FormEvent } from "react";
import type { Signer } from "ethers";
import { buildProposalDraft, defaultDeadlineInput } from "../lib/proposalDraft";
import { readableError } from "../lib/format";
import { writeContract } from "../lib/voting";

interface Props {
  signer: Signer | null;
  isOwner: boolean;
  isSepolia: boolean;
  onCreated?: () => void | Promise<void>;
}

/** Voting-length shortcuts, in hours. */
const PRESETS = [
  { label: "+1 hour", hours: 1 },
  { label: "+24 hours", hours: 24 },
  { label: "+7 days", hours: 24 * 7 },
];

/**
 * Owner-only: open a proposal and set when voting closes. The wallet must be the contract owner,
 * which is what `createProposal` checks on-chain.
 */
export function OwnerPanel({ signer, isOwner, isSepolia, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [deadlineLocal, setDeadlineLocal] = useState(() => defaultDeadlineInput());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ hash: string } | null>(null);

  if (!isOwner) return null;

  const submit = async (event: FormEvent) => {
    event.preventDefault();

    const draft = buildProposalDraft({ title, deadlineLocal });
    if (!draft.ok) {
      setError(draft.error);
      setCreated(null);
      return;
    }
    if (!signer) {
      setError("Connect the owner wallet before creating a proposal.");
      return;
    }

    setBusy(true);
    setError(null);
    setCreated(null);

    try {
      const tx = await writeContract(signer).createProposal(draft.title, draft.deadline);
      await tx.wait();

      setCreated({ hash: tx.hash });
      setTitle("");
      setDeadlineLocal(defaultDeadlineInput());
      await onCreated?.();
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="owner-panel" aria-labelledby="owner-controls-title">
      <div className="owner-panel-head">
        <h2 id="owner-controls-title">Owner controls</h2>
        <span className="owner-hint">Visible only to the contract owner</span>
      </div>

      {!isSepolia ? (
        <div className="notice warn">
          <span className="icon">!</span>
          <div>Switch the wallet to Sepolia to open a proposal.</div>
        </div>
      ) : (
        <form onSubmit={submit}>
          <div className="owner-grid">
            <div className="field">
              <label htmlFor="proposal-title">Proposal title</label>
              <input
                id="proposal-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Ship treasury v2?"
                maxLength={200}
                autoComplete="off"
              />
            </div>

            <div className="field">
              <label htmlFor="proposal-deadline">Voting closes</label>
              <input
                id="proposal-deadline"
                type="datetime-local"
                value={deadlineLocal}
                onChange={(event) => setDeadlineLocal(event.target.value)}
              />
              <div className="preset-row">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    className="preset"
                    onClick={() => setDeadlineLocal(defaultDeadlineInput(new Date(), preset.hours))}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="owner-actions">
            <button className="btn btn-primary" type="submit" disabled={busy || !signer}>
              {busy ? <span className="spinner" /> : null}
              {busy ? "Creating" : "Create proposal"}
            </button>
            <p className="owner-note">
              Times are your local clock. Ballots close at that moment and cannot be reopened.
            </p>
          </div>
        </form>
      )}

      {error && (
        <div className="notice error" style={{ marginTop: 16 }}>
          <span className="icon">!</span>
          <div>{error}</div>
        </div>
      )}

      {created && (
        <div className="notice success" style={{ marginTop: 16 }}>
          <span className="icon">//</span>
          <div>
            <strong>Proposal created</strong>
            Submitted in transaction {created.hash.slice(0, 10)}…{" "}
            <a
              href={`https://sepolia.etherscan.io/tx/${created.hash}`}
              target="_blank"
              rel="noreferrer"
            >
              View on Etherscan
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
