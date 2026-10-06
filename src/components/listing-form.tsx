"use client";

import { useActionState, useState } from "react";
import { CAMPUSES, CATEGORIES, CONDITIONS, KINDS, campusById } from "@/lib/catalog";
import type { ListingFormState } from "@/server/actions/listings";
import { PhotoPicker } from "./photo-picker";
import { SubmitButton } from "./submit-button";

export type ListingFormValues = {
  title: string;
  description: string;
  category: string;
  condition: string;
  kind: string;
  price: string;
  campus_id: string;
  at_market: boolean;
  photos: string[];
};

export function ListingForm({
  action,
  userId,
  initial,
  submitLabel,
}: {
  action: (prev: ListingFormState, formData: FormData) => Promise<ListingFormState>;
  userId: string;
  initial: ListingFormValues;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, undefined);
  const [kind, setKind] = useState(initial.kind);
  const [campus, setCampus] = useState(initial.campus_id);
  const [uploading, setUploading] = useState(false);
  const fe = state?.fieldErrors ?? {};
  const currency = campusById(campus)?.currency ?? "USD";

  return (
    <form action={formAction} className="stack" noValidate>
      {state?.error && (
        <div className="alert alert-error" role="alert">
          {state.error}
        </div>
      )}

      <section className="card stack">
        <h2 className="card-title">Photos</h2>
        <PhotoPicker userId={userId} initial={initial.photos} onUploadingChange={setUploading} />
      </section>

      <section className="card form-grid">
        <div className="field span-2">
          <label className="label" htmlFor="title">
            Title
          </label>
          <input
            id="title"
            name="title"
            className="input"
            defaultValue={initial.title}
            placeholder="e.g. IKEA desk lamp, barely used"
            maxLength={80}
            required
            aria-invalid={Boolean(fe.title)}
          />
          {fe.title && <span className="field-error">{fe.title}</span>}
        </div>

        <div className="field">
          <label className="label" htmlFor="category">
            Category
          </label>
          <select id="category" name="category" className="select" defaultValue={initial.category} aria-invalid={Boolean(fe.category)}>
            <option value="" disabled>
              Choose…
            </option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
          {fe.category && <span className="field-error">{fe.category}</span>}
        </div>

        <div className="field">
          <label className="label" htmlFor="condition">
            Condition
          </label>
          <select id="condition" name="condition" className="select" defaultValue={initial.condition} aria-invalid={Boolean(fe.condition)}>
            <option value="" disabled>
              Choose…
            </option>
            {CONDITIONS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          {fe.condition && <span className="field-error">{fe.condition}</span>}
        </div>

        <div className="field span-2">
          <span className="label">Type</span>
          <div className="segmented" role="radiogroup" aria-label="Listing type">
            {KINDS.map((k) => (
              <label key={k.id}>
                <input type="radio" name="kind" value={k.id} checked={kind === k.id} onChange={() => setKind(k.id)} />
                <span>{k.label}</span>
              </label>
            ))}
          </div>
        </div>

        {kind === "sell" && (
          <div className="field">
            <label className="label" htmlFor="price">
              Price ({currency})
            </label>
            <input
              id="price"
              name="price"
              className="input"
              inputMode="decimal"
              defaultValue={initial.price}
              placeholder="15"
              aria-invalid={Boolean(fe.price)}
            />
            {fe.price ? <span className="field-error">{fe.price}</span> : <span className="hint">Student prices sell fastest.</span>}
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="campus_id">
            Campus
          </label>
          <select id="campus_id" name="campus_id" className="select" value={campus} onChange={(e) => setCampus(e.target.value)}>
            {CAMPUSES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field span-2">
          <label className="label" htmlFor="description">
            Description
          </label>
          <textarea
            id="description"
            name="description"
            className="textarea"
            defaultValue={initial.description}
            placeholder={kind === "swap" ? "What is it, and what would you swap it for?" : "Size, brand, how old, why you're selling, where to meet…"}
            maxLength={2000}
            aria-invalid={Boolean(fe.description)}
          />
          {fe.description && <span className="field-error">{fe.description}</span>}
        </div>
      </section>

      <label className="check">
        <input type="checkbox" name="at_market" defaultChecked={initial.at_market} />
        <span>
          <strong>Bring it to the Sunday Market 🧺</strong>
          <br />
          <span className="small text-2">
            Buyers can check it out in person this Sunday on campus. No meetup coordination needed.
          </span>
        </span>
      </label>

      <div className="row">
        <SubmitButton className="btn btn-primary btn-lg" pendingLabel="Saving…" disabled={uploading}>
          {uploading ? "Uploading photos…" : submitLabel}
        </SubmitButton>
      </div>
    </form>
  );
}
