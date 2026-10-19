import { shortAddress } from "../lib/format";

interface Props {
  account: string | null;
  isSepolia: boolean;
  connecting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
}

export function ConnectWallet({ account, isSepolia, connecting, onConnect, onDisconnect }: Props) {
  if (!account) {
    return (
      <button className="btn btn-primary" onClick={onConnect} disabled={connecting}>
        {connecting ? <span className="spinner" /> : null}
        {connecting ? "Connecting" : "Connect wallet"}
      </button>
    );
  }

  return (
    <div className="wallet-chip">
      <div>
        <div className="addr">{shortAddress(account)}</div>
        <div className="net">{isSepolia ? "Sepolia" : "Wrong network"}</div>
      </div>
      <button className="btn btn-sm" onClick={onDisconnect} title="Disconnect">
        Disconnect
      </button>
    </div>
  );
}
