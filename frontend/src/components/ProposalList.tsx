import type { ProposalView } from "../lib/voting";

interface Props {
  proposals: ProposalView[];
  selectedId: bigint | null;
  onSelect: (id: bigint) => void;
}

export function ProposalList({ proposals, selectedId, onSelect }: Props) {
  if (proposals.length < 2) return null;

  return (
    <section className="panel">
      <div className="panel-title">All proposals</div>
      <div className="proposal-list">
        {proposals.map((p) => (
          <button
            key={p.id.toString()}
            className={`proposal-item ${p.id === selectedId ? "active" : ""}`}
            onClick={() => onSelect(p.id)}
          >
            <span>
              <span className="title">{p.title}</span>
              <br />
              <span className="sub">
                #{p.id.toString()} · {p.ballotsCast.toString()} ballot(s)
              </span>
            </span>
            <span className={`pill ${p.revealed ? "revealed" : p.votingOpen ? "live" : "closed"}`}>
              {p.revealed ? "revealed" : p.votingOpen ? "open" : "closed"}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
