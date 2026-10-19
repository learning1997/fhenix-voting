import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProposalView } from "../lib/voting";
import {
  buildCardFileName,
  buildShareText,
  buildVoteCardModel,
  buildXIntentUrl,
  renderVoteCard,
  siteUrl,
} from "../lib/voteCard";

interface Props {
  proposal: ProposalView;
}

/**
 * Draws the shareable "I voted privately" card in the browser and offers ways to post it.
 * Nothing is uploaded: the PNG is created locally and only leaves the device when the voter shares it.
 */
export function VoteCard({ proposal }: Props) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shared, setShared] = useState(false);
  const objectUrl = useRef<string | null>(null);

  const model = useMemo(
    () => buildVoteCardModel(proposal),
    [proposal.id, proposal.title, proposal.ballotsCast],
  );

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    [],
  );

  const generate = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const next = await renderVoteCard(model);
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
      const nextUrl = URL.createObjectURL(next);
      objectUrl.current = nextUrl;
      setBlob(next);
      setPreviewUrl(nextUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not build the card image");
    } finally {
      setBusy(false);
    }
  }, [model]);

  // The card is ready the moment the ballot lands, so build it without being asked.
  useEffect(() => {
    void generate();
  }, [generate]);

  const fileName = buildCardFileName(proposal.id);
  const intent = buildXIntentUrl(buildShareText(model), siteUrl());
  const shareText = buildShareText(model);

  const canShareFile =
    typeof navigator !== "undefined" &&
    typeof navigator.canShare === "function" &&
    blob !== null &&
    navigator.canShare({ files: [new File([blob], fileName, { type: "image/png" })] });

  const shareToDevice = async () => {
    if (!blob) return;
    try {
      await navigator.share({
        files: [new File([blob], fileName, { type: "image/png" })],
        text: shareText,
      });
      setShared(true);
    } catch {
      /* the voter dismissed the sheet */
    }
  };

  return (
    <div className="share-card">
      <div className="share-card-head">
        <span className="share-card-title">Share card</span>
        <span className="share-card-sub">Drawn on your device / it never names your choice</span>
      </div>

      <div className="share-card-stage">
        {previewUrl ? (
          <img className="share-preview" src={previewUrl} alt="Your private voting card" />
        ) : (
          <div className="share-placeholder">
            {busy ? <span className="spinner" /> : null}
            {busy ? "Drawing your card" : error ? "Card unavailable" : "Preparing"}
          </div>
        )}
      </div>

      {error && (
        <div className="notice error" style={{ marginTop: 12 }}>
          <span className="icon">!</span>
          <div>{error}</div>
        </div>
      )}

      <div className="share-card-actions">
        {previewUrl && (
          <a className="btn btn-primary" href={previewUrl} download={fileName}>
            Download PNG
          </a>
        )}
        {canShareFile && (
          <button className="btn" onClick={shareToDevice}>
            Share
          </button>
        )}
        <a className="btn" href={intent} target="_blank" rel="noreferrer">
          Post on X
        </a>
        {!previewUrl && !busy && (
          <button className="btn" onClick={generate}>
            Retry
          </button>
        )}
      </div>

      <p className="share-note">
        X cannot attach an image from a link, so the post opens with your text and you attach the
        downloaded card. {shared ? "Shared to your device just now." : ""}
      </p>
    </div>
  );
}
