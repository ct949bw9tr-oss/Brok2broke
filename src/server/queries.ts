import "server-only";
import { createSupabaseServerClient } from "@/server/db/supabase-server";
import type { ListingStatus } from "@/lib/catalog";

// Read-side queries. All run as the signed-in student, so RLS decides what
// comes back.

export type ListingCard = {
  id: string;
  title: string;
  kind: string;
  price_cents: number;
  currency: string;
  category: string;
  condition: string;
  campus_id: string;
  photos: string[];
  at_market: boolean;
  status: ListingStatus;
  created_at: string;
  seller: { id: string; full_name: string } | null;
};

export type ListingDetail = ListingCard & {
  description: string;
  seller_id: string;
  sold_at: string | null;
  updated_at: string;
  seller: { id: string; full_name: string; program: string | null; campus_id: string | null; created_at: string } | null;
};

const CARD_COLUMNS =
  "id, title, kind, price_cents, currency, category, condition, campus_id, photos, at_market, status, created_at, seller:profiles!listings_seller_id_fkey(id, full_name)";

export type BrowseFilters = {
  campus?: string;
  q?: string;
  category?: string;
  kind?: string;
  market?: boolean;
  sort?: "new" | "price_asc" | "price_desc";
};

/** Strip characters that have meaning in PostgREST filter syntax. */
export function cleanSearch(q: string): string {
  return q.replace(/[,()*%\\:."']/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
}

export async function browseListings(filters: BrowseFilters, limit = 60): Promise<ListingCard[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("listings").select(CARD_COLUMNS).in("status", ["active", "reserved"]);

  if (filters.campus) query = query.eq("campus_id", filters.campus);
  if (filters.category) query = query.eq("category", filters.category);
  if (filters.kind) query = query.eq("kind", filters.kind);
  if (filters.market) query = query.eq("at_market", true);
  const q = filters.q ? cleanSearch(filters.q) : "";
  if (q) query = query.or(`title.ilike."*${q}*",description.ilike."*${q}*"`);

  if (filters.sort === "price_asc") query = query.order("price_cents", { ascending: true });
  else if (filters.sort === "price_desc") query = query.order("price_cents", { ascending: false });
  query = query.order("created_at", { ascending: false }).limit(limit);

  const { data, error } = await query.returns<ListingCard[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getListing(id: string): Promise<ListingDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, title, description, kind, price_cents, currency, category, condition, campus_id, photos, at_market, status, created_at, updated_at, sold_at, seller_id, seller:profiles!listings_seller_id_fkey(id, full_name, program, campus_id, created_at)",
    )
    .eq("id", id)
    .maybeSingle<ListingDetail>();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function listingsBySeller(sellerId: string): Promise<ListingCard[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("listings")
    .select(CARD_COLUMNS)
    .eq("seller_id", sellerId)
    .neq("status", "removed")
    .order("created_at", { ascending: false })
    .returns<ListingCard[]>();
  return data ?? [];
}

export async function savedListings(userId: string): Promise<ListingCard[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("saved_listings")
    .select(`created_at, listing:listings(${CARD_COLUMNS})`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .returns<{ listing: ListingCard | null }[]>();
  return (data ?? []).map((r) => r.listing).filter((l): l is ListingCard => Boolean(l));
}

export async function isSaved(userId: string, listingId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("saved_listings")
    .select("listing_id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("listing_id", listingId);
  return (count ?? 0) > 0;
}

export type ConversationSummary = {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  last_message_at: string;
  buyer_last_read_at: string;
  seller_last_read_at: string;
  listing: { id: string; title: string; photos: string[]; status: ListingStatus; kind: string; price_cents: number; currency: string } | null;
  buyer: { id: string; full_name: string } | null;
  seller: { id: string; full_name: string } | null;
};

const CONVERSATION_COLUMNS =
  "id, listing_id, buyer_id, seller_id, last_message_at, buyer_last_read_at, seller_last_read_at, listing:listings(id, title, photos, status, kind, price_cents, currency), buyer:profiles!conversations_buyer_id_fkey(id, full_name), seller:profiles!conversations_seller_id_fkey(id, full_name)";

export async function myConversations(): Promise<ConversationSummary[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .order("last_message_at", { ascending: false })
    .limit(100)
    .returns<ConversationSummary[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getConversation(id: string): Promise<ConversationSummary | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", id)
    .maybeSingle<ConversationSummary>();
  return data ?? null;
}

export type Message = { id: string; sender_id: string; body: string; created_at: string };

export async function conversationMessages(conversationId: string): Promise<Message[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("messages")
    .select("id, sender_id, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(500)
    .returns<Message[]>();
  return data ?? [];
}

/** Buyers who contacted the seller about a listing (candidates for "sold to"). */
export async function interestedBuyers(listingId: string): Promise<{ id: string; full_name: string }[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("conversations")
    .select("buyer:profiles!conversations_buyer_id_fkey(id, full_name)")
    .eq("listing_id", listingId)
    .returns<{ buyer: { id: string; full_name: string } | null }[]>();
  return (data ?? []).map((r) => r.buyer).filter((b): b is { id: string; full_name: string } => Boolean(b));
}

export async function myConversationForListing(listingId: string, buyerId: string): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("conversations")
    .select("id")
    .eq("listing_id", listingId)
    .eq("buyer_id", buyerId)
    .maybeSingle<{ id: string }>();
  return data?.id ?? null;
}

/** Marks the conversation read for the caller (no-op for non-members). */
export async function markConversationRead(conversationId: string): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.rpc("mark_conversation_read", { p_conversation_id: conversationId });
}

export async function unreadCount(): Promise<number> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("unread_conversation_count");
  return typeof data === "number" ? data : 0;
}

export type MarketDay = {
  id: string;
  campus_id: string;
  market_date: string;
  location: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  cancelled: boolean;
};

export async function getMarketDay(campusId: string, date: string): Promise<MarketDay | null> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("market_days")
    .select("id, campus_id, market_date, location, starts_at, ends_at, notes, cancelled")
    .eq("campus_id", campusId)
    .eq("market_date", date)
    .maybeSingle<MarketDay>();
  return data ?? null;
}

export type Rsvp = { user_id: string; going_as: "buyer" | "seller"; profile: { full_name: string } | null };

export async function marketRsvps(campusId: string, date: string): Promise<Rsvp[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("market_rsvps")
    .select("user_id, going_as, profile:profiles(full_name)")
    .eq("campus_id", campusId)
    .eq("market_date", date)
    .order("created_at", { ascending: true })
    .returns<Rsvp[]>();
  return data ?? [];
}

export type Purchase = {
  id: string;
  price_cents: number;
  currency: string;
  channel: string;
  created_at: string;
  listing: { id: string; title: string; photos: string[] } | null;
};

export async function myPurchases(userId: string): Promise<Purchase[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("transactions")
    .select("id, price_cents, currency, channel, created_at, listing:listings(id, title, photos)")
    .eq("buyer_id", userId)
    .order("created_at", { ascending: false })
    .returns<Purchase[]>();
  return data ?? [];
}

export type ExperimentMetrics = {
  students: number;
  sellers: number;
  buyers: number;
  repeat_buyers: number;
  listings_total: number;
  listings_active: number;
  listings_at_market: number;
  conversations: number;
  transactions: number;
  transactions_at_market: number;
  sell_through_rate: number;
  contact_to_sale_rate: number;
  median_hours_to_sell: number | null;
  gmv: { currency: string; total_cents: number; avg_cents: number; count: number }[];
  by_category: { category: string; listings: number; sold: number }[];
  market_rsvps: number;
  weekly: { week: string; signups: number; listings: number; transactions: number }[];
};

export async function experimentMetrics(campusId?: string): Promise<ExperimentMetrics> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("experiment_metrics", { p_campus_id: campusId ?? null });
  if (error) throw new Error(error.message);
  return data as ExperimentMetrics;
}
