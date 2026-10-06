"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { ALLOWED_EMAIL_DOMAINS } from "@/lib/catalog";
import { sendSignInEmail, verifySignInCode, type SignInState } from "@/server/actions/auth";

export function LoginForm({ next }: { next: string }) {
  const [sendState, sendAction] = useActionState<SignInState, FormData>(sendSignInEmail, { step: "email" });
  const [codeState, codeAction] = useActionState<SignInState, FormData>(verifySignInCode, { step: "email" });

  if (sendState.step === "code") {
    const error = codeState.step === "code" ? codeState.error : undefined;
    return (
      <form action={codeAction} className="stack">
        <div className="stack-sm">
          <h1 className="page-title" style={{ fontSize: 26 }}>
            Check your inbox 📬
          </h1>
          <p className="text-2">
            We sent a sign-in link and code to <strong>{sendState.email}</strong>. Click the link, or type the code here.
          </p>
        </div>
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        <input type="hidden" name="email" value={sendState.email} />
        <input type="hidden" name="next" value={next} />
        <div className="field">
          <label className="label" htmlFor="code">
            Code
          </label>
          <input
            id="code"
            name="code"
            className="input code-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={10}
            placeholder="123456"
            autoFocus
            required
          />
        </div>
        <SubmitButton className="btn btn-primary btn-lg btn-block" pendingLabel="Checking…">
          Sign in
        </SubmitButton>
        <p className="small muted">Not there? Check spam, or reload this page to use another email.</p>
      </form>
    );
  }

  return (
    <form action={sendAction} className="stack">
      <div className="stack-sm">
        <h1 className="page-title" style={{ fontSize: 26 }}>
          Sign in or join
        </h1>
        <p className="text-2">Use your Hult email. We&apos;ll send you a one-time code, no password needed.</p>
      </div>
      {sendState.error && (
        <div className="alert alert-error" role="alert">
          {sendState.error}
        </div>
      )}
      <input type="hidden" name="next" value={next} />
      <div className="field">
        <label className="label" htmlFor="email">
          Hult email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          autoComplete="email"
          placeholder={`you@${ALLOWED_EMAIL_DOMAINS[0]}`}
          defaultValue={sendState.email}
          autoFocus
          required
        />
      </div>
      <SubmitButton className="btn btn-primary btn-lg btn-block" pendingLabel="Sending…">
        Email me a code
      </SubmitButton>
    </form>
  );
}
