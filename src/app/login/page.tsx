import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { safeRedirectPath } from "@/lib/catalog";
import { getCurrentUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string; mode?: string }> }) {
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
              That link expired or was already used. Sign in with your email and password.
            </div>
          )}
          <LoginForm next={next} initialMode={params.mode === "signup" ? "signup" : "signin"} />
        </div>
        <p className="small muted" style={{ textAlign: "center" }}>
          We never show your email to other students.
        </p>
      </div>
    </main>
  );
}
