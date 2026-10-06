import type { Metadata } from "next";
import Link from "next/link";
import { SubmitButton } from "@/components/submit-button";
import { PLATFORM_FEE_PERCENT, formatPrice, timeAgo } from "@/lib/catalog";
import { requireStudent } from "@/server/auth/session";
import { openPayoutDashboard, startPayoutSetup } from "@/server/actions/payments";
import { myCardSales, myPayoutAccount } from "@/server/queries";
import { getPayments, refreshPayoutAccount } from "@/server/stripe";

export const metadata: Metadata = { title: "Get paid" };

const ERRORS: Record<string, string> = {
  not_configured: "Card payments aren't switched on yet. Ask the Broke2Broke team.",
  save: "We couldn't save your payout account. Try again.",
};

export default async function PayoutsPage({ searchParams }: { searchParams: Promise<{ error?: string; done?: string }> }) {
  const { user } = await requireStudent();
  const sp = await searchParams;
  const payments = getPayments();
  let account = await myPayoutAccount(user.id);
  // Coming back from Stripe: check right away whether onboarding finished.
  if (payments && account && !account.ready) {
    account = { ...account, ready: await refreshPayoutAccount(payments, account).catch(() => false) };
  }
  const sales = account ? await myCardSales(user.id) : [];

  return (
    <div style={{ maxWidth: 640, margin: "0 auto" }} className="stack">
      <Link href="/me" className="small muted">
        ← My stuff
      </Link>
      <div>
        <span className="eyebrow">Card payments</span>
        <h1 className="page-title">Get paid by card 💳</h1>
        <p className="text-2" style={{ marginTop: 8 }}>
          Buyers pay in the app and the money goes straight to your bank through Stripe. Broke2Broke keeps{" "}
          {PLATFORM_FEE_PERCENT}% of each sale.
        </p>
      </div>

      {sp.error && ERRORS[sp.error] && <div className="alert alert-error">{ERRORS[sp.error]}</div>}

      {!payments ? (
        <div className="alert alert-info">Card payments aren&apos;t switched on yet. You can still sell with meetups.</div>
      ) : account?.ready ? (
        <div className="card card-pop stack">
          <div className="row between">
            <strong>✓ You can be paid by card</strong>
            <span className="chip chip-green">Active</span>
          </div>
          <p className="small text-2">Buyers now see a “Buy now” button on your listings.</p>
          <form action={openPayoutDashboard}>
            <SubmitButton className="btn" pendingLabel="Opening Stripe…">
              See balance &amp; payouts
            </SubmitButton>
          </form>
        </div>
      ) : (
        <div className="card card-pop stack">
          <strong>{account ? "Finish setting up payouts" : "Set up payouts (about 3 minutes)"}</strong>
          <p className="small text-2">
            Stripe will ask for your name, date of birth, an ID and the bank account where you want the money. Your
            details stay with Stripe; Broke2Broke never sees them.
          </p>
          {sp.done && account && (
            <div className="alert alert-info">Stripe is still checking your details. Refresh this page in a minute.</div>
          )}
          <form action={startPayoutSetup}>
            <SubmitButton className="btn btn-primary btn-lg" pendingLabel="Opening Stripe…">
              {account ? "Continue on Stripe →" : "Set up payouts →"}
            </SubmitButton>
          </form>
        </div>
      )}

      {sales.length > 0 && (
        <section className="card stack">
          <h2 className="card-title">Card sales</h2>
          <table className="table">
            <thead>
              <tr>
                <th>Item</th>
                <th>When</th>
                <th className="num">You get</th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <tr key={s.id}>
                  <td>{s.listing ? <Link href={`/listings/${s.listing.id}`}>{s.listing.title}</Link> : "Item"}</td>
                  <td>{timeAgo(s.created_at)}</td>
                  <td className="num">{formatPrice(s.amount_cents - s.fee_cents, s.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">Stripe also deducts its own card processing fee before paying you out.</p>
        </section>
      )}
    </div>
  );
}
