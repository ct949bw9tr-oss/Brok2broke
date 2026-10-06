import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { ListingGrid } from "@/components/listing-card";
import { CAMPUSES, CATEGORIES, KINDS, campusName } from "@/lib/catalog";
import { requireStudent } from "@/server/auth/session";
import { browseListings, type BrowseFilters } from "@/server/queries";

export const metadata: Metadata = { title: "Browse" };

type Search = { q?: string; category?: string; kind?: string; campus?: string; market?: string; sort?: string };

function hrefWith(current: Search, patch: Partial<Search>): string {
  const merged = { ...current, ...patch };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) if (v) params.set(k, v);
  const qs = params.toString();
  return qs ? `/browse?${qs}` : "/browse";
}

export default async function BrowsePage({ searchParams }: { searchParams: Promise<Search> }) {
  const { profile } = await requireStudent();
  const sp = await searchParams;

  const campus = sp.campus === "all" ? undefined : CAMPUSES.some((c) => c.id === sp.campus) ? sp.campus : profile.campus_id;
  const current: Search = { ...sp, campus: sp.campus };
  const filters: BrowseFilters = {
    campus,
    q: sp.q,
    category: CATEGORIES.some((c) => c.id === sp.category) ? sp.category : undefined,
    kind: KINDS.some((k) => k.id === sp.kind) ? sp.kind : undefined,
    market: sp.market === "1",
    sort: sp.sort === "price_asc" || sp.sort === "price_desc" ? sp.sort : "new",
  };
  const listings = await browseListings(filters);
  const filtered = Boolean(filters.q || filters.category || filters.kind || filters.market);

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">{campus ? `${campusName(campus)} campus` : "All campuses"}</span>
          <h1 className="page-title">What are you hunting for?</h1>
        </div>
      </div>

      <form className="browse-search" action="/browse" role="search">
        <input
          name="q"
          className="input"
          placeholder="Search lamps, textbooks, bikes…"
          defaultValue={sp.q ?? ""}
          aria-label="Search listings"
        />
        <select name="campus" className="select" defaultValue={sp.campus ?? profile.campus_id} aria-label="Campus">
          {CAMPUSES.map((c) => (
            <option key={c.id} value={c.id}>
              📍 {c.name}
            </option>
          ))}
          <option value="all">🌍 All campuses</option>
        </select>
        <select name="sort" className="select" defaultValue={sp.sort ?? "new"} aria-label="Sort">
          <option value="new">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </select>
        {sp.category && <input type="hidden" name="category" value={sp.category} />}
        {sp.kind && <input type="hidden" name="kind" value={sp.kind} />}
        {sp.market && <input type="hidden" name="market" value={sp.market} />}
        <button className="btn btn-dark" type="submit">
          Search
        </button>
      </form>

      <div className="chip-row" aria-label="Filters">
        <Link
          className="filter-chip"
          href={hrefWith(current, { market: sp.market === "1" ? undefined : "1" })}
          aria-current={sp.market === "1"}
        >
          🧺 At Sunday Market
        </Link>
        <Link className="filter-chip" href={hrefWith(current, { kind: sp.kind === "free" ? undefined : "free" })} aria-current={sp.kind === "free"}>
          🎁 Free
        </Link>
        <Link className="filter-chip" href={hrefWith(current, { kind: sp.kind === "swap" ? undefined : "swap" })} aria-current={sp.kind === "swap"}>
          🔁 Swap
        </Link>
        {CATEGORIES.map((c) => (
          <Link
            key={c.id}
            className="filter-chip"
            href={hrefWith(current, { category: sp.category === c.id ? undefined : c.id })}
            aria-current={sp.category === c.id}
          >
            {c.emoji} {c.label}
          </Link>
        ))}
      </div>

      {listings.length > 0 ? (
        <>
          <p className="small muted">
            {listings.length} {listings.length === 1 ? "item" : "items"}
            {filtered && (
              <>
                {" · "}
                <Link href={hrefWith({ campus: sp.campus }, {})} style={{ textDecoration: "underline" }}>
                  clear filters
                </Link>
              </>
            )}
          </p>
          <ListingGrid listings={listings} showCampus={!campus} />
        </>
      ) : filtered ? (
        <EmptyState emoji="🕵️" title="Nothing matches yet" body="Try fewer filters, or another campus." action={{ href: "/browse", label: "Clear filters" }} />
      ) : (
        <EmptyState
          emoji="🌱"
          title="Be the first to sell here"
          body="The marketplace is brand new on your campus. List something you don't need and get the ball rolling."
          action={{ href: "/listings/new", label: "+ List an item" }}
        />
      )}
    </div>
  );
}
