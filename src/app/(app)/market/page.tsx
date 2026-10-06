import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { ListingGrid } from "@/components/listing-card";
import { CAMPUSES, campusById, formatMarketDate, nextMarketDate } from "@/lib/catalog";
import { requireStudent } from "@/server/auth/session";
import { browseListings, getMarketDay, marketRsvps } from "@/server/queries";
import { RsvpButtons } from "./rsvp-buttons";

export const metadata: Metadata = { title: "Sunday Market" };

function hhmm(t: string) {
  const [h, m] = t.split(":").map(Number);
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: "UTC" }).format(
    new Date(Date.UTC(2000, 0, 1, h, m)),
  );
}

export default async function MarketPage({ searchParams }: { searchParams: Promise<{ campus?: string }> }) {
  const { user, profile } = await requireStudent();
  const sp = await searchParams;
  const campus = campusById(sp.campus) ?? campusById(profile.campus_id)!;
  const date = nextMarketDate(new Date(), campus.timezone);

  const [day, rsvps, items] = await Promise.all([
    getMarketDay(campus.id, date),
    marketRsvps(campus.id, date),
    browseListings({ campus: campus.id, market: true }, 120),
  ]);
  const mine = rsvps.find((r) => r.user_id === user.id)?.going_as ?? null;
  const sellers = rsvps.filter((r) => r.going_as === "seller").length;
  const buyers = rsvps.length - sellers;

  return (
    <div className="stack" style={{ gap: 28 }}>
      <section className="market-hero">
        <div className="stamp">EVERY SUNDAY · ON CAMPUS</div>
        <span className="eyebrow" style={{ color: "rgba(21,19,15,.65)" }}>
          🧺 Sunday Market · {campus.name}
        </span>
        <h1 style={{ marginTop: 8 }}>{formatMarketDate(date)}</h1>
        {day?.cancelled ? (
          <p style={{ marginTop: 10, fontWeight: 700 }}>This week&apos;s market is cancelled. See you next Sunday!</p>
        ) : (
          <>
            <div className="facts">
              <div className="fact">
                <span className="eyebrow">Where</span>
                <strong>{day?.location ?? "Location announced soon"}</strong>
              </div>
              <div className="fact">
                <span className="eyebrow">When</span>
                <strong>{day ? `${hhmm(day.starts_at)} – ${hhmm(day.ends_at)}` : "Time TBA"}</strong>
              </div>
              <div className="fact">
                <span className="eyebrow">Items coming</span>
                <strong>{items.length}</strong>
              </div>
              <div className="fact">
                <span className="eyebrow">Going</span>
                <strong>
                  {sellers} sellers · {buyers} shoppers
                </strong>
              </div>
            </div>
            {day?.notes && <p style={{ marginTop: 14 }}>{day.notes}</p>}
            <div style={{ marginTop: 18 }}>
              <RsvpButtons campusId={campus.id} date={date} current={mine} />
            </div>
          </>
        )}
      </section>

      <div className="chip-row" aria-label="Campus">
        {CAMPUSES.map((c) => (
          <Link key={c.id} href={`/market?campus=${c.id}`} className="filter-chip" aria-current={c.id === campus.id}>
            📍 {c.name}
          </Link>
        ))}
      </div>

      <section className="stack">
        <div className="row between">
          <h2 className="card-title" style={{ fontSize: 22 }}>
            Coming this Sunday
          </h2>
          <Link href="/listings/new" className="btn btn-sm">
            + Bring something
          </Link>
        </div>
        {items.length > 0 ? (
          <ListingGrid listings={items} />
        ) : (
          <EmptyState
            emoji="🧺"
            title="No items tagged yet"
            body="List an item and tick “Bring it to the Sunday Market”, or tag one of your existing listings."
            action={{ href: "/listings/new", label: "+ List an item" }}
          />
        )}
      </section>

      <section className="steps">
        <div className="card">
          <h3>Sellers</h3>
          <p className="text-2 small" style={{ marginTop: 6 }}>
            Tag your listings for the market, RSVP as a seller and bring your items. Mark them sold in the app once they go.
          </p>
        </div>
        <div className="card">
          <h3>Shoppers</h3>
          <p className="text-2 small" style={{ marginTop: 6 }}>
            Browse what&apos;s coming, message sellers to hold something for you, and bring cash or your payment app.
          </p>
        </div>
        <div className="card">
          <h3>Safety</h3>
          <p className="text-2 small" style={{ marginTop: 6 }}>
            Everyone here is a verified Hult student. Check items before paying. Problems? Tell the Broke2Broke team on site.
          </p>
        </div>
      </section>
    </div>
  );
}
