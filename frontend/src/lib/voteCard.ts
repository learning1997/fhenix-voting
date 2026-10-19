import type { ProposalView } from "./voting";

/**
 * A shareable "I voted privately" card, drawn locally on a canvas.
 *
 * The card deliberately never carries the ballot choice: publishing the yes/no would undo the whole
 * point of the encrypted tally. It shows that a ballot was recorded, and that both tallies stay sealed.
 */

export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

const BG = "#050508";
const INK = "#f1f2ef";
const MUTED = "#828985";
const FAINT = "#5c6661";
const ACCENT = "#14e08a";
const LINE = "rgba(241, 242, 239, 0.14)";

const DISPLAY = '"Bebas Neue", Impact, "Arial Narrow", sans-serif';
const MONO = '"Space Mono", ui-monospace, Menlo, Consolas, monospace';

export interface VoteCardModel {
  eyebrow: string;
  headline: [string, string];
  proposalLabel: string;
  proposalTitle: string;
  ballotLine: string;
  honestyLine: string;
  sealedLabel: string;
  sealedCaption: string[];
}

type CardProposal = Pick<ProposalView, "id" | "title" | "ballotsCast">;

export function buildVoteCardModel(proposal: CardProposal): VoteCardModel {
  return {
    eyebrow: "BALLOT RECORDED / ETHEREUM SEPOLIA",
    headline: ["I VOTED", "PRIVATELY."],
    proposalLabel: `PROPOSAL #${proposal.id.toString()}`,
    proposalTitle: proposal.title,
    ballotLine: `BALLOT #${proposal.ballotsCast.toString()}`,
    honestyLine: "CHOICE ENCRYPTED / WALLET PUBLIC",
    sealedLabel: "SEALED TALLY",
    sealedCaption: [
      "Both counts stay encrypted until the deadline.",
      "Not even the owner can read the split.",
    ],
  };
}

export function buildShareText(model: VoteCardModel): string {
  return `I just cast an encrypted ballot on "${model.proposalTitle}". My choice never left my browser, and the tally stays sealed until the deadline.`;
}

export function buildXIntentUrl(text: string, url: string): string {
  return `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

export function buildCardFileName(proposalId: bigint): string {
  return `private-voting-ballot-${proposalId.toString()}.png`;
}

/** Where the "Post on X" link points. Falls back to the current origin. */
export function siteUrl(): string {
  const configured = (import.meta.env.VITE_SITE_URL ?? "").trim();
  if (configured) return configured;
  if (typeof window !== "undefined" && window.location) return window.location.origin;
  return "";
}

function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
): number {
  let cursor = x;
  for (const char of text) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + tracking;
  }
  return cursor;
}

function trackedWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number): number {
  let width = 0;
  for (const char of text) width += ctx.measureText(char).width + tracking;
  return Math.max(0, width - tracking);
}

function drawTrackedRightAligned(
  ctx: CanvasRenderingContext2D,
  text: string,
  right: number,
  y: number,
  tracking: number,
): void {
  drawTracked(ctx, text, right - trackedWidth(ctx, text, tracking), y, tracking);
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let clipped = text;
  while (clipped.length > 1 && ctx.measureText(`${clipped}…`).width > maxWidth) {
    clipped = clipped.slice(0, -1);
  }
  return `${clipped}…`;
}

async function ensureFonts(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) return;

  try {
    await document.fonts.ready;
    await Promise.all(
      [
        '400 150px "Bebas Neue"',
        '400 44px "Bebas Neue"',
        '700 22px "Space Mono"',
        '400 15px "Space Mono"',
        '700 13px "Space Mono"',
        '400 12px "Space Mono"',
      ].map((font) => document.fonts.load(font).catch(() => undefined)),
    );
  } catch {
    /* fall back to the next font in the stack */
  }
}

/** Diagonal hatch, the same texture the app uses for an encrypted tally bar. */
function hatchedBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.strokeStyle = "rgba(241, 242, 239, 0.34)";
  ctx.lineWidth = 1;
  for (let offset = -height; offset < width + height; offset += 8) {
    ctx.beginPath();
    ctx.moveTo(x + offset, y + height);
    ctx.lineTo(x + offset + height, y);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
}

/** Draws the card and returns a PNG blob. Runs entirely in the browser. */
export async function renderVoteCard(model: VoteCardModel): Promise<Blob> {
  await ensureFonts();

  const canvas = document.createElement("canvas");
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is unavailable in this browser");

  const pad = 64;
  const right = CARD_WIDTH - pad;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.strokeRect(31.5, 31.5, CARD_WIDTH - 63, CARD_HEIGHT - 63);

  // wordmark
  ctx.font = `700 22px ${MONO}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = INK;
  const afterWordmark = drawTracked(ctx, "PRIVATE VOTING", pad, 88, 5);
  ctx.fillStyle = ACCENT;
  ctx.fillText(".", afterWordmark, 88);

  // header tag on the right, so the top row is anchored across the full width
  ctx.font = `400 13px ${MONO}`;
  ctx.fillStyle = MUTED;
  drawTrackedRightAligned(ctx, "ENCRYPTED ON-CHAIN", right, 88, 3);

  // eyebrow
  ctx.font = `400 15px ${MONO}`;
  ctx.fillStyle = FAINT;
  drawTracked(ctx, model.eyebrow, pad, 126, 3.2);

  ctx.fillStyle = LINE;
  ctx.fillRect(pad, 150, CARD_WIDTH - pad * 2, 1);

  // headline
  ctx.font = `400 150px ${DISPLAY}`;
  ctx.fillStyle = INK;
  ctx.fillText(model.headline[0], pad, 300);
  ctx.fillStyle = ACCENT;
  ctx.fillText(model.headline[1], pad, 434);

  // right column: the sealed tally, so the card says what is hidden rather than leaving a void
  const sealedX = 700;
  const sealedWidth = right - sealedX;

  ctx.font = `700 13px ${MONO}`;
  ctx.fillStyle = FAINT;
  drawTracked(ctx, model.sealedLabel, sealedX, 202, 3);

  hatchedBar(ctx, sealedX, 222, sealedWidth, 16);
  hatchedBar(ctx, sealedX, 262, sealedWidth, 16);
  hatchedBar(ctx, sealedX, 302, sealedWidth, 16);

  ctx.font = `400 12px ${MONO}`;
  ctx.fillStyle = FAINT;
  model.sealedCaption.forEach((line, index) => {
    ctx.fillText(fitText(ctx, line, sealedWidth), sealedX, 366 + index * 20);
  });

  // accent hatch across the full interior, binding both columns and echoing the sealed tally texture
  hatchedBar(ctx, pad, 470, CARD_WIDTH - pad * 2, 8);

  ctx.fillStyle = LINE;
  ctx.fillRect(pad, 500, CARD_WIDTH - pad * 2, 1);

  // footer: which proposal the ballot belongs to
  ctx.font = `700 14px ${MONO}`;
  ctx.fillStyle = FAINT;
  drawTracked(ctx, model.proposalLabel, pad, 532, 3);

  ctx.font = `400 44px ${DISPLAY}`;
  ctx.fillStyle = INK;
  ctx.fillText(fitText(ctx, model.proposalTitle.toUpperCase(), 620), pad, 578);

  // footer: the public facts
  ctx.font = `400 14px ${MONO}`;
  ctx.fillStyle = MUTED;
  drawTrackedRightAligned(ctx, model.ballotLine, right, 532, 3);

  ctx.font = `400 13px ${MONO}`;
  ctx.fillStyle = FAINT;
  drawTrackedRightAligned(ctx, model.honestyLine, right, 578, 2.4);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not encode the card image"));
    }, "image/png");
  });
}
