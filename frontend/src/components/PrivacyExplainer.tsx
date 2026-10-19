export function PrivacyExplainer() {
  return (
    <section className="panel explainer">
      <div className="panel-title">Why is this private?</div>
      <p className="panel-sub">No jargon, we promise.</p>

      <p>
        A normal on-chain vote is written to a public database that anyone can read forever. Here, your
        choice is <b>scrambled on your own device</b> before it is ever sent. What goes on-chain is a locked
        box, not the vote inside it.
      </p>

      <h4>The locked-box analogy</h4>
      <ul>
        <li>
          <b>You put your vote in a box and lock it</b> — encryption happens in your browser, so the
          plaintext never touches the network.
        </li>
        <li>
          <b>The box is added to a pile of identical locked boxes</b> — the contract cannot see inside any of
          them, and it holds no key.
        </li>
        <li>
          <b>The pile is weighed while still locked</b> — Fully Homomorphic Encryption lets the contract add
          encrypted numbers together and get an encrypted total, without ever opening a single box.
        </li>
        <li>
          <b>Only the totals are ever opened</b> — after the deadline, the two sums are decrypted and
          published. The individual boxes are never opened, by anyone.
        </li>
      </ul>

      <h4>What the contract can and cannot see</h4>
      <ul>
        <li>
          <b>Public:</b> that your address voted, when it voted, and how many ballots in total were cast.
        </li>
        <li>
          <b>Private:</b> whether you voted yes or no, and the running yes/no split before the reveal.
        </li>
      </ul>

      <h4>Why you can trust the reveal</h4>
      <p>
        When the owner publishes the results, the transaction carries a signature from the CoFHE Teecryptor
        (a hardware-attested decryption service). The contract verifies that signature on-chain, so the owner
        cannot invent a nicer number. A fake tally is simply rejected.
      </p>

      <h4>Why you can trust the tally mid-vote</h4>
      <p>
        The encrypted total changes with each ballot, but observers cannot read the yes/no split before the
        results are published. Wallet addresses and voting times remain public, so this hides choices rather
        than participation. Very small turnouts can make choices easier to infer from the final totals.
      </p>
    </section>
  );
}
