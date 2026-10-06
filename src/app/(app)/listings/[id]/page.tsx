import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import {
  campusName,
  categoryOf,
  conditionLabel,
  formatMarketDate,
  listingPriceLabel,
  nextMarketDate,
  campusById,
  timeAgo,
} from "@/lib/catalog";
import { requireStudent } from "@/server/auth/session";
import { getListing, interestedBuyers, isSaved, myConversationForListing } from "@/server/queries";
import { Gallery } from "./gallery";
import { ContactSeller, OwnerControls, SaveButton } from "./listing-actions";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const listing = await getListing((await params).id);
  return { title: listing?.title ?? "Listing" };
}

export default async function ListingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string; sold?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const { user } = await requireStudent();
  const listing = await getListing(id);
  if (!listing) notFound();

  const isOwner = listing.seller_id === user.id;
  const category = categoryOf(listing.category);
  const available = listing.status === "active" || listing.status === "reserved";
  const [saved, buyers, conversationId] = await Promise.all([
    isOwner ? Promise.resolve(false) : isSaved(user.id, listing.id),
    isOwner ? interestedBuyers(listing.id) : Promise.resolve([]),
    isOwner ? Promise.resolve(null) : myConversationForListing(listing.id, user.id),
  ]);
  const sellerName = listing.seller?.full_name || "Student";
  const campus = campusById(listing.campus_id);
  const marketDate = campus ? nextMarketDate(new Date(), campus.timezone) : null;

  return (
    <div className="stack">
      <Link href="/browse" className="small muted">
        ← Back to browse
      </Link>

      {sp.new && (
        <div className="alert alert-success">🎉 Your listing is live! Share it with your class group chat.</div>
      )}
      {sp.sold && <div className="alert alert-success">Nice! Marked as sold. Thanks for helping us measure Broke2Broke.</div>}

      <div className="detail">
        <Gallery photos={listing.photos} emoji={category.emoji} title={listing.title} />

        <div className="stack">
          <div className="row">
            <span className="chip">
              {category.emoji} {category.label}
            </span>
            <span className="chip">{conditionLabel(listing.condition)}</span>
            {listing.status === "reserved" && <span className="chip chip-amber">Reserved</span>}
            {listing.status === "sold" && <span className="chip chip-coral">Sold</span>}
            {listing.status === "removed" && <span className="chip chip-coral">Removed</span>}
          </div>
          <div className="stack-sm">
            <h1 className="page-title">{listing.title}</h1>
            <div className="detail-price">{listingPriceLabel(listing)}</div>
            <span className="small muted">
              📍 {campusName(listing.campus_id)} campus · listed {timeAgo(listing.created_at)}
            </span>
          </div>

          {listing.at_market && available && marketDate && (
            <Link href="/market" className="alert alert-info" style={{ display: "block" }}>
              🧺 Coming to the Sunday Market on {formatMarketDate(marketDate)}. See it in person →
            </Link>
          )}

          {listing.description && <p className="description">{listing.description}</p>}

          <div className="card seller-card">
            <Avatar name={sellerName} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>{isOwner ? "You" : sellerName}</strong>
              <div className="row small" style={{ gap: 8 }}>
                <span className="verified">✓ Verified email</span>
                {listing.seller?.program && <span className="muted">· {listing.seller.program}</span>}
              </div>
            </div>
          </div>

          {isOwner ? (
            available ? (
              <OwnerControls
                listingId={listing.id}
                status={listing.status}
                atMarket={listing.at_market}
                kind={listing.kind}
                priceCents={listing.price_cents}
                buyers={buyers}
                currency={listing.currency}
              />
            ) : null
          ) : available ? (
            <div className="stack">
              {conversationId ? (
                <Link href={`/messages/${conversationId}`} className="btn btn-primary btn-lg btn-block">
                  💬 Continue the conversation
                </Link>
              ) : (
                <div className="card card-pop">
                  <ContactSeller listingId={listing.id} sellerFirstName={sellerName.split(" ")[0]} />
                </div>
              )}
              <div className="row">
                <SaveButton listingId={listing.id} saved={saved} />
                <span className="small muted">Meet in a public place on campus. Pay when you have the item.</span>
              </div>
            </div>
          ) : (
            <div className="alert alert-info">This item is no longer available.</div>
          )}
        </div>
      </div>
    </div>
  );
}
