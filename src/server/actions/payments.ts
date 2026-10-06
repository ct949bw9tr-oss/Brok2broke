"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { payoutCountryForCampus, photoUrl, platformFeeCents } from "@/lib/catalog";
import { requireStudent } from "@/server/auth/session";
import { getListing } from "@/server/queries";
import { getPayments, refreshPayoutAccount, type PayoutAccount } from "@/server/stripe";

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Seller: create (or resume) their Stripe Express onboarding. */
export async function startPayoutSetup(): Promise<void> {
  const { user, profile } = await requireStudent();
  const p = getPayments();
  if (!p) redirect("/me/payouts?error=not_configured");

  const { data: existing } = await p.admin
    .from("payout_accounts")
    .select("user_id, stripe_account_id, country, ready")
    .eq("user_id", user.id)
    .maybeSingle<PayoutAccount>();

  let accountId = existing?.stripe_account_id;
  if (!accountId) {
    const country = payoutCountryForCampus(profile.campus_id);
    // Sellers outside the platform's country can receive transfers but not
    // process cards themselves (Stripe "recipient" agreement).
    const crossBorder = country !== p.env.STRIPE_PLATFORM_COUNTRY;
    const account = await p.stripe.accounts.create({
      type: "express",
      country,
      email: user.email ?? undefined,
      business_type: "individual",
      capabilities: crossBorder
        ? { transfers: { requested: true } }
        : { card_payments: { requested: true }, transfers: { requested: true } },
      ...(crossBorder ? { tos_acceptance: { service_agreement: "recipient" } } : {}),
      metadata: { user_id: user.id },
    });
    const { error } = await p.admin
      .from("payout_accounts")
      .insert({ user_id: user.id, stripe_account_id: account.id, country });
    if (error) redirect("/me/payouts?error=save");
    accountId = account.id;
  }

  const origin = await siteOrigin();
  const link = await p.stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${origin}/me/payouts?resume=1`,
    return_url: `${origin}/me/payouts?done=1`,
  });
  redirect(link.url);
}

/** Seller: open their Stripe Express dashboard (balance, payouts, bank). */
export async function openPayoutDashboard(): Promise<void> {
  const { user } = await requireStudent();
  const p = getPayments();
  if (!p) redirect("/me/payouts?error=not_configured");
  const { data } = await p.admin
    .from("payout_accounts")
    .select("stripe_account_id")
    .eq("user_id", user.id)
    .maybeSingle<{ stripe_account_id: string }>();
  if (!data) redirect("/me/payouts");
  const login = await p.stripe.accounts.createLoginLink(data.stripe_account_id);
  redirect(login.url);
}

/** Buyer: pay for a listing by card with Stripe Checkout. */
export async function buyNow(listingId: string): Promise<void> {
  const { user } = await requireStudent();
  const id = z.uuid().parse(listingId);
  const p = getPayments();
  if (!p) redirect(`/listings/${id}?pay_error=not_configured`);

  const listing = await getListing(id);
  if (!listing || listing.kind !== "sell" || listing.status !== "active" || listing.seller_id === user.id) {
    redirect(`/listings/${id}?pay_error=unavailable`);
  }

  const { data: account } = await p.admin
    .from("payout_accounts")
    .select("user_id, stripe_account_id, country, ready")
    .eq("user_id", listing.seller_id)
    .maybeSingle<PayoutAccount>();
  if (!account || !(account.ready || (await refreshPayoutAccount(p, account)))) {
    redirect(`/listings/${id}?pay_error=seller_not_ready`);
  }

  const origin = await siteOrigin();
  const session = await p.stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: user.email ?? undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: listing.currency.toLowerCase(),
          unit_amount: listing.price_cents,
          product_data: {
            name: listing.title,
            ...(listing.photos[0] ? { images: [photoUrl(listing.photos[0])] } : {}),
          },
        },
      },
    ],
    payment_intent_data: {
      application_fee_amount: platformFeeCents(listing.price_cents),
      transfer_data: { destination: account.stripe_account_id },
      metadata: { listing_id: listing.id, buyer_id: user.id },
    },
    metadata: { listing_id: listing.id, buyer_id: user.id },
    success_url: `${origin}/listings/${listing.id}?paid=1`,
    cancel_url: `${origin}/listings/${listing.id}`,
  });
  if (!session.url) redirect(`/listings/${id}?pay_error=checkout`);
  redirect(session.url);
}
