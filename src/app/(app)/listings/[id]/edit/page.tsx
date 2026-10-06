import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ListingForm } from "@/components/listing-form";
import { requireStudent } from "@/server/auth/session";
import { updateListing } from "@/server/actions/listings";
import { getListing } from "@/server/queries";

export const metadata: Metadata = { title: "Edit listing" };

export default async function EditListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireStudent();
  const listing = await getListing(id);
  if (!listing || listing.seller_id !== user.id || listing.status === "removed") notFound();
  if (listing.status === "sold") redirect(`/listings/${id}`);

  return (
    <div style={{ maxWidth: 720, margin: "0 auto" }}>
      <div className="page-head">
        <div>
          <span className="eyebrow">Edit listing</span>
          <h1 className="page-title">{listing.title}</h1>
        </div>
      </div>
      <ListingForm
        action={updateListing.bind(null, listing.id)}
        userId={user.id}
        submitLabel="Save changes"
        initial={{
          title: listing.title,
          description: listing.description,
          category: listing.category,
          condition: listing.condition,
          kind: listing.kind,
          price: listing.kind === "sell" ? String(listing.price_cents / 100) : "",
          campus_id: listing.campus_id,
          at_market: listing.at_market,
          photos: listing.photos,
        }}
      />
    </div>
  );
}
