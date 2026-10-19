import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let vite;
let buildProposalDraft;
let deadlineFromLocalInput;
let defaultDeadlineInput;

before(async () => {
  vite = await createServer({
    configFile: "vite.config.ts",
    server: { middlewareMode: true },
    appType: "custom",
  });
  ({ buildProposalDraft, deadlineFromLocalInput, defaultDeadlineInput } = await vite.ssrLoadModule(
    "/src/lib/proposalDraft.ts",
  ));
});

after(async () => {
  await vite?.close();
});

test("turns a local date-time input into unix seconds", () => {
  const expected = BigInt(Math.floor(new Date(2026, 9, 20, 14, 30).getTime() / 1000));

  assert.equal(deadlineFromLocalInput("2026-10-20T14:30"), expected);
  assert.equal(deadlineFromLocalInput(""), null);
  assert.equal(deadlineFromLocalInput("not a date"), null);
});

test("defaults the deadline to 24 hours out", () => {
  assert.equal(defaultDeadlineInput(new Date(2026, 9, 19, 10, 0)), "2026-10-20T10:00");
});

test("accepts a titled proposal with a future deadline", () => {
  const nowSeconds = Math.floor(new Date(2026, 9, 19, 10, 0).getTime() / 1000);
  const result = buildProposalDraft({
    title: "  Upgrade the treasury  ",
    deadlineLocal: "2026-10-20T10:00",
    nowSeconds,
  });

  assert.equal(result.ok, true);
  assert.equal(result.title, "Upgrade the treasury");
  assert.equal(result.deadline, BigInt(Math.floor(new Date(2026, 9, 20, 10, 0).getTime() / 1000)));
});

test("refuses an empty title", () => {
  const nowSeconds = Math.floor(new Date(2026, 9, 19, 10, 0).getTime() / 1000);
  const result = buildProposalDraft({ title: "   ", deadlineLocal: "2026-10-20T10:00", nowSeconds });

  assert.equal(result.ok, false);
  assert.match(result.error, /title/i);
});

test("refuses a deadline that is not in the future", () => {
  const nowSeconds = Math.floor(new Date(2026, 9, 19, 10, 0).getTime() / 1000);

  for (const deadlineLocal of ["2026-10-19T09:59", "2026-10-19T10:00", ""]) {
    const result = buildProposalDraft({ title: "Ship v3?", deadlineLocal, nowSeconds });
    assert.equal(result.ok, false);
    assert.match(result.error, /future|deadline|time/i);
  }
});

test("caps an over-long title at the contract-friendly length", () => {
  const nowSeconds = Math.floor(new Date(2026, 9, 19, 10, 0).getTime() / 1000);
  const result = buildProposalDraft({
    title: "x".repeat(400),
    deadlineLocal: "2026-10-20T10:00",
    nowSeconds,
  });

  assert.equal(result.ok, true);
  assert.equal(result.title.length, 200);
});
