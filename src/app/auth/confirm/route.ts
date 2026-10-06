import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeRedirectPath } from "@/lib/catalog";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

// Landing URL for sign-in emails. Supports both link styles:
//  - ?token_hash=...&type=magiclink (custom template in supabase/templates/,
//    works even if the email is opened on another device)
//  - ?code=... (Supabase's default template, PKCE: same browser only)

const ALLOWED_TYPES: EmailOtpType[] = ["magiclink", "email", "signup"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const next = safeRedirectPath(params.get("next"));
  const supabase = await createSupabaseServerClient();

  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  if (tokenHash && type && ALLOWED_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) redirect(next);
  }

  const code = params.get("code");
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) redirect(next);
  }

  redirect("/login?error=link");
}
