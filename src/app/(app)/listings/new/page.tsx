import type { Metadata } from "next";
import { ListingForm } from "@/components/listing-form";
import { SubmitButton } from "@/components/submit-button";
import { startPayoutSetup } from "@/server/actions/payments";
import { myPayoutAccount } from "@/server/queries";
import { getPayments } from "@/server/stripe";
import { requireStudent } from "@/server/auth/session";
import { createListing } from "@/server/actions/listings";

export const metadata: Metadata = { title: "Sell something" };

export default async function NewListingPage() {
  const { user, profile } = await requireStudent();
  const needsPayouts = getPayments() !== null && !(await myPayoutAccount(user.id))?.ready;
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="page-head">
        <div>
          <span className="eyebrow">New listing</span>
          <h1 className="page-title">Turn clutter into cash 💸</h1>
        </div>
      </div>
      {needsPayouts && (
        <div className="card card-pop stack" style={{ marginBottom: 16 }}>
          <strong>💳 First, connect your bank (3 min, only once)</strong>
          <p className="small text-2">
            Everything for sale on Broke2Broke can be bought by card in the app, and the money goes straight to your
            bank. You can still post free and swap items without it.
          </p>
          <form action={startPayoutSetup}>
            <SubmitButton className="btn btn-primary" pendingLabel="Opening Stripe…">
              Connect my bank →
            </SubmitButton>
          </form>
        </div>
      )}
      <ListingForm
        action={createListing}
        userId={user.id}
        submitLabel="Publish listing"
        initial={{
          title: "",
          description: "",
          category: "",
          condition: "",
          kind: "sell",
          price: "",
          campus_id: profile.campus_id,
          at_market: false,
          photos: [],
        }}
      />
    </div>
  );
}
