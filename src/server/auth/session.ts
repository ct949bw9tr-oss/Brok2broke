import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

// Data-access layer for identity. Every page and Server Action calls one of
// the require* functions below, close to the data (layouts don't re-run on
// client-side navigation). Real authorization is enforced again by RLS.

export type CurrentUser = { id: string; email: string | null };

export type Profile = {
  id: string;
  full_name: string;
  campus_id: string | null;
  program: string | null;
  is_admin: boolean;
  created_at: string;
};

/** Verified identity for this request, or null. Memoized per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createSupabaseServerClient();
  // getClaims() verifies the JWT signature; never trust getSession() on the server.
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? null };
});

export const getMyProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, campus_id, program, is_admin, created_at")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  return data ?? null;
});

export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Signed in AND onboarded (has picked a campus). */
export async function requireStudent(): Promise<{ user: CurrentUser; profile: Profile & { campus_id: string } }> {
  const user = await requireUser();
  const profile = await getMyProfile();
  if (!profile) redirect("/login?error=profile");
  if (!profile.campus_id) redirect("/welcome");
  return { user, profile: profile as Profile & { campus_id: string } };
}

export async function requireAdmin() {
  const ctx = await requireStudent();
  if (!ctx.profile.is_admin) redirect("/browse");
  return ctx;
}
