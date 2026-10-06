import Link from "next/link";
import { campusName, categoryOf, listingPriceLabel, photoUrl, timeAgo } from "@/lib/catalog";
import type { ListingCard as ListingCardData } from "@/server/queries";

export function ListingCard({ listing, showCampus }: { listing: ListingCardData; showCampus?: boolean }) {
  const cover = listing.photos[0];
  const category = categoryOf(listing.category);
  const dim = listing.status === "sold";
  return (
    <Link href={`/listings/${listing.id}`} className="listing-card">
      <div className={dim ? "listing-thumb is-dim" : "listing-thumb"}>
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element -- Supabase Storage URL, resized on upload
          <img src={photoUrl(cover)} alt="" loading="lazy" />
        ) : (
          <div className="placeholder" aria-hidden>
            {category.emoji}
          </div>
        )}
        <div className="badges">
          {listing.status === "reserved" && <span className="chip chip-amber">Reserved</span>}
          {listing.status === "sold" && <span className="chip">Sold</span>}
          {listing.at_market && listing.status !== "sold" && <span className="chip chip-lime">Sunday Market</span>}
        </div>
        <span className="price-tag">{listingPriceLabel(listing)}</span>
      </div>
      <div className="listing-meta">
        <div className="listing-title">{listing.title}</div>
        <div className="small muted">
          {showCampus ? `${campusName(listing.campus_id)} · ` : ""}
          {listing.seller?.full_name?.split(" ")[0] ?? "Student"} · {timeAgo(listing.created_at)}
        </div>
      </div>
    </Link>
  );
}

export function ListingGrid({ listings, showCampus }: { listings: ListingCardData[]; showCampus?: boolean }) {
  return (
    <div className="listing-grid">
      {listings.map((l) => (
        <ListingCard key={l.id} listing={l} showCampus={showCampus} />
      ))}
    </div>
  );
}
