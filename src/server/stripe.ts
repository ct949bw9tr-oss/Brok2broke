import "server-only";
import Stripe from "stripe";
import { createSupabaseAdminClient } from "@/server/db/supabase-admin";
import { paymentsEnv, type PaymentsEnv } from "@/server/env";

export type Payments = {
  env: PaymentsEnv;
  stripe: Stripe;
  admin: ReturnType<typeof createSupabaseAdminClient>;
};

/** Stripe + privileged DB client, or null when card payments are not configured. */
export function getPayments(): Payments | null {
  const env = paymentsEnv();
  if (!env) return null;
  return { env, stripe: new Stripe(env.STRIPE_SECRET_KEY), admin: createSupabaseAdminClient(env.SUPABASE_SECRET_KEY) };
}

export type PayoutAccount = { user_id: string; stripe_account_id: string; country: string; ready: boolean };

/** A connected account can receive money once onboarding is done and transfers are active. */
export function accountIsReady(account: Stripe.Account): boolean {
  return Boolean(account.details_submitted) && account.capabilities?.transfers === "active";
}

/** Re-reads the account from Stripe and stores whether it can be paid. */
export async function refreshPayoutAccount(p: Payments, row: PayoutAccount): Promise<boolean> {
  const account = await p.stripe.accounts.retrieve(row.stripe_account_id);
  const ready = accountIsReady(account);
  if (ready !== row.ready) {
    await p.admin
      .from("payout_accounts")
      .update({ ready, updated_at: new Date().toISOString() })
      .eq("user_id", row.user_id);
  }
  return ready;
}
