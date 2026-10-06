"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { MIN_PASSWORD_LENGTH, safeRedirectPath } from "@/lib/catalog";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

export type AuthState = { error?: string; info?: string; email?: string } | undefined;

const credentialsSchema = z.object({
  email: z.email().max(320),
  password: z.string().max(200),
});

function readCredentials(formData: FormData) {
  return credentialsSchema.safeParse({
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    password: String(formData.get("password") ?? ""),
  });
}

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const next = safeRedirectPath(String(formData.get("next") ?? ""));
  const parsed = readCredentials(formData);
  if (!parsed.success || !parsed.data.password) return { email, error: "Enter your email and password." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { email, error: "Confirm your email first: open the link we sent you, then sign in." };
    }
    // Same message for unknown email and wrong password (no account enumeration).
    return { email, error: "Wrong email or password." };
  }
  redirect(next);
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "");
  const next = safeRedirectPath(String(formData.get("next") ?? ""));
  const parsed = readCredentials(formData);
  if (!parsed.success) return { email, error: "Enter a valid email address." };
  if (parsed.data.password.length < MIN_PASSWORD_LENGTH) {
    return { email, error: `Use a password with at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (parsed.data.password !== String(formData.get("confirm") ?? "")) {
    return { email, error: "The passwords don't match." };
  }

  const supabase = await createSupabaseServerClient();
  // Sign-up may be limited to some email domains (public.allowed_email_domains;
  // empty = anyone). Ask first so the student gets a clear message.
  const { data: allowed } = await supabase.rpc("email_domain_allowed", { p_email: parsed.data.email });
  if (allowed === false) {
    return { email, error: "Sign-up is limited to university emails right now. Use your school email." };
  }

  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(next)}` },
  });
  if (error) {
    if (error.code === "user_already_exists") return { email, error: "There's already an account with this email. Sign in instead." };
    if (error.code === "weak_password") return { email, error: "That password is too weak. Try a longer one." };
    return { email, error: `We couldn't create your account (${error.message}).` };
  }
  // With "Confirm email" off in Supabase the student is signed in right away.
  if (data.session) redirect(next);
  // Supabase hides existing accounts by returning a user with no identities.
  if (data.user && data.user.identities?.length === 0) {
    return { email, error: "There's already an account with this email. Sign in instead." };
  }
  return { email, info: "Account created. Open the confirmation link we emailed you, then sign in." };
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
