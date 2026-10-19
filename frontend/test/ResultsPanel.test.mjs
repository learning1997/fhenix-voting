import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer, resolveConfig } from "vite";

let vite;
let ResultsPanel;
let ProposalCard;
let App;
let revokeWalletPermission;

before(async () => {
  vite = await createServer({
    configFile: "vite.config.ts",
    server: { middlewareMode: true },
    appType: "custom",
  });
  ({ ResultsPanel } = await vite.ssrLoadModule("/src/components/ResultsPanel.tsx"));
  ({ ProposalCard } = await vite.ssrLoadModule("/src/components/ProposalCard.tsx"));
  ({ default: App } = await vite.ssrLoadModule("/src/App.tsx"));
  ({ revokeWalletPermission } = await vite.ssrLoadModule("/src/lib/cofhe.ts"));
});

after(async () => {
  await vite?.close();
});

test("keeps TFHE out of dependency optimization so its adjacent WASM asset resolves", async () => {
  const config = await resolveConfig({}, "serve", "development");
  assert.ok(config.optimizeDeps.exclude?.includes("tfhe"));
});

test("revokes MetaMask account permission on disconnect", async () => {
  let request;
  const revoked = await revokeWalletPermission({
    request: async (args) => {
      request = args;
      return null;
    },
  });

  assert.equal(revoked, true);
  assert.deepEqual(request, {
    method: "wallet_revokePermissions",
    params: [{ eth_accounts: {} }],
  });
});

test("reports when a wallet does not support permission revocation", async () => {
  const revoked = await revokeWalletPermission({
    request: async () => {
      throw new Error("Unsupported method");
    },
  });

  assert.equal(revoked, false);
});

test("shows the reveal control to the owner after voting closes", () => {
  const html = renderToStaticMarkup(
    React.createElement(ResultsPanel, {
      proposal: {
        id: 1n,
        title: "Test proposal",
        deadline: 0n,
        ballotsCast: 2n,
        exists: true,
        resultsUnlocked: false,
        revealed: false,
        votingOpen: false,
      },
      connected: true,
      isOwner: true,
      results: null,
      revealing: false,
      revealStage: null,
      onReveal: () => {},
    }),
  );

  assert.match(html, /Reveal results/);
});

test("homepage explains the voting steps and what remains public", () => {
  const html = renderToStaticMarkup(React.createElement(App));

  assert.match(html, /Connect wallet/);
  assert.doesNotMatch(html, /Connect MetaMask/);
  assert.match(html, /How voting works/);
  assert.match(html, /Connect and choose/);
  assert.match(html, /Your yes or no is encrypted in your browser/);
  assert.match(html, /wallet addresses, and vote times/);
  assert.match(html, /After the deadline, the owner publishes signed aggregate yes\/no totals/);
  assert.match(html, /Everyone can see turnout, wallet addresses, and vote times/);
  assert.match(html, /The owner has not created a proposal on this contract yet/);
  assert.doesNotMatch(html, /npm run deploy:sepolia/);
});

test("shows a cancel control to the owner only", () => {
  const props = {
    proposal: {
      id: 1n,
      title: "Test proposal",
      deadline: 100000n,
      ballotsCast: 12n,
      exists: true,
      resultsUnlocked: false,
      revealed: false,
      cancelled: false,
      votingOpen: true,
    },
    secondsLeft: 3600,
    connected: false,
    hasVoted: false,
    pendingChoice: null,
    submitting: false,
    encryptStep: null,
    onVote: () => {},
    confirmedBallot: null,
    confirming: false,
    onConfirmBallot: () => {},
    onCancel: () => {},
  };

  const ownerView = renderToStaticMarkup(React.createElement(ProposalCard, { ...props, isOwner: true }));
  const viewerView = renderToStaticMarkup(React.createElement(ProposalCard, { ...props, isOwner: false }));

  assert.match(ownerView, /Cancel proposal/i);
  assert.doesNotMatch(viewerView, /Cancel proposal/i);
});

test("shows the public total ballot count on a proposal", () => {
  const html = renderToStaticMarkup(
    React.createElement(ProposalCard, {
      proposal: {
        id: 1n,
        title: "Test proposal",
        deadline: 100000n,
        ballotsCast: 12n,
        exists: true,
        resultsUnlocked: false,
        revealed: false,
        votingOpen: true,
      },
      secondsLeft: 3600,
      connected: false,
      hasVoted: false,
      pendingChoice: null,
      submitting: false,
      encryptStep: null,
      onVote: () => {},
      confirmedBallot: null,
      confirming: false,
      onConfirmBallot: () => {},
    }),
  );

  assert.match(html, /Ballots cast \(public\)/);
  assert.match(html, />12</);
});
