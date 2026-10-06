import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { safeRedirectPath } from "@/lib/catalog";
import { getCurrentUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const next = safeRedirectPath(params.next);
  if (await getCurrentUser()) redirect(next);

  return (
    <main className="auth-wrap">
      <div className="auth-card stack">
        <div style={{ textAlign: "center" }}>
          <Logo />
        </div>
        <div className="card card-pop stack">
          {params.error === "link" && (
            <div className="alert alert-error" role="alert">
              That sign-in link expired or was already used. Request a new code below.
            </div>
          )}
          <LoginForm next={next} />
        </div>
        <p className="small muted" style={{ textAlign: "center" }}>
          Only verified Hult students and staff can join. We never show your email to other students.
        </p>
      </div>
    </main>
  );
}
