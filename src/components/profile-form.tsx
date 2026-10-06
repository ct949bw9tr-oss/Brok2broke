"use client";

import { useActionState } from "react";
import { CAMPUSES } from "@/lib/catalog";
import { saveProfile } from "@/server/actions/profile";
import { SubmitButton } from "./submit-button";

export function ProfileForm({
  initial,
  next,
  submitLabel,
}: {
  initial: { full_name: string; campus_id: string | null; program: string | null };
  next?: string;
  submitLabel: string;
}) {
  const [state, action] = useActionState(saveProfile, undefined);
  return (
    <form action={action} className="stack">
      {state?.error && (
        <div className="alert alert-error" role="alert">
          {state.error}
        </div>
      )}
      {state?.saved && <div className="alert alert-success">Saved ✓</div>}
      {next && <input type="hidden" name="next" value={next} />}
      <div className="field">
        <label className="label" htmlFor="full_name">
          Name
        </label>
        <input id="full_name" name="full_name" className="input" defaultValue={initial.full_name} maxLength={80} required />
        <span className="hint">Shown to other students on your listings and messages.</span>
      </div>
      <div className="field">
        <span className="label">Campus</span>
        <div className="segmented" role="radiogroup" aria-label="Campus" style={{ flexWrap: "wrap", borderRadius: 18 }}>
          {CAMPUSES.map((c) => (
            <label key={c.id}>
              <input type="radio" name="campus_id" value={c.id} defaultChecked={initial.campus_id === c.id} required />
              <span>{c.name}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="field">
        <label className="label" htmlFor="program">
          Program <span className="muted">(optional)</span>
        </label>
        <input
          id="program"
          name="program"
          className="input"
          defaultValue={initial.program ?? ""}
          placeholder="e.g. Bachelor in Business, MIB, MBA…"
          maxLength={80}
        />
      </div>
      <SubmitButton className="btn btn-primary btn-lg" pendingLabel="Saving…">
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
