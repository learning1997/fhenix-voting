export const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function shortAddress(address: string): string {
  if (!address) return "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatCountdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return "closed";
  const days = Math.floor(secondsLeft / 86400);
  const hours = Math.floor((secondsLeft % 86400) / 3600);
  const minutes = Math.floor((secondsLeft % 3600) / 60);
  const seconds = Math.floor(secondsLeft % 60);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export function formatDeadline(deadline: bigint): string {
  return new Date(Number(deadline) * 1000).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Percentage with two decimals, computed on bigints so large counts stay exact. */
export function percentage(part: bigint, total: bigint): number {
  if (total === 0n) return 0;
  return Number((part * 10000n) / total) / 100;
}

export function readableError(error: unknown): string {
  if (typeof error === "string") return error;
  const e = error as { shortMessage?: string; reason?: string; message?: string; info?: { error?: { message?: string } } };
  return (
    e?.reason ||
    e?.shortMessage ||
    e?.info?.error?.message ||
    e?.message ||
    "Something went wrong."
  );
}
