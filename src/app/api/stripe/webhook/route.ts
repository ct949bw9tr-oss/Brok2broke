import type Stripe from "stripe";
import { platformFeeCents } from "@/lib/catalog";
import { getPayments } from "@/server/stripe";

// Stripe calls this after a Checkout payment. The signature check proves the
// event comes from Stripe; only then is the sale written with the service role.

export async function POST(request: Request) {
  const p = getPayments();
  if (!p) return new Response("Payments not configured", { status: 503 });

  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = p.stripe.webhooks.constructEvent(await request.text(), signature, p.env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    if (session.payment_status !== "paid") return Response.json({ ignored: "not paid yet" });

    const listingId = session.metadata?.listing_id;
    const buyerId = session.metadata?.buyer_id;
    const paymentIntentId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id;
    if (!listingId || !session.amount_total || !session.currency) {
      return Response.json({ ignored: "not a Broke2Broke order" });
    }

    const { data: outcome, error } = await p.admin.rpc("record_card_payment", {
      p_session_id: session.id,
      p_payment_intent_id: paymentIntentId ?? null,
      p_listing_id: listingId,
      p_buyer_id: buyerId ?? null,
      p_amount_cents: session.amount_total,
      p_fee_cents: platformFeeCents(session.amount_total),
      p_currency: session.currency,
    });
    // A 500 makes Stripe retry later; the RPC is idempotent per session.
    if (error) return new Response(`Could not record payment: ${error.message}`, { status: 500 });

    if (outcome === "unavailable" && paymentIntentId) {
      // Someone else bought it first: give this buyer their money back.
      await p.stripe.refunds.create(
        { payment_intent: paymentIntentId, reverse_transfer: true, refund_application_fee: true },
        { idempotencyKey: `refund-${session.id}` },
      );
      await p.admin.from("orders").update({ status: "refunded" }).eq("stripe_session_id", session.id);
    }
    return Response.json({ outcome });
  }

  return Response.json({ ignored: event.type });
}
