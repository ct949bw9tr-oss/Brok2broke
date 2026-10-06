"use client";

import { useTransition } from "react";
import { setRsvp } from "@/server/actions/market";

export function RsvpButtons({
  campusId,
  date,
  current,
}: {
  campusId: string;
  date: string;
  current: "buyer" | "seller" | null;
}) {
  const [pending, start] = useTransition();
  const choose = (value: "buyer" | "seller" | "none") => start(() => setRsvp(campusId, date, value));

  return (
    <div className="row">
      <button
        type="button"
        className={current === "buyer" ? "btn btn-dark" : "btn"}
        aria-pressed={current === "buyer"}
        disabled={pending}
        onClick={() => choose(current === "buyer" ? "none" : "buyer")}
      >
        {current === "buyer" ? "✓ I'm going to shop" : "🛍️ I'm going to shop"}
      </button>
      <button
        type="button"
        className={current === "seller" ? "btn btn-dark" : "btn"}
        aria-pressed={current === "seller"}
        disabled={pending}
        onClick={() => choose(current === "seller" ? "none" : "seller")}
      >
        {current === "seller" ? "✓ I'm selling" : "💰 I'm selling"}
      </button>
    </div>
  );
}
