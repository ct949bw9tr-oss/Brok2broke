import type { Metadata } from "next";
import Link from "next/link";
import { Avatar } from "@/components/avatar";
import { EmptyState } from "@/components/empty-state";
import { ListingGrid } from "@/components/listing-card";
import { ProfileForm } from "@/components/profile-form";
import { campusName, formatPrice, timeAgo } from "@/lib/catalog";
import { requireStudent } from "@/server/auth/session";
import { signOut } from "@/server/actions/auth";
import { listingsBySeller, myPurchases, savedListings } from "@/server/queries";

export const metadata: Metadata = { title: "My stuff" };

const TABS = [
  { id: "selling", label: "Selling" },
  { id: "sold", label: "Sold" },
  { id: "saved", label: "Saved" },
  { id: "bought", label: "Bought" },
  { id: "profile", label: "Profile" },
] as const;

export default async function MePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { user, profile } = await requireStudent();
  const requested = (await searchParams).tab;
  const tab = TABS.find((t) => t.id === requested)?.id ?? "selling";

  const [mine, saved, purchases] = await Promise.all([
    tab === "selling" || tab === "sold" ? listingsBySeller(user.id) : Promise.resolve([]),
    tab === "saved" ? savedListings(user.id) : Promise.resolve([]),
    tab === "bought" ? myPurchases(user.id) : Promise.resolve([]),
  ]);
  const selling = mine.filter((l) => l.status !== "sold");
  const sold = mine.filter((l) => l.status === "sold");

  return (
    <div className="stack">
      <div className="row between">
        <div className="row">
          <Avatar name={profile.full_name} size="lg" />
          <div>
            <h1 className="page-title" style={{ fontSize: 26 }}>
              {profile.full_name || "You"}
            </h1>
            <div className="small muted">
              <span className="verified">✓ Verified</span> · {campusName(profile.campus_id)}
              {profile.program ? ` · ${profile.program}` : ""}
            </div>
          </div>
        </div>
        <form action={signOut}>
          <button className="btn btn-sm btn-ghost" type="submit">
            Sign out
          </button>
        </form>
      </div>

      <nav className="tabs" aria-label="My stuff">
        {TABS.map((t) => (
          <Link key={t.id} href={`/me?tab=${t.id}`} aria-current={t.id === tab ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "selling" &&
        (selling.length ? (
          <ListingGrid listings={selling} />
        ) : (
          <EmptyState emoji="🏷️" title="Nothing for sale" body="Your listings show up here." action={{ href: "/listings/new", label: "+ List an item" }} />
        ))}

      {tab === "sold" &&
        (sold.length ? <ListingGrid listings={sold} /> : <EmptyState emoji="🎉" title="No sales yet" body="Mark items as sold from the listing page." />)}

      {tab === "saved" &&
        (saved.length ? (
          <ListingGrid listings={saved} showCampus />
        ) : (
          <EmptyState emoji="♡" title="Nothing saved" body="Tap Save on a listing to keep an eye on it." action={{ href: "/browse", label: "Browse" }} />
        ))}

      {tab === "bought" &&
        (purchases.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Where</th>
                <th>When</th>
                <th className="num">Price</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id}>
                  <td>{p.listing ? <Link href={`/listings/${p.listing.id}`}>{p.listing.title}</Link> : "Item"}</td>
                  <td>{p.channel === "sunday_market" ? "Sunday Market" : "Meetup"}</td>
                  <td>{timeAgo(p.created_at)}</td>
                  <td className="num">{p.price_cents ? formatPrice(p.price_cents, p.currency) : "Free"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState emoji="🛍️" title="No purchases yet" body="When a seller marks an item as sold to you, it appears here." />
        ))}

      {tab === "profile" && (
        <div className="card" style={{ maxWidth: 560 }}>
          <ProfileForm initial={profile} submitLabel="Save profile" />
          <p className="small muted" style={{ marginTop: 14 }}>
            Signed in as {user.email}. Your email is never shown to other students.
          </p>
        </div>
      )}
    </div>
  );
}
