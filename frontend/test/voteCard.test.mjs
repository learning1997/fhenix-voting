import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "vite";

let vite;
let buildVoteCardModel;
let buildShareText;
let buildXIntentUrl;
let buildCardFileName;

before(async () => {
  vite = await createServer({
    configFile: "vite.config.ts",
    server: { middlewareMode: true },
    appType: "custom",
  });
  ({ buildVoteCardModel, buildShareText, buildXIntentUrl, buildCardFileName } = await vite.ssrLoadModule(
    "/src/lib/voteCard.ts",
  ));
});

after(async () => {
  await vite?.close();
});

const proposal = {
  id: 2n,
  title: "Ship v2?",
  deadline: 1792431096n,
  ballotsCast: 5n,
  exists: true,
  resultsUnlocked: false,
  revealed: false,
  votingOpen: true,
};

test("the share card never carries the voter's choice", () => {
  const model = buildVoteCardModel(proposal);
  const serialised = JSON.stringify(model);

  assert.doesNotMatch(serialised, /\b(YES|NO)\b/);
  assert.equal(Object.keys(model).includes("choice"), false);
});

test("the share card names the proposal and the public ballot count", () => {
  const model = buildVoteCardModel(proposal);

  assert.equal(model.proposalLabel, "PROPOSAL #2");
  assert.equal(model.proposalTitle, "Ship v2?");
  assert.equal(model.ballotLine, "BALLOT #5");
  assert.deepEqual(model.headline, ["I VOTED", "PRIVATELY."]);
});

test("the share card explains that both tallies stay sealed", () => {
  const model = buildVoteCardModel(proposal);

  assert.equal(model.sealedLabel, "SEALED TALLY");
  assert.equal(model.sealedCaption.length, 2);
  assert.match(model.sealedCaption.join(" "), /encrypted/i);
  assert.match(model.sealedCaption.join(" "), /owner/i);
  assert.doesNotMatch(JSON.stringify(model.sealedCaption), /\b(YES|NO)\b/);
});

test("the share text stays private and free of the choice", () => {
  const text = buildShareText(buildVoteCardModel(proposal));

  assert.match(text, /Ship v2\?/);
  assert.match(text, /encrypted/i);
  assert.doesNotMatch(text, /\b(YES|NO)\b/);
});

test("the X intent url encodes text and url", () => {
  assert.equal(
    buildXIntentUrl("private vote", "https://example.com/a b"),
    "https://twitter.com/intent/tweet?text=private%20vote&url=https%3A%2F%2Fexample.com%2Fa%20b",
  );

  const full = buildXIntentUrl(buildShareText(buildVoteCardModel(proposal)), "https://example.com");
  assert.match(full, /^https:\/\/twitter\.com\/intent\/tweet\?text=/);
  assert.doesNotMatch(full, /[^\x21-\x7e]/);
});

test("the downloaded file is named after the proposal", () => {
  assert.equal(buildCardFileName(2n), "private-voting-ballot-2.png");
});
