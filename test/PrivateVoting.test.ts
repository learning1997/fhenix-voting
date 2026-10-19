import { expect } from "chai";
import hre from "hardhat";
import { Encryptable, FheTypes, type CofheClient } from "@cofhe/sdk";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { Contract } from "ethers";
import { ethers } from "ethers";

const DAY = 24 * 60 * 60;

describe("PrivateVoting", () => {
  let owner: HardhatEthersSigner;
  let alice: HardhatEthersSigner;
  let bob: HardhatEthersSigner;

  let ownerClient: CofheClient;
  let aliceClient: CofheClient;
  let bobClient: CofheClient;

  let voting: Contract;
  let deadline: number;

  /** Encrypt a ballot client-side, bound to the voting contract that will consume it. */
  async function encryptBallot(client: CofheClient, value: bigint) {
    const [handle, proof] = await client
      .encryptInputs([Encryptable.uint32(value)])
      .setConsumingContract(await voting.getAddress())
      .execute();
    return { handle, proof };
  }

  async function castVote(client: CofheClient, voter: HardhatEthersSigner, value: bigint) {
    const { handle, proof } = await encryptBallot(client, value);
    return voting.connect(voter).vote(1, handle, proof);
  }

  beforeEach(async () => {
    [owner, alice, bob] = await hre.ethers.getSigners();

    ownerClient = await hre.cofhe.createClientWithBatteries(owner);
    aliceClient = await hre.cofhe.createClientWithBatteries(alice);
    bobClient = await hre.cofhe.createClientWithBatteries(bob);

    voting = await hre.ethers.deployContract("PrivateVoting", [owner.address]);
    await voting.waitForDeployment();

    deadline = (await time.latest()) + DAY;
    await voting.connect(owner).createProposal("Ship v2?", deadline);
  });

  describe("proposals", () => {
    it("lets the owner open a proposal", async () => {
      const p = await voting.getProposal(1);
      expect(p.title).to.equal("Ship v2?");
      expect(p.deadline).to.equal(BigInt(deadline));
      expect(p.exists).to.equal(true);
      expect(p.votingOpen).to.equal(true);
      expect(p.ballotsCast).to.equal(0n);
      expect(await voting.proposalCount()).to.equal(1n);
    });

    it("rejects proposals from non-owners", async () => {
      await expect(
        voting.connect(alice).createProposal("Rogue", deadline + DAY),
      ).to.be.revertedWithCustomError(voting, "OwnableUnauthorizedAccount");
    });

    it("rejects a deadline in the past", async () => {
      const past = (await time.latest()) - 1;
      await expect(voting.connect(owner).createProposal("Late", past))
        .to.be.revertedWithCustomError(voting, "DeadlineNotInFuture")
        .withArgs(BigInt(past));
    });

    it("rejects unknown proposals", async () => {
      const { handle, proof } = await encryptBallot(aliceClient, 1n);
      await expect(voting.connect(alice).vote(99, handle, proof))
        .to.be.revertedWithCustomError(voting, "UnknownProposal")
        .withArgs(99n);
    });
  });

  describe("voting", () => {
    it("stores the ballot as a ciphertext and keeps the tally encrypted", async () => {
      await castVote(aliceClient, alice, 1n);

      const { yesVotes, noVotes } = await voting.getEncryptedTally(1);

      // Test-only introspection into the mock coprocessor's plaintext store.
      await hre.cofhe.mocks.expectPlaintext(yesVotes, 1n);
      await hre.cofhe.mocks.expectPlaintext(noVotes, 0n);

      const p = await voting.getProposal(1);
      expect(p.ballotsCast).to.equal(1n);
      expect(p.revealed).to.equal(false);
      expect(await voting.hasVoted(1, alice.address)).to.equal(true);
    });

    it("counts a no vote in the no tally", async () => {
      await castVote(aliceClient, alice, 0n);
      const { yesVotes, noVotes } = await voting.getEncryptedTally(1);
      await hre.cofhe.mocks.expectPlaintext(yesVotes, 0n);
      await hre.cofhe.mocks.expectPlaintext(noVotes, 1n);
    });

    it("tallies several encrypted votes homomorphically", async () => {
      await castVote(aliceClient, alice, 1n);
      await castVote(bobClient, bob, 1n);
      await castVote(ownerClient, owner, 0n);

      const { yesVotes, noVotes } = await voting.getEncryptedTally(1);
      await hre.cofhe.mocks.expectPlaintext(yesVotes, 2n);
      await hre.cofhe.mocks.expectPlaintext(noVotes, 1n);

      expect((await voting.getProposal(1)).ballotsCast).to.equal(3n);
    });

    it("normalises out-of-range ballots instead of letting them skew the tally", async () => {
      await castVote(aliceClient, alice, 7n); // 7 is neither yes nor no

      const { yesVotes, noVotes } = await voting.getEncryptedTally(1);
      await hre.cofhe.mocks.expectPlaintext(yesVotes, 0n);
      await hre.cofhe.mocks.expectPlaintext(noVotes, 1n);
    });

    it("emits VoteCast carrying only an encrypted ballot handle", async () => {
      const { handle, proof } = await encryptBallot(aliceClient, 1n);
      const receipt = await (await voting.connect(alice).vote(1, handle, proof)).wait();

      const event = receipt!.logs
        .map((log) => {
          try {
            return voting.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsed) => parsed?.name === "VoteCast");

      expect(event, "VoteCast was not emitted").to.not.be.undefined;
      expect(event!.args.proposalId).to.equal(1n);
      expect(event!.args.voter).to.equal(alice.address);

      // The event carries a ciphertext handle, not a choice. Note it differs from the handle the client
      // submitted: every FHE operation (here, the FHE.select that normalises the ballot) yields a new
      // ciphertext with a fresh handle, so a handle identifies one specific ciphertext, not a value.
      const emitted = event!.args.encryptedBallot as string;
      expect(emitted).to.match(/^0x[0-9a-fA-F]{64}$/);
      expect(emitted).to.not.equal(ethers.ZeroHash);
    });

    it("prevents double voting", async () => {
      await castVote(aliceClient, alice, 1n);
      const { handle, proof } = await encryptBallot(aliceClient, 1n);

      await expect(voting.connect(alice).vote(1, handle, proof))
        .to.be.revertedWithCustomError(voting, "AlreadyVoted")
        .withArgs(1n, alice.address);
    });

    it("closes voting at the deadline", async () => {
      await castVote(aliceClient, alice, 1n);
      await time.increaseTo(deadline);

      const { handle, proof } = await encryptBallot(bobClient, 1n);
      await expect(voting.connect(bob).vote(1, handle, proof))
        .to.be.revertedWithCustomError(voting, "VotingClosed")
        .withArgs(1n);
    });

    it("lets a voter decrypt their own ballot with their own ACP", async () => {
      await castVote(aliceClient, alice, 0n);

      const aliceBallot = await voting.connect(alice).getMyBallot(1);
      const decrypted = await aliceClient.decryptForView(aliceBallot, FheTypes.Uint32).execute();
      expect(decrypted).to.equal(0n);
    });

    it("does not let a third party decrypt someone else's ballot", async () => {
      await castVote(aliceClient, alice, 1n);

      // Bob obtains the handle of Alice's ballot, but has no ACL permission on it.
      const aliceBallot = await voting.connect(alice).getMyBallot(1);

      let threw = false;
      try {
        await bobClient.decryptForView(aliceBallot, FheTypes.Uint32).execute();
      } catch {
        threw = true;
      }
      expect(threw).to.equal(true);
    });
  });

  describe("reveal", () => {
    it("cannot unlock before the deadline, and cannot be unlocked by a stranger", async () => {
      await expect(voting.connect(owner).unlockResults(1))
        .to.be.revertedWithCustomError(voting, "VotingStillOpen")
        .withArgs(1n);

      await time.increaseTo(deadline);
      await expect(voting.connect(alice).unlockResults(1)).to.be.revertedWithCustomError(
        voting,
        "OwnableUnauthorizedAccount",
      );
    });

    it("cannot publish results before unlocking", async () => {
      await time.increaseTo(deadline);

      // The guard runs before the signatures are ever checked, so placeholders are fine here.
      await expect(voting.connect(owner).revealResults(1, 0n, "0x", 0n, "0x"))
        .to.be.revertedWithCustomError(voting, "ResultsNotUnlocked")
        .withArgs(1n);
    });

    it("keeps the tally sealed right up until the reveal", async () => {
      await castVote(aliceClient, alice, 1n);
      await castVote(bobClient, bob, 0n);

      const before = await voting.getProposal(1);
      expect(before.revealed).to.equal(false);
      expect(await voting.revealedYes(1)).to.equal(0n);
      expect(await voting.revealedNo(1)).to.equal(0n);

      await time.increaseTo(deadline);
      await voting.connect(owner).unlockResults(1);

      const after = await voting.getProposal(1);
      expect(after.resultsUnlocked).to.equal(true);
      expect(after.revealed).to.equal(false);
      expect(await voting.revealedYes(1)).to.equal(0n);
    });

    it("reveals the final tally through the two-phase decrypt flow", async () => {
      await castVote(aliceClient, alice, 1n);
      await castVote(bobClient, bob, 1n);
      await castVote(ownerClient, owner, 0n);

      await time.increaseTo(deadline);

      // Phase 1: the owner makes the tallies publicly decryptable.
      await expect(voting.connect(owner).unlockResults(1))
        .to.emit(voting, "ResultsUnlocked")
        .withArgs(1n);

      const { yesVotes, noVotes } = await voting.getEncryptedTally(1);

      // Phase 2: fetch plaintext + Teecryptor signature off-chain (no ACP needed now), publish on-chain.
      const yes = await ownerClient.decryptForTx(yesVotes).withoutACP().execute();
      const no = await ownerClient.decryptForTx(noVotes).withoutACP().execute();

      expect(yes.decryptedValue).to.equal(2n);
      expect(no.decryptedValue).to.equal(1n);

      await expect(
        voting
          .connect(owner)
          .revealResults(1, yes.decryptedValue, yes.signature, no.decryptedValue, no.signature),
      )
        .to.emit(voting, "ResultRevealed")
        .withArgs(1n, 2n, 1n);

      expect(await voting.revealedYes(1)).to.equal(2n);
      expect(await voting.revealedNo(1)).to.equal(1n);
      expect((await voting.getProposal(1)).revealed).to.equal(true);
    });

    it("rejects a plaintext tally that does not match its Teecryptor signature", async () => {
      await castVote(aliceClient, alice, 1n);
      await time.increaseTo(deadline);
      await voting.connect(owner).unlockResults(1);

      const { yesVotes, noVotes } = await voting.getEncryptedTally(1);
      const yes = await ownerClient.decryptForTx(yesVotes).withoutACP().execute();
      const no = await ownerClient.decryptForTx(noVotes).withoutACP().execute();

      await expect(
        voting
          .connect(owner)
          .revealResults(1, yes.decryptedValue + 1n, yes.signature, no.decryptedValue, no.signature),
      ).to.be.reverted;
      expect((await voting.getProposal(1)).revealed).to.equal(false);
    });

    it("reveals a clean zero for a proposal that received no ballots", async () => {
      await time.increaseTo(deadline);
      await voting.connect(owner).unlockResults(1);

      const { yesVotes, noVotes } = await voting.getEncryptedTally(1);
      const yes = await ownerClient.decryptForTx(yesVotes).withoutACP().execute();
      const no = await ownerClient.decryptForTx(noVotes).withoutACP().execute();

      expect(yes.decryptedValue).to.equal(0n);
      expect(no.decryptedValue).to.equal(0n);

      await expect(
        voting
          .connect(owner)
          .revealResults(1, yes.decryptedValue, yes.signature, no.decryptedValue, no.signature),
      )
        .to.emit(voting, "ResultRevealed")
        .withArgs(1n, 0n, 0n);
    });

    it("refuses to reveal twice", async () => {
      await castVote(aliceClient, alice, 1n);
      await time.increaseTo(deadline);
      await voting.connect(owner).unlockResults(1);

      const { yesVotes, noVotes } = await voting.getEncryptedTally(1);
      const yes = await ownerClient.decryptForTx(yesVotes).withoutACP().execute();
      const no = await ownerClient.decryptForTx(noVotes).withoutACP().execute();

      await voting
        .connect(owner)
        .revealResults(1, yes.decryptedValue, yes.signature, no.decryptedValue, no.signature);

      await expect(
        voting
          .connect(owner)
          .revealResults(1, yes.decryptedValue, yes.signature, no.decryptedValue, no.signature),
      )
        .to.be.revertedWithCustomError(voting, "ResultsAlreadyRevealed")
        .withArgs(1n);
    });
  });
});
