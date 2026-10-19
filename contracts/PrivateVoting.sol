// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {FHE, euint32, externalEuint32, ebool} from "@fhenixprotocol/cofhe-contracts/FHE.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title PrivateVoting
 * @notice Confidential yes/no voting powered by Fhenix CoFHE.
 *
 * How privacy works here:
 *  - A ballot arrives as an `externalEuint32` ciphertext plus a proof. `FHE.asEuint32` verifies that
 *    proof and turns it into an on-chain `euint32` handle.
 *  - The running tallies (`yesVotes`, `noVotes`) are `euint32` ciphertexts. `FHE.add` adds a ballot to
 *    a tally without either operand ever being decrypted.
 *  - Nothing about an individual ballot is ever written in plaintext. The contract itself cannot read
 *    the numbers it is adding - it only holds handles to ciphertexts that the CoFHE coprocessor
 *    operates on off-chain.
 *  - Only after the deadline does the owner mark the two tallies publicly decryptable
 *    (`FHE.allowPublic`). The owner then fetches the plaintexts off-chain and publishes them back with
 *    a Teecryptor signature, which `FHE.publishDecryptResult` verifies on-chain.
 *
 * What is public: who voted, when, and how many ballots were cast.
 * What is private: how any individual voted, and the running tally until results are revealed.
 */
contract PrivateVoting is Ownable {
    struct Proposal {
        string title;
        uint64 deadline; // unix timestamp (seconds)
        euint32 yesVotes; // encrypted tally of "yes"
        euint32 noVotes; // encrypted tally of "no"
        uint32 ballotsCast; // plaintext count of ballots - NOT the tally
        bool exists;
        bool resultsUnlocked; // allowPublic has been called on the tallies
        bool revealed; // plaintext tallies have been published
        bool cancelled; // owner has retired the proposal; it stops accepting votes and hides
    }

    uint256 public proposalCount;

    mapping(uint256 => Proposal) private _proposals;

    /// @notice proposalId => voter => already voted
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    /// @notice proposalId => voter => that voter's own encrypted ballot. Only they can decrypt it.
    mapping(uint256 => mapping(address => euint32)) private _ballots;

    /// @notice Published (plaintext) results, only populated after `revealResults`.
    mapping(uint256 => uint32) public revealedYes;
    mapping(uint256 => uint32) public revealedNo;

    event ProposalCreated(uint256 indexed proposalId, string title, uint64 deadline);
    event VoteCast(uint256 indexed proposalId, address indexed voter, bytes32 encryptedBallot);
    event ResultsUnlocked(uint256 indexed proposalId);
    event ResultRevealed(uint256 indexed proposalId, uint32 yesVotes, uint32 noVotes);
    event ProposalCancelled(uint256 indexed proposalId);

    error UnknownProposal(uint256 proposalId);
    error VotingClosed(uint256 proposalId);
    error VotingStillOpen(uint256 proposalId);
    error AlreadyVoted(uint256 proposalId, address voter);
    error DeadlineNotInFuture(uint64 deadline);
    error ResultsAlreadyUnlocked(uint256 proposalId);
    error ResultsNotUnlocked(uint256 proposalId);
    error ResultsAlreadyRevealed(uint256 proposalId);
    error ProposalNotActive(uint256 proposalId);
    error ProposalAlreadyCancelled(uint256 proposalId);

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ---------------------------------------------------------------------
    // Admin
    // ---------------------------------------------------------------------

    /**
     * @notice Create a new proposal.
     * @param title Human readable question, e.g. "Upgrade the treasury to v2?"
     * @param deadline Unix timestamp (seconds) at which voting closes.
     */
    function createProposal(string calldata title, uint64 deadline) external onlyOwner returns (uint256 proposalId) {
        if (deadline <= block.timestamp) revert DeadlineNotInFuture(deadline);

        proposalId = ++proposalCount;
        Proposal storage p = _proposals[proposalId];
        p.title = title;
        p.deadline = deadline;
        p.exists = true;

        // Start both encrypted tallies at encrypted zero and keep access for this contract.
        p.yesVotes = FHE.asEuint32(0);
        p.noVotes = FHE.asEuint32(0);
        FHE.allowThis(p.yesVotes);
        FHE.allowThis(p.noVotes);

        emit ProposalCreated(proposalId, title, deadline);
    }

    /**
     * @notice Retire a proposal: it stops accepting votes and is hidden from the app.
     * @dev One-way. Ballots already cast stay on-chain; the proposal just leaves the active set.
     *      Cancelling a proposal with no ballots is how the owner removes a mistaken or test entry.
     */
    function cancelProposal(uint256 proposalId) external onlyOwner {
        Proposal storage p = _proposals[proposalId];
        if (!p.exists) revert UnknownProposal(proposalId);
        if (p.cancelled) revert ProposalAlreadyCancelled(proposalId);

        p.cancelled = true;
        emit ProposalCancelled(proposalId);
    }

    // ---------------------------------------------------------------------
    // Voting
    // ---------------------------------------------------------------------

    /**
     * @notice Cast an encrypted yes (1) / no (0) ballot.
     * @dev `encryptedVote` is produced client-side by @cofhe/sdk; `inputProof` proves the encryption is
     *      well-formed and bound to this contract. Both are required, and the client must be the
     *      `msg.sender` that encrypted them.
     */
    function vote(uint256 proposalId, externalEuint32 encryptedVote, bytes calldata inputProof) external {
        Proposal storage p = _proposals[proposalId];
        if (!p.exists) revert UnknownProposal(proposalId);
        if (p.cancelled) revert ProposalNotActive(proposalId);
        if (block.timestamp >= p.deadline) revert VotingClosed(proposalId);
        if (hasVoted[proposalId][msg.sender]) revert AlreadyVoted(proposalId, msg.sender);
        hasVoted[proposalId][msg.sender] = true;

        // Verify the client-supplied ciphertext and turn it into a usable encrypted value.
        euint32 rawVote = FHE.asEuint32(encryptedVote, inputProof);

        // A ballot must be exactly 0 or 1. We cannot `require` on encrypted data, so instead we
        // normalise homomorphically: anything greater than 1 is treated as an abstain/no.
        euint32 one = FHE.asEuint32(1);
        euint32 zero = FHE.asEuint32(0);
        ebool isValid = FHE.lte(rawVote, one);
        euint32 ballot = FHE.select(isValid, rawVote, zero);
        euint32 notBallot = FHE.sub(one, ballot);

        // Encrypted accumulation - neither tally is ever decrypted to do this.
        p.yesVotes = FHE.add(p.yesVotes, ballot);
        p.noVotes = FHE.add(p.noVotes, notBallot);

        // Handles change on every FHE operation, so permissions must be re-granted.
        FHE.allowThis(p.yesVotes);
        FHE.allowThis(p.noVotes);

        // Let the voter decrypt their own ballot later, to confirm it was recorded.
        FHE.allowThis(ballot);
        FHE.allow(ballot, msg.sender);
        _ballots[proposalId][msg.sender] = ballot;

        p.ballotsCast += 1;

        emit VoteCast(proposalId, msg.sender, FHE.unwrap(ballot));
    }

    // ---------------------------------------------------------------------
    // Reveal (two-phase, CoFHE style)
    // ---------------------------------------------------------------------

    /**
     * @notice Phase 1: mark the tallies publicly decryptable. Owner only, after the deadline.
     * @dev After this call anyone can fetch the plaintexts off-chain (no ACP needed), but the values are
     *      not written on-chain until `revealResults` publishes them.
     */
    function unlockResults(uint256 proposalId) external onlyOwner {
        Proposal storage p = _proposals[proposalId];
        if (!p.exists) revert UnknownProposal(proposalId);
        if (block.timestamp < p.deadline) revert VotingStillOpen(proposalId);
        if (p.resultsUnlocked) revert ResultsAlreadyUnlocked(proposalId);

        FHE.allowPublic(p.yesVotes);
        FHE.allowPublic(p.noVotes);
        p.resultsUnlocked = true;

        emit ResultsUnlocked(proposalId);
    }

    /**
     * @notice Phase 2: publish the decrypted tallies on-chain.
     * @dev The owner obtains `{ plaintext, signature }` from the CoFHE Teecryptor via
     *      `client.decryptForTx(handle).withoutACP()` and submits them here.
     *      `FHE.publishDecryptResult` reverts unless the Teecryptor signature is valid, so the owner
     *      cannot lie about the result.
     */
    function revealResults(
        uint256 proposalId,
        uint32 yesPlaintext,
        bytes calldata yesSignature,
        uint32 noPlaintext,
        bytes calldata noSignature
    ) external onlyOwner {
        Proposal storage p = _proposals[proposalId];
        if (!p.exists) revert UnknownProposal(proposalId);
        if (!p.resultsUnlocked) revert ResultsNotUnlocked(proposalId);
        if (p.revealed) revert ResultsAlreadyRevealed(proposalId);

        FHE.publishDecryptResult(p.yesVotes, yesPlaintext, yesSignature);
        FHE.publishDecryptResult(p.noVotes, noPlaintext, noSignature);

        p.revealed = true;
        revealedYes[proposalId] = yesPlaintext;
        revealedNo[proposalId] = noPlaintext;

        emit ResultRevealed(proposalId, yesPlaintext, noPlaintext);
    }

    // ---------------------------------------------------------------------
    // Reads
    // ---------------------------------------------------------------------

    struct ProposalView {
        uint256 id;
        string title;
        uint64 deadline;
        uint32 ballotsCast;
        bool exists;
        bool resultsUnlocked;
        bool revealed;
        bool cancelled;
        bool votingOpen;
    }

    function getProposal(uint256 proposalId) external view returns (ProposalView memory view_) {
        Proposal storage p = _proposals[proposalId];
        view_ = ProposalView({
            id: proposalId,
            title: p.title,
            deadline: p.deadline,
            ballotsCast: p.ballotsCast,
            exists: p.exists,
            resultsUnlocked: p.resultsUnlocked,
            revealed: p.revealed,
            cancelled: p.cancelled,
            votingOpen: p.exists && !p.cancelled && block.timestamp < p.deadline
        });
    }

    /**
     * @notice The raw ciphertext handles for the two tallies.
     * @dev Handles are public identifiers, not values. Returning them reveals nothing; only decryption
     *      (possible after `allowPublic`) turns them into numbers.
     */
    function getEncryptedTally(uint256 proposalId) external view returns (euint32 yesVotes, euint32 noVotes) {
        Proposal storage p = _proposals[proposalId];
        if (!p.exists) revert UnknownProposal(proposalId);
        return (p.yesVotes, p.noVotes);
    }

    /// @notice The caller's own encrypted ballot, decryptable only by the caller.
    function getMyBallot(uint256 proposalId) external view returns (euint32 ballot) {
        return _ballots[proposalId][msg.sender];
    }
}
