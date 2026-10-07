import "server-only";

// Server-only secrets. Never import this from client components.
// Card payments are optional: without these the app still works and simply
// hides "Buy now" / "Get paid".

export type PaymentsEnv = {
  SUPABASE_SECRET_KEY: string;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  /** Country of the Stripe platform account (sellers elsewhere get cross-border payouts). */
  STRIPE_PLATFORM_COUNTRY: string;
};

export function paymentsEnv(): PaymentsEnv | null {
  const env = {
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY?.trim() ?? "",
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY?.trim() ?? "",
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? "",
    STRIPE_PLATFORM_COUNTRY: (process.env.STRIPE_PLATFORM_COUNTRY?.trim() || "US").toUpperCase(),
  };
  if (!env.SUPABASE_SECRET_KEY || !env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) return null;
  return env;
}
