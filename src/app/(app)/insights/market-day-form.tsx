"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { formatMarketDate } from "@/lib/catalog";
import { saveMarketDay } from "@/server/actions/market";
import type { MarketDay } from "@/server/queries";

export function MarketDayForm({ campusId, date, day }: { campusId: string; date: string; day: MarketDay | null }) {
  const [state, action] = useActionState(saveMarketDay, undefined);
  return (
    <form action={action} className="form-grid">
      <input type="hidden" name="campus_id" value={campusId} />
      <input type="hidden" name="market_date" value={date} />
      {state?.error && <div className="alert alert-error span-2">{state.error}</div>}
      {state?.saved && <div className="alert alert-success span-2">Saved ✓</div>}
      <div className="field span-2">
        <span className="label">Date</span>
        <strong>{formatMarketDate(date)}</strong>
      </div>
      <div className="field span-2">
        <label className="label" htmlFor="location">
          Location
        </label>
        <input id="location" name="location" className="input" defaultValue={day?.location ?? ""} placeholder="e.g. Ground floor lobby" required />
      </div>
      <div className="field">
        <label className="label" htmlFor="starts_at">
          Starts
        </label>
        <input id="starts_at" name="starts_at" type="time" className="input" defaultValue={day?.starts_at.slice(0, 5) ?? "11:00"} />
      </div>
      <div className="field">
        <label className="label" htmlFor="ends_at">
          Ends
        </label>
        <input id="ends_at" name="ends_at" type="time" className="input" defaultValue={day?.ends_at.slice(0, 5) ?? "15:00"} />
      </div>
      <div className="field span-2">
        <label className="label" htmlFor="notes">
          Notes for students
        </label>
        <input id="notes" name="notes" className="input" defaultValue={day?.notes ?? ""} placeholder="Bring cash or your payment app. Tables provided." />
      </div>
      <label className="check span-2">
        <input type="checkbox" name="cancelled" defaultChecked={day?.cancelled ?? false} />
        <span>Cancel this Sunday&apos;s market</span>
      </label>
      <div className="span-2">
        <SubmitButton className="btn btn-dark" pendingLabel="Saving…">
          Save market details
        </SubmitButton>
      </div>
    </form>
  );
}
