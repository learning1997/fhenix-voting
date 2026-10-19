import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let vite;
let OwnerPanel;

before(async () => {
  vite = await createServer({
    configFile: "vite.config.ts",
    server: { middlewareMode: true },
    appType: "custom",
  });
  ({ OwnerPanel } = await vite.ssrLoadModule("/src/components/OwnerPanel.tsx"));
});

after(async () => {
  await vite?.close();
});

function render(props) {
  return renderToStaticMarkup(
    React.createElement(OwnerPanel, { signer: null, onCreated: () => {}, ...props }),
  );
}

test("the owner panel offers a proposal title and a voting deadline", () => {
  const html = render({ isOwner: true, isSepolia: true });

  assert.match(html, /Owner controls/i);
  assert.match(html, /Create proposal/i);
  assert.match(html, /datetime-local/);
  assert.match(html, /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  assert.match(html, /Voting closes/i);
});

test("the owner panel stays hidden for a non-owner wallet", () => {
  assert.equal(render({ isOwner: false, isSepolia: true }), "");
});

test("the owner panel tells the owner to switch networks when not on Sepolia", () => {
  const html = render({ isOwner: true, isSepolia: false });

  assert.match(html, /Sepolia/);
  assert.doesNotMatch(html, /Create proposal/);
});
