import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";

/**
 * Privileged client that BYPASSES Row Level Security. Only for the payment
 * code paths, where identities come from the verified session or from a
 * signature-checked Stripe webhook, never from request input.
 */
export function createSupabaseAdminClient(secretKey: string) {
  return createClient(publicEnv().NEXT_PUBLIC_SUPABASE_URL, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
