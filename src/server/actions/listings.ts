"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import {
  CAMPUS_IDS,
  CATEGORY_IDS,
  CONDITION_IDS,
  KIND_IDS,
  MAX_PHOTOS,
  parsePriceToCents,
} from "@/lib/catalog";
import { requireStudent } from "@/server/auth/session";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import { myPayoutAccount } from "@/server/queries";
import { getPayments } from "@/server/stripe";

export type ListingFormState = { error?: string; fieldErrors?: Record<string, string> } | undefined;

const uuid = z.uuid();

const listingSchema = z
  .object({
    title: z.string().trim().min(3, "At least 3 characters.").max(80, "Keep it under 80 characters."),
    description: z.string().trim().max(2000, "Keep it under 2000 characters."),
    category: z.enum(CATEGORY_IDS, { error: "Pick a category." }),
    condition: z.enum(CONDITION_IDS, { error: "Pick a condition." }),
    kind: z.enum(KIND_IDS),
    price: z.string(),
    campus_id: z.enum(CAMPUS_IDS, { error: "Pick a campus." }),
    at_market: z.boolean(),
    photos: z.array(z.string().regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/)).max(MAX_PHOTOS),
  })
  .transform((v, ctx) => {
    let price_cents = 0;
    if (v.kind === "sell") {
      const cents = parsePriceToCents(v.price);
      if (cents === null) {
        ctx.addIssue({ code: "custom", path: ["price"], message: "Enter a price, e.g. 15 or 12.50." });
        return z.NEVER;
      }
      price_cents = cents;
    }
    return {
      title: v.title,
      description: v.description,
      category: v.category,
      condition: v.condition,
      kind: v.kind,
      campus_id: v.campus_id,
      at_market: v.at_market,
      photos: v.photos,
      price_cents,
    };
  });

function readListingForm(formData: FormData) {
  return listingSchema.safeParse({
    title: formData.get("title") ?? "",
    description: formData.get("description") ?? "",
    category: formData.get("category"),
    condition: formData.get("condition"),
    kind: formData.get("kind") ?? "sell",
    price: String(formData.get("price") ?? ""),
    campus_id: formData.get("campus_id"),
    at_market: formData.get("at_market") === "on",
    photos: formData.getAll("photos").map(String).filter(Boolean),
  });
}

/**
 * With card payments on, every item for sale must be buyable in the app, so
 * the seller connects their bank first. Free and swap items don't need it.
 */
async function sellerNeedsPayouts(userId: string, kind: string): Promise<boolean> {
  if (kind !== "sell" || !getPayments()) return false;
  return !(await myPayoutAccount(userId))?.ready;
}

const NEEDS_PAYOUTS_ERROR =
  "Connect your bank in “Get paid” before selling, so buyers can pay you by card. Free and swap items don't need it.";

function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    out[key] ??= issue.message;
  }
  return out;
}

export async function createListing(_prev: ListingFormState, formData: FormData): Promise<ListingFormState> {
  const { user } = await requireStudent();
  const parsed = readListingForm(formData);
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  if (parsed.data.photos.some((p) => !p.startsWith(`${user.id}/`))) return { error: "Invalid photo." };
  if (await sellerNeedsPayouts(user.id, parsed.data.kind)) return { error: NEEDS_PAYOUTS_ERROR };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("listings").insert(parsed.data).select("id").single<{ id: string }>();
  if (error || !data) return { error: "Couldn't publish the listing. Try again." };
  redirect(`/listings/${data.id}?new=1`);
}

export async function updateListing(
  listingId: string,
  _prev: ListingFormState,
  formData: FormData,
): Promise<ListingFormState> {
  const { user } = await requireStudent();
  if (!uuid.safeParse(listingId).success) return { error: "Listing not found." };
  const parsed = readListingForm(formData);
  if (!parsed.success) return { error: "Check the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };
  if (parsed.data.photos.some((p) => !p.startsWith(`${user.id}/`))) return { error: "Invalid photo." };
  if (await sellerNeedsPayouts(user.id, parsed.data.kind)) return { error: NEEDS_PAYOUTS_ERROR };

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("listings")
    .update(parsed.data)
    .eq("id", listingId)
    .eq("seller_id", user.id)
    .select("id");
  if (error || !data?.length) return { error: "Couldn't save changes." };
  redirect(`/listings/${listingId}`);
}

const statusSchema = z.enum(["active", "reserved", "removed"]);

export async function setListingStatus(listingId: string, status: string): Promise<void> {
  const { user } = await requireStudent();
  const parsedStatus = statusSchema.parse(status);
  const supabase = await createSupabaseServerClient();
  await supabase.from("listings").update({ status: parsedStatus }).eq("id", uuid.parse(listingId)).eq("seller_id", user.id);
  if (parsedStatus === "removed") redirect("/me");
  refresh();
}

export async function toggleMarket(listingId: string, atMarket: boolean): Promise<void> {
  const { user } = await requireStudent();
  const supabase = await createSupabaseServerClient();
  await supabase.from("listings").update({ at_market: atMarket }).eq("id", uuid.parse(listingId)).eq("seller_id", user.id);
  refresh();
}

export type SoldState = { error?: string } | undefined;

const soldSchema = z.object({
  buyer_id: z.union([z.uuid(), z.literal("")]),
  price: z.string(),
  channel: z.enum(["meetup", "sunday_market"]),
});

export async function markSold(listingId: string, _prev: SoldState, formData: FormData): Promise<SoldState> {
  await requireStudent();
  if (!uuid.safeParse(listingId).success) return { error: "Listing not found." };
  const parsed = soldSchema.safeParse({
    buyer_id: String(formData.get("buyer_id") ?? ""),
    price: String(formData.get("price") ?? "0"),
    channel: formData.get("channel"),
  });
  if (!parsed.success) return { error: "Fill in how the sale happened." };
  const price = parsed.data.price.trim();
  const cents = price === "" || price === "0" ? 0 : parsePriceToCents(price);
  if (cents === null) return { error: "Enter the final price, e.g. 15 or 12.50 (0 for free/swap)." };

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("mark_listing_sold", {
    p_listing_id: listingId,
    p_buyer_id: parsed.data.buyer_id || null,
    p_price_cents: cents,
    p_channel: parsed.data.channel,
  });
  if (error) return { error: "Couldn't mark it as sold. Refresh and try again." };
  redirect(`/listings/${listingId}?sold=1`);
}

export async function toggleSave(listingId: string, save: boolean): Promise<void> {
  await requireStudent();
  const id = uuid.parse(listingId);
  const supabase = await createSupabaseServerClient();
  if (save) await supabase.from("saved_listings").upsert({ listing_id: id }, { ignoreDuplicates: true });
  else await supabase.from("saved_listings").delete().eq("listing_id", id);
  refresh();
}
