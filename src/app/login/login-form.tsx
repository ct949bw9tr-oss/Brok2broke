"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { MIN_PASSWORD_LENGTH } from "@/lib/catalog";
import { signIn, signUp, type AuthState } from "@/server/actions/auth";

type Mode = "signin" | "signup";

export function LoginForm({ next, initialMode = "signin" }: { next: string; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [signInState, signInAction] = useActionState<AuthState, FormData>(signIn, undefined);
  const [signUpState, signUpAction] = useActionState<AuthState, FormData>(signUp, undefined);
  const state = mode === "signin" ? signInState : signUpState;

  return (
    <div className="stack">
      <div className="segmented" role="tablist" aria-label="Sign in or create an account" style={{ alignSelf: "flex-start" }}>
        <label>
          <input type="radio" name="mode" checked={mode === "signin"} onChange={() => setMode("signin")} />
          <span>Sign in</span>
        </label>
        <label>
          <input type="radio" name="mode" checked={mode === "signup"} onChange={() => setMode("signup")} />
          <span>Create account</span>
        </label>
      </div>

      <form key={mode} action={mode === "signin" ? signInAction : signUpAction} className="stack">
        <h1 className="page-title" style={{ fontSize: 26 }}>
          {mode === "signin" ? "Welcome back" : "Join Broke2Broke"}
        </h1>
        {state?.error && (
          <div className="alert alert-error" role="alert">
            {state.error}
          </div>
        )}
        {state?.info && <div className="alert alert-success">{state.info}</div>}
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            className="input"
            autoComplete="email"
            placeholder="you@email.com"
            defaultValue={state?.email}
            required
          />
        </div>
        <div className="field">
          <label className="label" htmlFor="password">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            minLength={mode === "signup" ? MIN_PASSWORD_LENGTH : undefined}
            required
          />
          {mode === "signup" && <span className="hint">At least {MIN_PASSWORD_LENGTH} characters.</span>}
        </div>
        {mode === "signup" && (
          <div className="field">
            <label className="label" htmlFor="confirm">
              Repeat password
            </label>
            <input id="confirm" name="confirm" type="password" className="input" autoComplete="new-password" required />
          </div>
        )}
        <SubmitButton className="btn btn-primary btn-lg btn-block" pendingLabel={mode === "signin" ? "Signing in…" : "Creating account…"}>
          {mode === "signin" ? "Sign in" : "Create account"}
        </SubmitButton>
      </form>
    </div>
  );
}
