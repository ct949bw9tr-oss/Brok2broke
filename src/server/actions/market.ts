"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { CAMPUS_IDS } from "@/lib/catalog";
import { requireAdmin, requireStudent } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase-server";

const dateSchema = z.iso.date();

export async function setRsvp(campusId: string, marketDate: string, goingAs: "buyer" | "seller" | "none") {
  const { user } = await requireStudent();
  const campus = z.enum(CAMPUS_IDS).parse(campusId);
  const date = dateSchema.parse(marketDate);
  const supabase = await createSupabaseServerClient();

  if (goingAs === "none") {
    await supabase.from("market_rsvps").delete().eq("campus_id", campus).eq("market_date", date).eq("user_id", user.id);
  } else {
    // Update-then-insert instead of upsert: students may only update going_as.
    const going_as = z.enum(["buyer", "seller"]).parse(goingAs);
    const { data: updated, error } = await supabase
      .from("market_rsvps")
      .update({ going_as })
      .eq("campus_id", campus)
      .eq("market_date", date)
      .eq("user_id", user.id)
      .select("user_id");
    if (error) throw new Error("Couldn't save your RSVP.");
    if (!updated?.length) {
      const { error: insertError } = await supabase
        .from("market_rsvps")
        .insert({ campus_id: campus, market_date: date, going_as });
      if (insertError) throw new Error("Couldn't save your RSVP.");
    }
  }
  refresh();
}

export type MarketDayState = { error?: string; saved?: boolean } | undefined;

const marketDaySchema = z.object({
  campus_id: z.enum(CAMPUS_IDS),
  market_date: dateSchema,
  location: z.string().trim().min(2, "Enter a location.").max(120),
  starts_at: z.string().regex(/^\d{2}:\d{2}$/),
  ends_at: z.string().regex(/^\d{2}:\d{2}$/),
  notes: z.string().trim().max(500),
  cancelled: z.boolean(),
});

export async function saveMarketDay(_prev: MarketDayState, formData: FormData): Promise<MarketDayState> {
  await requireAdmin();
  const parsed = marketDaySchema.safeParse({
    campus_id: formData.get("campus_id"),
    market_date: formData.get("market_date"),
    location: formData.get("location") ?? "",
    starts_at: formData.get("starts_at"),
    ends_at: formData.get("ends_at"),
    notes: formData.get("notes") ?? "",
    cancelled: formData.get("cancelled") === "on",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.ends_at <= parsed.data.starts_at) return { error: "End time must be after start time." };
  if (new Date(`${parsed.data.market_date}T12:00:00Z`).getUTCDay() !== 0) return { error: "Markets happen on Sundays." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("market_days")
    .upsert({ ...parsed.data, notes: parsed.data.notes || null }, { onConflict: "campus_id,market_date" });
  if (error) return { error: "Couldn't save the market details." };
  refresh();
  return { saved: true };
}
