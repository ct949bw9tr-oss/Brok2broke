"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ALLOWED_EMAIL_DOMAINS, isAllowedEmail, safeRedirectPath } from "@/lib/catalog";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

export type SignInState =
  | { step: "email"; error?: string; email?: string }
  | { step: "code"; email: string; error?: string; next: string };

const emailSchema = z.email().max(320);

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Step 1: email a one-time code + magic link to a university address. */
export async function sendSignInEmail(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const next = safeRedirectPath(String(formData.get("next") ?? ""));
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { step: "email", email, error: "Enter a valid email address." };
  if (!isAllowedEmail(email)) {
    return {
      step: "email",
      email,
      error: `Broke2Broke is for verified Hult students. Use your @${ALLOWED_EMAIL_DOMAINS[0]} email.`,
    };
  }

  const supabase = await createSupabaseServerClient();
  const redirectTo = `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent(next)}`;
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: redirectTo },
  });
  if (error) {
    if (error.status === 429) return { step: "email", email, error: "Too many attempts. Wait a minute and try again." };
    // Show Supabase's reason (e.g. SMTP not configured) so setup problems are diagnosable.
    return { step: "email", email, error: `We couldn't send the email (${error.message}). Try again in a moment.` };
  }
  return { step: "code", email, next };
}

const codeSchema = z.object({
  email: emailSchema,
  code: z.string().regex(/^\d{6,10}$/),
});

/** Step 2 (optional): type the code instead of clicking the link. */
export async function verifySignInCode(prev: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "");
  const next = safeRedirectPath(String(formData.get("next") ?? ""));
  const parsed = codeSchema.safeParse({ email, code: String(formData.get("code") ?? "").replace(/\s/g, "") });
  if (!parsed.success) return { step: "code", email, next, error: "Enter the code from the email." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.verifyOtp({ email: parsed.data.email, token: parsed.data.code, type: "email" });
  if (error) return { step: "code", email, next, error: "That code is wrong or expired. Request a new one." };
  redirect(next);
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/");
}
