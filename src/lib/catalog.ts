// Marketplace vocabulary shared by pages, forms and validation. Values must
// match the check constraints in supabase/migrations.

export const UNIVERSITY_NAME = "Hult International Business School";

export const CAMPUSES = [
  { id: "boston", name: "Boston", currency: "USD", timezone: "America/New_York" },
  { id: "london", name: "London", currency: "GBP", timezone: "Europe/London" },
  { id: "dubai", name: "Dubai", currency: "AED", timezone: "Asia/Dubai" },
  { id: "san_francisco", name: "San Francisco", currency: "USD", timezone: "America/Los_Angeles" },
] as const;
export type CampusId = (typeof CAMPUSES)[number]["id"];
export const CAMPUS_IDS = CAMPUSES.map((c) => c.id) as [CampusId, ...CampusId[]];

export const CATEGORIES = [
  { id: "clothing", label: "Clothing", emoji: "👕" },
  { id: "books", label: "Books & notes", emoji: "📚" },
  { id: "electronics", label: "Electronics", emoji: "🎧" },
  { id: "furniture", label: "Furniture", emoji: "🪑" },
  { id: "home", label: "Home & kitchen", emoji: "🍳" },
  { id: "tickets", label: "Tickets & events", emoji: "🎟️" },
  { id: "sports", label: "Sports", emoji: "🚲" },
  { id: "beauty", label: "Beauty", emoji: "💄" },
  { id: "other", label: "Other", emoji: "📦" },
] as const;
export type CategoryId = (typeof CATEGORIES)[number]["id"];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id) as [CategoryId, ...CategoryId[]];

export const CONDITIONS = [
  { id: "new", label: "New" },
  { id: "like_new", label: "Like new" },
  { id: "good", label: "Good" },
  { id: "fair", label: "Fair" },
] as const;
export type ConditionId = (typeof CONDITIONS)[number]["id"];
export const CONDITION_IDS = CONDITIONS.map((c) => c.id) as [ConditionId, ...ConditionId[]];

export const KINDS = [
  { id: "sell", label: "For sale" },
  { id: "swap", label: "Swap" },
  { id: "free", label: "Free" },
] as const;
export type KindId = (typeof KINDS)[number]["id"];
export const KIND_IDS = KINDS.map((k) => k.id) as [KindId, ...KindId[]];

export type ListingStatus = "active" | "reserved" | "sold" | "removed";
export type SaleChannel = "meetup" | "sunday_market";

export const MAX_PHOTOS = 6;
export const PHOTO_BUCKET = "listing-photos";

export function campusName(id: string | null | undefined): string {
  return CAMPUSES.find((c) => c.id === id)?.name ?? "Unknown campus";
}

export function campusById(id: string | null | undefined) {
  return CAMPUSES.find((c) => c.id === id);
}

export function categoryOf(id: string) {
  return CATEGORIES.find((c) => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1];
}

export function conditionLabel(id: string): string {
  return CONDITIONS.find((c) => c.id === id)?.label ?? id;
}

export function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

export function listingPriceLabel(l: { kind: string; price_cents: number; currency: string }): string {
  if (l.kind === "free") return "Free";
  if (l.kind === "swap") return "Swap";
  return formatPrice(l.price_cents, l.currency);
}

/** "12", "12.5", "12,50" -> cents. Null if not a valid positive amount. */
export function parsePriceToCents(input: string): number | null {
  const normalized = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return cents > 0 && cents <= 10_000_000 ? cents : null;
}

/** Calendar date (YYYY-MM-DD) in a time zone. */
export function dateInZone(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The upcoming Sunday Market date in the campus time zone (today if it is Sunday). */
export function nextMarketDate(now: Date, timeZone: string): string {
  const today = dateInZone(now, timeZone);
  const d = new Date(`${today}T12:00:00Z`);
  const daysUntilSunday = (7 - d.getUTCDay()) % 7;
  d.setUTCDate(d.getUTCDate() + daysUntilSunday);
  return d.toISOString().slice(0, 10);
}

export function formatMarketDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${isoDate}T12:00:00Z`),
  );
}

export function timeAgo(iso: string, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(iso));
}

export function photoUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${PHOTO_BUCKET}/${path}`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/** Only allow same-site relative redirects ("/x", never "//evil.com"). */
export function safeRedirectPath(value: string | null | undefined, fallback = "/browse"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
