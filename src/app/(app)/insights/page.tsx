import type { Metadata } from "next";
import Link from "next/link";
import { CAMPUSES, campusById, categoryOf, formatPrice, nextMarketDate } from "@/lib/catalog";
import { requireAdmin } from "@/server/auth/session";
import { experimentMetrics, getMarketDay } from "@/server/queries";
import { MarketDayForm } from "./market-day-form";

export const metadata: Metadata = { title: "Insights" };

function pct(v: number) {
  return `${Math.round(v * 100)}%`;
}

export default async function InsightsPage({ searchParams }: { searchParams: Promise<{ campus?: string }> }) {
  const { profile } = await requireAdmin();
  const sp = await searchParams;
  const campus = campusById(sp.campus);
  const m = await experimentMetrics(campus?.id);

  const formCampus = campus ?? campusById(profile.campus_id)!;
  const marketDate = nextMarketDate(new Date(), formCampus.timezone);
  const marketDay = await getMarketDay(formCampus.id, marketDate);

  const maxWeekly = Math.max(1, ...m.weekly.flatMap((w) => [w.signups, w.listings, w.transactions]));
  const marketShare = m.transactions ? m.transactions_at_market / m.transactions : 0;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <span className="eyebrow">MVP experiment · team only</span>
          <h1 className="page-title">Insights</h1>
          <p className="text-2" style={{ marginTop: 6, maxWidth: 640 }}>
            “Will students prefer a marketplace where they can buy/sell specifically with other nearby verified
            students?” Real listing and transaction data from {campus ? campus.name : "all campuses"}.
          </p>
        </div>
      </div>

      <div className="chip-row">
        <Link href="/insights" className="filter-chip" aria-current={!campus}>
          🌍 All
        </Link>
        {CAMPUSES.map((c) => (
          <Link key={c.id} href={`/insights?campus=${c.id}`} className="filter-chip" aria-current={campus?.id === c.id}>
            {c.name}
          </Link>
        ))}
      </div>

      <div className="kpis">
        <div className="kpi highlight">
          <div className="kpi-label">Transactions</div>
          <div className="kpi-value">{m.transactions}</div>
          <div className="kpi-sub">{pct(marketShare)} at the Sunday Market</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Verified students</div>
          <div className="kpi-value">{m.students}</div>
          <div className="kpi-sub">
            {m.sellers} sellers · {m.buyers} buyers
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Listings</div>
          <div className="kpi-value">{m.listings_total}</div>
          <div className="kpi-sub">
            {m.listings_active} live · {m.listings_at_market} for Sunday
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Sell-through</div>
          <div className="kpi-value">{pct(m.sell_through_rate)}</div>
          <div className="kpi-sub">of listings sold</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Contact → sale</div>
          <div className="kpi-value">{pct(m.contact_to_sale_rate)}</div>
          <div className="kpi-sub">{m.conversations} conversations</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Median time to sell</div>
          <div className="kpi-value">
            {m.median_hours_to_sell === null
              ? "—"
              : m.median_hours_to_sell < 48
                ? `${m.median_hours_to_sell}h`
                : `${Math.round(m.median_hours_to_sell / 24)}d`}
          </div>
          <div className="kpi-sub">from listing to sold</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Repeat buyers</div>
          <div className="kpi-value">{m.repeat_buyers}</div>
          <div className="kpi-sub">bought 2+ items</div>
        </div>
        <div className="kpi">
          <div className="kpi-label">Market RSVPs</div>
          <div className="kpi-value">{m.market_rsvps}</div>
          <div className="kpi-sub">all Sundays</div>
        </div>
      </div>

      <div className="detail" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr)" }}>
        <section className="card stack">
          <div className="row between">
            <h2 className="card-title">Last 8 weeks</h2>
            <div className="legend">
              <span>
                <i style={{ background: "var(--sky)" }} />
                Sign-ups
              </span>
              <span>
                <i style={{ background: "var(--ink)" }} />
                Listings
              </span>
              <span>
                <i style={{ background: "var(--lime)", border: "1px solid var(--ink)" }} />
                Sales
              </span>
            </div>
          </div>
          <div className="bars" role="img" aria-label="Weekly sign-ups, listings and sales">
            {m.weekly.map((w) => (
              <div key={w.week} className="bar-col">
                <div className="bar-group">
                  <div
                    className="bar signups"
                    style={{ height: `${(w.signups / maxWeekly) * 100}%` }}
                    title={`${w.signups} sign-ups`}
                  />
                  <div
                    className="bar listings"
                    style={{ height: `${(w.listings / maxWeekly) * 100}%` }}
                    title={`${w.listings} listings`}
                  />
                  <div
                    className="bar transactions"
                    style={{ height: `${(w.transactions / maxWeekly) * 100}%` }}
                    title={`${w.transactions} sales`}
                  />
                </div>
                <span className="bar-label">
                  {new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(
                    new Date(`${w.week}T12:00:00Z`),
                  )}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="card stack">
          <h2 className="card-title">Money moved (GMV)</h2>
          {m.gmv.length === 0 ? (
            <p className="muted">No sales recorded yet.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Currency</th>
                  <th className="num">Sales</th>
                  <th className="num">Avg</th>
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {m.gmv.map((g) => (
                  <tr key={g.currency}>
                    <td>{g.currency}</td>
                    <td className="num">{g.count}</td>
                    <td className="num">{formatPrice(g.avg_cents, g.currency)}</td>
                    <td className="num">
                      <strong>{formatPrice(g.total_cents, g.currency)}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="card stack">
        <h2 className="card-title">What students list (and what sells)</h2>
        {m.by_category.length === 0 ? (
          <p className="muted">No listings yet.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Listings</th>
                <th className="num">Sold</th>
                <th style={{ width: "35%" }}>Sell-through</th>
              </tr>
            </thead>
            <tbody>
              {m.by_category.map((c) => {
                const cat = categoryOf(c.category);
                const rate = c.listings ? c.sold / c.listings : 0;
                return (
                  <tr key={c.category}>
                    <td>
                      {cat.emoji} {cat.label}
                    </td>
                    <td className="num">{c.listings}</td>
                    <td className="num">{c.sold}</td>
                    <td>
                      <div className="row" style={{ flexWrap: "nowrap" }}>
                        <div className="meter" style={{ flex: 1 }}>
                          <span style={{ width: pct(rate) }} />
                        </div>
                        <span className="small">{pct(rate)}</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      <section className="card stack" id="market">
        <div>
          <h2 className="card-title">Sunday Market details · {formCampus.name}</h2>
          <p className="small text-2">Set where and when the next market happens. Students see it on the Market page.</p>
        </div>
        <MarketDayForm campusId={formCampus.id} date={marketDate} day={marketDay} />
      </section>
    </div>
  );
}
