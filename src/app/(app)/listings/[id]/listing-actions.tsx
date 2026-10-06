"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { markSold, setListingStatus, toggleMarket, toggleSave } from "@/server/actions/listings";
import { contactSeller } from "@/server/actions/messages";

const QUICK = ["Is this still available?", "Can I see it at the Sunday Market?", "Would you take less?"];

export function ContactSeller({ listingId, sellerFirstName }: { listingId: string; sellerFirstName: string }) {
  const [state, action] = useActionState(contactSeller.bind(null, listingId), undefined);
  const [body, setBody] = useState("");
  return (
    <form action={action} className="stack-sm">
      <label className="label" htmlFor="contact-body">
        Message {sellerFirstName}
      </label>
      <div className="quick-replies">
        {QUICK.map((q) => (
          <button key={q} type="button" className="btn btn-sm" onClick={() => setBody(q)}>
            {q}
          </button>
        ))}
      </div>
      <textarea
        id="contact-body"
        name="body"
        className="textarea"
        style={{ minHeight: 90 }}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Hi! I'm interested…"
        maxLength={2000}
        required
      />
      {state?.error && <span className="field-error">{state.error}</span>}
      <SubmitButton className="btn btn-primary btn-lg btn-block" pendingLabel="Sending…">
        Send message
      </SubmitButton>
    </form>
  );
}

export function SaveButton({ listingId, saved }: { listingId: string; saved: boolean }) {
  return (
    <form action={toggleSave.bind(null, listingId, !saved)}>
      <SubmitButton className="btn" aria-pressed={saved} pendingLabel={saved ? "Saved ♥" : "Save ♡"}>
        {saved ? "Saved ♥" : "Save ♡"}
      </SubmitButton>
    </form>
  );
}

export function OwnerControls({
  listingId,
  status,
  atMarket,
  kind,
  priceCents,
  buyers,
  currency,
}: {
  listingId: string;
  status: string;
  atMarket: boolean;
  kind: string;
  priceCents: number;
  buyers: { id: string; full_name: string }[];
  currency: string;
}) {
  const [soldState, soldAction] = useActionState(markSold.bind(null, listingId), undefined);
  const [confirmRemove, setConfirmRemove] = useState(false);

  return (
    <div className="stack">
      <div className="row">
        <Link href={`/listings/${listingId}/edit`} className="btn btn-sm">
          ✏️ Edit
        </Link>
        <form action={setListingStatus.bind(null, listingId, status === "reserved" ? "active" : "reserved")}>
          <SubmitButton className="btn btn-sm">{status === "reserved" ? "Mark available" : "Mark reserved"}</SubmitButton>
        </form>
        <form action={toggleMarket.bind(null, listingId, !atMarket)}>
          <SubmitButton className="btn btn-sm">{atMarket ? "Not bringing to market" : "🧺 Bring to Sunday Market"}</SubmitButton>
        </form>
      </div>

      <details className="card disclosure">
        <summary className="row between">
          <strong>🎉 Sold it? Mark as sold</strong>
          <span className="muted small">Helps us measure what works</span>
        </summary>
        <form action={soldAction} className="stack" style={{ marginTop: 14 }}>
          {soldState?.error && (
            <div className="alert alert-error" role="alert">
              {soldState.error}
            </div>
          )}
          <div className="field">
            <label className="label" htmlFor="buyer_id">
              Who bought it?
            </label>
            <select id="buyer_id" name="buyer_id" className="select" defaultValue={buyers.length === 1 ? buyers[0].id : ""}>
              <option value="">Someone not on Broke2Broke / I&apos;d rather not say</option>
              {buyers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.full_name}
                </option>
              ))}
            </select>
          </div>
          <div className="form-grid">
            <div className="field">
              <label className="label" htmlFor="sold-price">
                Final price ({currency})
              </label>
              <input
                id="sold-price"
                name="price"
                className="input"
                inputMode="decimal"
                defaultValue={kind === "sell" ? String(priceCents / 100) : "0"}
              />
            </div>
            <div className="field">
              <span className="label">Where did you hand it over?</span>
              <div className="segmented">
                <label>
                  <input type="radio" name="channel" value="meetup" defaultChecked={!atMarket} />
                  <span>Meetup</span>
                </label>
                <label>
                  <input type="radio" name="channel" value="sunday_market" defaultChecked={atMarket} />
                  <span>Sunday Market</span>
                </label>
              </div>
            </div>
          </div>
          <SubmitButton className="btn btn-dark" pendingLabel="Saving…">
            Confirm sale
          </SubmitButton>
        </form>
      </details>

      {confirmRemove ? (
        <div className="row">
          <span className="small">Remove this listing for good?</span>
          <form action={setListingStatus.bind(null, listingId, "removed")}>
            <SubmitButton className="btn btn-sm btn-danger">Yes, remove</SubmitButton>
          </form>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmRemove(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-sm btn-ghost" style={{ alignSelf: "flex-start" }} onClick={() => setConfirmRemove(true)}>
          🗑 Remove listing
        </button>
      )}
    </div>
  );
}
