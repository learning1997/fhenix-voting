/**
 * Owner-side proposal drafting: turns the "New proposal" form into the values
 * `createProposal(string title, uint64 deadline)` expects. Kept pure so it can be tested
 * without a wallet.
 */

const MAX_TITLE_LENGTH = 200;

/** Reads a `<input type="datetime-local">` value as local time and returns unix seconds. */
export function deadlineFromLocalInput(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const milliseconds = new Date(trimmed).getTime();
  if (Number.isNaN(milliseconds)) return null;

  return BigInt(Math.floor(milliseconds / 1000));
}

/** Default form value: `hoursAhead` from now, formatted for a datetime-local input. */
export function defaultDeadlineInput(now: Date = new Date(), hoursAhead = 24): string {
  const target = new Date(now.getTime() + hoursAhead * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    `${target.getFullYear()}-${pad(target.getMonth() + 1)}-${pad(target.getDate())}`,
    `${pad(target.getHours())}:${pad(target.getMinutes())}`,
  ].join("T");
}

export interface ProposalDraftInput {
  title: string;
  deadlineLocal: string;
  nowSeconds?: number;
}

export type ProposalDraft =
  | { ok: true; title: string; deadline: bigint }
  | { ok: false; error: string };

export function buildProposalDraft({
  title,
  deadlineLocal,
  nowSeconds = Math.floor(Date.now() / 1000),
}: ProposalDraftInput): ProposalDraft {
  const cleanTitle = title.trim().slice(0, MAX_TITLE_LENGTH);
  if (!cleanTitle) return { ok: false, error: "Give the proposal a title." };

  const deadline = deadlineFromLocalInput(deadlineLocal);
  if (deadline === null) return { ok: false, error: "Choose a voting deadline." };
  if (deadline <= BigInt(nowSeconds)) return { ok: false, error: "The deadline must be in the future." };

  return { ok: true, title: cleanTitle, deadline };
}
