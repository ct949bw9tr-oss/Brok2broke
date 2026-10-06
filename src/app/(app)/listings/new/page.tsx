import type { Metadata } from "next";
import { ListingForm } from "@/components/listing-form";
import { requireStudent } from "@/server/auth/session";
import { createListing } from "@/server/actions/listings";

export const metadata: Metadata = { title: "Sell something" };

export default async function NewListingPage() {
  const { user, profile } = await requireStudent();
  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="page-head">
        <div>
          <span className="eyebrow">New listing</span>
          <h1 className="page-title">Turn clutter into cash 💸</h1>
        </div>
      </div>
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
